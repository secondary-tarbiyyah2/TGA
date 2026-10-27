// Hourly safeguarding auto-review sweep (see 0075_safeguarding_reviews_audit_viewer.sql).
//
// 1. Calls safeguarding_run_review_check(), which idempotently opens any
//    review the repeat rules or the "serious concern still open after 24h"
//    rule call for (the repeat rules also fire instantly from a trigger when a
//    concern is logged; this sweep adds the time-based rule).
// 2. Emails the Designated Safeguarding Lead(s) and Headteacher about each
//    review not yet notified, and once more when a review becomes overdue.
//    Each email is claimed in the database BEFORE sending (notified_at /
//    overdue_notified_at) so overlapping runs can never double-send; if the
//    send fails the claim is released so the next run retries.
//
// The email deliberately contains NO pupil name and NO concern content - only
// that a review is required, why in generic terms, and when it is due. Email
// is not a secure channel; the detail lives behind the signed-in safeguarding
// page, which only the Safeguarding Lead / Headteacher can open.
//
// Scheduled (.github/workflows/safeguarding-review-check.yml), so deployed
// with --no-verify-jwt like the other scheduled functions. It takes no input
// and is idempotent, so an unauthenticated call can do no harm beyond running
// the same sweep early.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isServiceCaller } from "../_shared/auth.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const LEARN_SITE_URL = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Recipient = { email: string; name: string | null };
type ReviewRow = { id: string; rule: string; reason: string; due_at: string; opened_at: string };

const RULE_TEXT: Record<string, string> = {
  repeat_30d: "Repeated concerns within 30 days",
  repeat_90d: "Repeated concerns within 90 days",
  serious_open_24h: "A serious concern has stayed open for over 24 hours",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
}

async function getRecipients(): Promise<Recipient[]> {
  const found = new Map<string, Recipient>();
  const add = (p: { email: string | null; full_name: string | null } | null) => {
    if (p?.email) found.set(p.email.toLowerCase(), { email: p.email, name: p.full_name });
  };

  const { data: leads } = await supabase
    .from("user_permissions")
    .select("profiles(email, full_name)")
    .eq("permission", "safeguarding_lead");
  for (const l of (leads || []) as unknown as { profiles: { email: string | null; full_name: string | null } | null }[]) add(l.profiles);

  const { data: heads } = await supabase
    .from("user_roles")
    .select("profiles(email, full_name)")
    .eq("role", "head_teacher");
  for (const h of (heads || []) as unknown as { profiles: { email: string | null; full_name: string | null } | null }[]) add(h.profiles);

  return [...found.values()];
}

async function sendToAll(recipients: Recipient[], subject: string, html: string): Promise<boolean> {
  let anyOk = false;
  for (const r of recipients) {
    const res = await sendEmail({ to: r.email, toName: r.name || undefined, subject, html });
    if (res.ok) anyOk = true;
  }
  return anyOk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  // Scheduled job: only the scheduler (service-role key) may run it.
  if (!(await isServiceCaller(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: opened, error: sweepErr } = await supabase.rpc("safeguarding_run_review_check");
  if (sweepErr) return jsonResponse({ ok: false, error: "sweep_failed", detail: sweepErr.message }, 500);

  const recipients = await getRecipients();
  let notified = 0;
  let overdueNotified = 0;

  // New reviews. Claim first (notified_at is null -> now), then send.
  const { data: fresh } = await supabase
    .from("safeguarding_reviews")
    .select("id, rule, reason, due_at, opened_at")
    .is("notified_at", null)
    .neq("status", "completed")
    .order("opened_at", { ascending: true })
    .limit(50);

  for (const review of (fresh || []) as ReviewRow[]) {
    const { data: claimed } = await supabase
      .from("safeguarding_reviews")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", review.id)
      .is("notified_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue; // another run took it

    if (recipients.length === 0) continue; // nobody to tell; stays claimed so it is not retried forever, the dashboard still shows it

    const html = emailShell(`
      <h2 style="margin:0 0 12px;font-size:18px;">A safeguarding review is required</h2>
      <p style="margin:0 0 12px;">${RULE_TEXT[review.rule] || "A review has been triggered"}. A review item has been opened for the Designated Safeguarding Lead.</p>
      <p style="margin:0 0 12px;"><strong>Due:</strong> ${fmt(review.due_at)} (UK time)</p>
      <p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/admin/compliance" style="color:#B08E45;">Open the review in Compliance &rarr;</a></p>
      <p style="margin:0;font-size:12px;color:#777;">For security this email names no pupil and gives no details of the concerns. Sign in to see them.</p>
    `);
    const ok = await sendToAll(recipients, "Safeguarding review required", html);
    if (ok) {
      notified++;
    } else {
      await supabase.from("safeguarding_reviews").update({ notified_at: null }).eq("id", review.id); // retry next run
    }
  }

  // Overdue reminders.
  const { data: late } = await supabase
    .from("safeguarding_reviews")
    .select("id, rule, reason, due_at, opened_at")
    .is("overdue_notified_at", null)
    .neq("status", "completed")
    .lt("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(50);

  for (const review of (late || []) as ReviewRow[]) {
    const { data: claimed } = await supabase
      .from("safeguarding_reviews")
      .update({ overdue_notified_at: new Date().toISOString() })
      .eq("id", review.id)
      .is("overdue_notified_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    if (recipients.length === 0) continue;

    const html = emailShell(`
      <h2 style="margin:0 0 12px;font-size:18px;color:#B00020;">A safeguarding review is OVERDUE</h2>
      <p style="margin:0 0 12px;">${RULE_TEXT[review.rule] || "A review"} - the review was due ${fmt(review.due_at)} (UK time) and has not been completed.</p>
      <p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/admin/compliance" style="color:#B08E45;">Open the review in Compliance &rarr;</a></p>
      <p style="margin:0;font-size:12px;color:#777;">For security this email names no pupil and gives no details of the concerns.</p>
    `);
    const ok = await sendToAll(recipients, "OVERDUE: safeguarding review", html);
    if (ok) overdueNotified++;
    else await supabase.from("safeguarding_reviews").update({ overdue_notified_at: null }).eq("id", review.id);
  }

  return jsonResponse({ ok: true, opened: typeof opened === "number" ? opened : 0, notified, overdueNotified });
});
