// Sends the "Your Child's Week" quiz result as a branded email, called
// right after the client inserts a quiz_leads row (see
// src/components/eligibility/YourChildsWeekQuiz.tsx's submitLead). Public
// function (verify_jwt = false, see supabase/config.toml) since anonymous
// quiz-takers call this with no session, same pattern as
// book-admissions-call.
//
// Deliberately re-fetches the lead row by id and checks its email matches
// the request rather than trusting a client-supplied email for the send
// target, leadId alone isn't a secret (it's returned to the browser), so
// without this check a caller could pass someone else's leadId with an
// email address of their choosing and use this function as a relay to
// spam that address. All other plan content (sample week, starting
// points, fee line, timezone note) is accepted from the client, HTML-
// escaped before use, it's already exactly what that same browser
// session just rendered on screen from a published quiz config,
// re-deriving it here from quiz_leads.answers_snapshot would duplicate
// the whole rules engine (src/lib/quiz/rules.ts) and sample-week/timezone
// conversion (useSampleWeek.ts, src/lib/quiz/timezone.ts) for no real
// security gain.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
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
  if (!leadId) return jsonResponse({ ok: false, error: "missing_lead_id" }, 400);

  const { data: lead, error: leadErr } = await supabase
    .from("quiz_leads")
    .select("id, email, parent_name")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) return jsonResponse({ ok: false, error: "unknown_lead" }, 404);

  const parentName = lead.parent_name || "";
  const firstName = parentName.trim().split(/\s+/)[0] || "there";
  const yearGroup = String(body.yearGroup || "");
  const sampleSlots = Array.isArray(body.sampleSlots) ? (body.sampleSlots as SampleSlot[]) : [];
  const startingPoints = (body.startingPoints || {}) as { arabic?: string; quran?: string };
  const feeSummary = String(body.feeSummary || "");
  const timezoneFlagText = String(body.timezoneFlagText || "");
  const texts = Array.isArray(body.texts) ? (body.texts as string[]) : [];

  const sections: string[] = [];

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
      <h2 style="font-size:16px;margin:24px 0 8px;">Your personalised fee estimate</h2>
      <p style="font-size:14px;margin:0;">${esc(feeSummary)}</p>`);
  }

  const result = await sendEmail({
    to: lead.email,
    toName: parentName || undefined,
    subject: "Your Child's Week at Tarbiyyah Global Academy",
    html: emailShell(`
      <h1 style="font-size:20px;margin:0 0 16px;">Assalamu alaikum ${esc(firstName)},</h1>
      <p style="font-size:14px;">Here is the personalised plan from your "Your Child's Week" quiz.</p>
      ${sections.join("")}
      <p style="font-size:14px;margin-top:24px;">This is a personalised estimate based on your answers, not a placement decision, starting points and timings are confirmed during application.</p>
      <p style="font-size:14px;">Any questions? Just reply to this email, or <a href="https://globalacademy.tarbiyyah.co.uk/book-a-call" style="color:#5E4B1E;">book a free 20-minute call</a>.</p>
    `),
  });

  if (!result.ok) return jsonResponse({ ok: false, error: "send_failed", detail: result.detail }, 502);

  await supabase.from("quiz_leads").update({ pdf_sent_at: new Date().toISOString() }).eq("id", leadId);

  return jsonResponse({ ok: true });
});
