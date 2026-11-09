// Sends the "Is it right for us?" summary (/eligibility) as a branded
// email, called right after the client inserts a consented quiz_leads row
// (see src/components/eligibility/FitCheck.tsx's EmailSummary). Public
// function (verify_jwt = false, see supabase/config.toml) since anonymous
// families call this with no session, same pattern as
// book-admissions-call.
//
// Deliberately re-fetches the lead row by id and sends only to the email
// stored on it, never to a client-supplied address: leadId alone isn't a
// secret, so without this a caller could use this function as a relay to
// spam an address of their choosing. The summary content (verdict,
// reasons, live day, fee line, next steps) is accepted from the client
// and HTML-escaped before use: it is exactly what that same browser just
// rendered from published facts (src/lib/fitCheck.ts), and re-deriving it
// here would duplicate that logic for no real security gain.
// The sampleSlots / startingPoints / timezoneFlagText fields are from the
// earlier quiz and are still accepted (and ignored when empty).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashIp, isRateLimited, recordAttempt } from "../_shared/spam.ts";
import { renderSummaryEmail } from "./summaryEmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 60 * 60 * 1000;

function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

/** A failed send frees the lead again so the family can retry. */
async function release(leadId: string) {
  await supabase.from("quiz_leads").update({ pdf_sent_at: null }).eq("id", leadId);
}

