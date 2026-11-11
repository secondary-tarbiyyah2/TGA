// Sends the "application received" confirmation the moment a family submits the
// public form (before this, the acknowledgement only went out once staff first
// moved the application on). Deployed WITHOUT JWT verification (--no-verify-jwt):
// the visitor has no account. It is safe to expose because it can only ever
//   * email the address ALREADY stored on the application (never one from the
//     request),
//   * for an application created in the last 30 minutes that is still 'new',
//   * once (a logged 'received' message stops repeats),
//   * with text built from the stored template, the stored names and year
//     groups, and numbers only from the form's fee snapshot.
// A family with several children gets ONE email covering them all (sent for the
// lead application); every sibling application gets a log entry saying so, which
// also stops the portal's own automatic acknowledgement doubling up later.
// Honours the 'received' template's auto-send switch. Never fatal for the form:
// the browser ignores a failure here.
//
// It also emails the admissions inbox (ADMISSIONS_EMAIL) a summary of the new
// application(s): contact details, the pupil's home address (0151) and each
// child, with a link to the portal. Sent once per family whatever the
// auto-send switch (a booking_attempts marker stops repeats).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, emailShell } from "../_shared/resend.ts";
import { DEFAULT_TEMPLATES, buildTemplateContext, renderTemplate, type FamilyInput } from "../admissions-correspond/templating.ts";
import { ROLE_EMAILS } from "../_shared/contacts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || ROLE_EMAILS.admissions;
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 30 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para.trim())
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#5E4B1E;">$1</a>')
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.55;">${html}</p>`;
    })
    .join("");
}

type AppRow = {
  id: string;
  reference: string | null;
  status: string;
  created_at: string;
  family_id: string | null;
  sibling_index: number | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  relationship: string | null;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_town: string | null;
  address_postcode: string | null;
  address_country: string | null;
  child_first_name: string;
  child_dob: string;
  child_last_name: string;
  year_group_applying: string;
  preferred_start: string | null;
  assessment_at: string | null;
  interview_at: string | null;
  offer_deadline: string | null;
  report_received: boolean;
  id_documents_received: boolean;
};

const APP_COLUMNS =
  "id, reference, status, created_at, family_id, sibling_index, parent_name, parent_email, parent_phone, relationship, address, address_line1, address_line2, address_town, address_postcode, address_country, child_first_name, child_last_name, child_dob, year_group_applying, preferred_start, assessment_at, interview_at, offer_deadline, report_received, id_documents_received";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const applicationId = String(body.applicationId || "");
  if (!UUID.test(applicationId)) return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);

  const { data: found } = await serviceClient.from("admissions_applications").select(APP_COLUMNS).eq("id", applicationId).maybeSingle();
  const app = found as AppRow | null;
  if (!app) return jsonResponse({ ok: false, error: "application_not_found" }, 404);
  if (app.status !== "new" || Date.now() - new Date(app.created_at).getTime() > FRESH_MS) return jsonResponse({ ok: true, skipped: "not_fresh" });

  // Everything in the family, lead first.
  let siblings: AppRow[] = [app];
  let snapshot: unknown = null;
  if (app.family_id) {
    const [{ data: rows }, { data: fam }] = await Promise.all([
      serviceClient.from("admissions_applications").select(APP_COLUMNS).eq("family_id", app.family_id).order("sibling_index", { ascending: true }),
      serviceClient.from("admissions_families").select("fee_snapshot").eq("id", app.family_id).maybeSingle(),
    ]);
    const list = (rows as AppRow[] | null) || [];
    if (list.length > 0) siblings = list;
    snapshot = (fam as { fee_snapshot: unknown } | null)?.fee_snapshot ?? null;
  }
  const lead = siblings[0];
  if (lead.id !== app.id) return jsonResponse({ ok: true, skipped: "not_lead" });

  const staffNotified = await notifyAdmissions(lead, siblings);

  const { count } = await serviceClient
    .from("admissions_messages")
    .select("id", { count: "exact", head: true })
    .in("application_id", siblings.map((s) => s.id))
    .eq("template", "received");
  if ((count ?? 0) > 0) return jsonResponse({ ok: true, skipped: "already_sent", staffNotified });

  const { data: row } = await serviceClient.from("admissions_email_templates").select("subject, body, auto_send").eq("key", "received").maybeSingle();
  const tpl = row ? { subject: row.subject as string, body: row.body as string, auto_send: Boolean(row.auto_send) } : DEFAULT_TEMPLATES.received;
  if (!tpl.auto_send) return jsonResponse({ ok: true, skipped: "auto_send_off", staffNotified });

  const [{ data: settings }, { data: stage }] = await Promise.all([
    serviceClient.from("site_settings").select("online_payment_url, payment_instructions, assessment_join_url, interview_join_url, assessment_duration_text, admissions_email, contact_phone").eq("id", true).maybeSingle(),
    serviceClient.from("admissions_stage_details").select("assessment_platform, assessment_link, assessment_duration_text, interview_interviewer, interview_link, offer_start_date").eq("application_id", lead.id).maybeSingle(),
  ]);
  const family: FamilyInput = {
    children: siblings.map((s) => ({ first_name: s.child_first_name, last_name: s.child_last_name, year_group: s.year_group_applying })),
    snapshot,
  };
  const ctx = buildTemplateContext(lead, (settings as never) || null, (stage as never) || null, { family });
  const out = renderTemplate({ subject: tpl.subject, body: tpl.body }, ctx);
  if (out.unresolved.length > 0 || !out.subject || !out.body) return jsonResponse({ ok: false, error: "template_unresolved", unresolved: out.unresolved }, 500);

  let emailSent = false;
  let emailError: string | null = null;
  try {
    const result = await sendEmail({ to: lead.parent_email, toName: lead.parent_name, subject: out.subject, html: emailShell(bodyToHtml(out.body)) });
    emailSent = result.ok;
    if (!result.ok) emailError = result.detail;
  } catch (e) {
    emailError = String(e);
  }

  const failure = emailError ? emailError.slice(0, 500) : null;
  await serviceClient.from("admissions_messages").insert([
    { application_id: lead.id, template: "received", subject: out.subject, body: out.body, sent_by: null, email_sent: emailSent, email_error: failure },
    ...siblings.slice(1).map((s) => ({
      application_id: s.id,
      template: "received",
      subject: out.subject,
      body: `Covered by the confirmation email sent for the whole family (see ${lead.reference || "the first child's application"}).`,
      sent_by: null,
      email_sent: emailSent,
      email_error: failure,
    })),
  ]);

  return jsonResponse({ ok: true, emailSent, staffNotified });
});

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** child_dob (a Postgres date, sent by the form as ISO yyyy-mm-dd) as "14 March 2018". */
function britishDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} ${MONTH_NAMES[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** The pupil's home address, one part per line (or the older one-line address). */
function addressLines(a: AppRow): string[] {
  const parts = [a.address_line1, a.address_line2, a.address_town, a.address_postcode, a.address_country].map((x) => (x || "").trim()).filter(Boolean);
  if (parts.length > 0) return parts;
  return (a.address || "").trim() ? [(a.address || "").trim()] : [];
}

/** One summary email to the admissions inbox per family. Best effort; never throws. */
async function notifyAdmissions(lead: AppRow, siblings: AppRow[]): Promise<boolean> {
  try {
    const marker = `appnotify:${lead.id}`;
    const { count } = await serviceClient.from("booking_attempts").select("id", { count: "exact", head: true }).eq("email", marker);
    if ((count ?? 0) > 0) return false;
    await serviceClient.from("booking_attempts").insert({ ip_hash: "admissions-submitted", email: marker });

    const row = (label: string, value: string) =>
      `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#6b6b6b;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;vertical-align:top;">${value}</td></tr>`;
    const addr = addressLines(lead);
    const children = siblings
      .map((s) => `<li style="margin:0 0 4px;"><strong>${escapeHtml(`${s.child_first_name} ${s.child_last_name}`.trim())}</strong>, ${escapeHtml(s.year_group_applying)}, born ${escapeHtml(britishDate(s.child_dob))}${s.reference ? ` (${escapeHtml(s.reference)})` : ""}</li>`)
      .join("");
    const names = siblings.map((s) => s.child_first_name.trim()).join(", ");
    const subject = `New application${siblings.length > 1 ? "s" : ""}: ${lead.reference || ""} ${names}`.replace(/\s+/g, " ").trim();
    const html = emailShell(
      `<p style="margin:0 0 12px;">A new application was submitted on the website${siblings.length > 1 ? ` for ${siblings.length} children, linked as one family` : ""}.</p>` +
        `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px;">` +
        row("Parent or guardian", `${escapeHtml(lead.parent_name)}${lead.relationship ? ` (${escapeHtml(lead.relationship)})` : ""}`) +
        row("Email", `<a href="mailto:${escapeHtml(lead.parent_email)}" style="color:#5E4B1E;">${escapeHtml(lead.parent_email)}</a>`) +
        row("Phone", escapeHtml(lead.parent_phone)) +
        row("Pupil's home address", addr.length > 0 ? addr.map(escapeHtml).join("<br>") : "Not given") +
        row("Preferred start", escapeHtml(lead.preferred_start || "Not given")) +
        `</table>` +
        `<p style="margin:0 0 6px;"><strong>${siblings.length > 1 ? "Children" : "Child"}</strong></p><ul style="margin:0 0 16px;padding-left:20px;">${children}</ul>` +
        `<p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/admin/admissions" style="color:#B08E45;">Review in Admissions &rarr;</a></p>`,
    );
    const result = await sendEmail({ to: ADMISSIONS_EMAIL, subject, html });
    return result.ok;
  } catch (e) {
    console.error("admissions notification failed", e);
    return false;
  }
}