type SampleSlot = { weekdayName: string; startLabel: string; endLabel: string; subject: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const leadId = String(body.leadId || "");
  if (!UUID.test(leadId)) return jsonResponse({ ok: false, error: "missing_lead_id" }, 400);

  // Security audit (T20): one email per lead, only for a lead made in the
  // last hour, and a per-IP / per-address limit. Before this, anyone could
  // insert one lead with any address and call this again and again, so the
  // school's sending domain could be used to flood a stranger's inbox.
  // The claim (pdf_sent_at null -> now) is atomic, so two calls at once send once.
  const freshSince = new Date(Date.now() - FRESH_MS).toISOString();
  const { data: lead, error: leadErr } = await supabase
    .from("quiz_leads")
    .update({ pdf_sent_at: new Date().toISOString() })
    .eq("id", leadId)
    .is("pdf_sent_at", null)
    .gte("created_at", freshSince)
    .select("id, email, parent_name")
    .maybeSingle();
  if (leadErr || !lead) return jsonResponse({ ok: false, error: "unknown_lead" }, 404);

  const ipHash = await hashIp(clientIp(req));
  const rateKey = `quiz:${String(lead.email).toLowerCase()}`;
  if (await isRateLimited(supabase, ipHash, rateKey)) {
    await supabase.from("quiz_leads").update({ pdf_sent_at: null }).eq("id", leadId);
    return jsonResponse({ ok: false, error: "rate_limited" }, 429);
  }
  await recordAttempt(supabase, ipHash, rateKey);

  const parentName = lead.parent_name || "";
  const firstName = parentName.trim().split(/\s+/)[0] || "there";
  const yearGroup = String(body.yearGroup || "");
  const sampleSlots = Array.isArray(body.sampleSlots) ? (body.sampleSlots as SampleSlot[]) : [];
  const startingPoints = (body.startingPoints || {}) as { arabic?: string; quran?: string };
  const feeSummary = String(body.feeSummary || "");
  const timezoneFlagText = String(body.timezoneFlagText || "");
  const texts = Array.isArray(body.texts) ? (body.texts as string[]) : [];
  const keyStage = String(body.keyStage || "");
  const liveDayText = String(body.liveDayText || "");
  const timezoneConcern = body.timezoneConcern === true;
  const verdict = String(body.verdict || "");

  // Version 2: the full result, section by section, as the family saw it on the page.
  const summary = body.summary && typeof body.summary === "object" ? (body.summary as Record<string, unknown>) : null;
  if (summary && summary.version === 2) {
    const out = renderSummaryEmail(summary, firstName);
    const sent = await sendEmail({ to: lead.email, toName: parentName || undefined, subject: out.subject, html: emailShell(out.html, out.preheader) });
    if (!sent.ok) {
      console.error("quiz-send-plan: send failed", sent.detail);
      await release(leadId);
      return jsonResponse({ ok: false, error: "send_failed" }, 502);
    }
    return jsonResponse({ ok: true });
  }

  // Older pages send the short form below.
  const sections: string[] = [];

  if (verdict) {
    sections.push(`<h2 style="font-size:18px;margin:16px 0 12px;">${esc(verdict)}</h2>`);
  }

  if (yearGroup) {
    sections.push(`<p style="font-size:14px;margin:0 0 8px;"><strong>${esc(yearGroup)}</strong>${keyStage ? ` · ${esc(keyStage)}` : ""}</p>`);
  }

  if (liveDayText) {
    sections.push(`
      <div style="background:${timezoneConcern ? "#FDECEC" : "#F7F1E3"};border-radius:8px;padding:12px 16px;">
        <p style="font-size:14px;font-weight:bold;margin:0 0 4px;${timezoneConcern ? "color:#7A1F1F;" : ""}">${timezoneConcern ? "Worth talking through first: timing" : "Your live day"}</p>
        <p style="font-size:14px;margin:0;${timezoneConcern ? "color:#7A1F1F;" : ""}">${esc(liveDayText)}</p>
      </div>`);
  }

  if (sampleSlots.length > 0) {
    sections.push(`
      <h2 style="font-size:16px;margin:24px 0 8px;">A sample week for ${esc(yearGroup)}, in your timezone</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${sampleSlots
          .map(
            (s) => `<tr><td style="padding:4px 0;border-bottom:1px solid #eee;">${esc(s.weekdayName)} · ${esc(s.subject)}</td>
              <td style="padding:4px 0;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${esc(s.startLabel)}–${esc(s.endLabel)}</td></tr>`
          )
          .join("")}
      </table>`);
  }

  if (startingPoints.arabic || startingPoints.quran) {
    sections.push(`
      <h2 style="font-size:16px;margin:24px 0 8px;">Where your child would start</h2>
      <ul style="font-size:14px;padding-left:20px;margin:0;">
        ${startingPoints.arabic ? `<li><strong>Arabic:</strong> ${esc(startingPoints.arabic)}</li>` : ""}
        ${startingPoints.quran ? `<li><strong>Qur'an:</strong> ${esc(startingPoints.quran)}</li>` : ""}
      </ul>`);
  }

  for (const t of texts) {
    sections.push(`<p style="font-size:14px;background:#F7F1E3;border-radius:8px;padding:12px 16px;">${esc(t)}</p>`);
  }

  if (timezoneFlagText) {
    sections.push(`
      <div style="background:#FDECEC;border-radius:8px;padding:12px 16px;">
        <p style="font-size:14px;font-weight:bold;margin:0 0 4px;color:#7A1F1F;">Worth talking through first: timing</p>
        <p style="font-size:14px;margin:0;color:#7A1F1F;">${esc(timezoneFlagText)}</p>
      </div>`);
  }

  if (feeSummary) {
    sections.push(`
      <h2 style="font-size:16px;margin:24px 0 8px;">Fees, January to July 2027</h2>
      <p style="font-size:14px;margin:0;">${esc(feeSummary)}</p>`);
  }

  const result = await sendEmail({
    to: lead.email,
    toName: parentName || undefined,
    subject: "Your \"Is it right for us?\" summary from Tarbiyyah Global Academy",
    html: emailShell(`
      <h1 style="font-size:20px;margin:0 0 16px;">Assalamu alaikum ${esc(firstName)},</h1>
      <p style="font-size:14px;">Here is the summary from the "Is it right for us?" check you completed on our website, with the times, fees and dates to hand.</p>
      ${sections.join("")}
      <p style="font-size:14px;margin-top:24px;">A quick summary based on your answers, not an offer of a place. Fees are the published 2026-27 founding-cohort fees; everything else is confirmed with you during admissions.</p>
      <p style="font-size:14px;">Any questions? Just reply to this email, or <a href="https://globalacademy.tarbiyyah.co.uk/book-a-call#book" style="color:#5E4B1E;">book a free 20-minute call</a>, or <a href="https://globalacademy.tarbiyyah.co.uk/open-evening" style="color:#5E4B1E;">register for an open evening</a>.</p>
    `),
  });

  if (!result.ok) {
    console.error("quiz-send-plan: send failed", result.detail);
    await release(leadId);
    return jsonResponse({ ok: false, error: "send_failed" }, 502);
  }

  return jsonResponse({ ok: true });
});
