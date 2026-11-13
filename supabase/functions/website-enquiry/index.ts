// Website enquiries (the "Register interest / ask a question" form).
//
// Replaces public/register.php for hosts that cannot run PHP (Cloudflare
// Pages, docs/cloudflare-hosting.md). The site still posts to /register.php;
// on Cloudflare that address is a Pages Function (cloudflare/main/functions/
// register.php.js) that forwards the JSON body here. Same rules as the PHP:
// honeypot ("company"), the same required fields, a rate limit per IP and
// per email (booking_attempts, as careers-apply), an email to the admissions
// inbox and a thank-you email to the parent.
//
// Deployed with verify_jwt = false (supabase/config.toml): parents are not
// signed in.
//
// POST JSON { parent_name, email, phone, yeargroup, consent, timezone,
//             message, lead_ref, enquiry: "interest"|"question"|"current", company }
//  -> { ok: true } | { ok: false, error: "validation", fields } | { ok: false, error: "rate_limited" | "send_failed" }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashIp, isRateLimited, recordAttempt } from "../_shared/spam.ts";
import { ROLE_EMAILS } from "../_shared/contacts.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const INBOX = Deno.env.get("ADMISSIONS_EMAIL") || ROLE_EMAILS.admissions;
const SITE = "Tarbiyyah Global Academy";
const LABEL: Record<string, string> = { interest: "Register interest", question: "General question", current: "Current family" };

const clean = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 500);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const para = (text: string) => text.split("\n\n").map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

function clientIp(req: Request): string {
  // The Cloudflare Pages Function passes the visitor's address on; otherwise the gateway's view.
  return (req.headers.get("x-tga-client-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "validation", fields: ["body"] }, 400);
  }
  if (clean(body.company)) return jsonResponse({ ok: true });

  const parentName = clean(body.parent_name);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  let yeargroup = clean(body.yeargroup);
  const consent = clean(body.consent);
  const timezone = clean(body.timezone);
  const message = String(body.message ?? "").trim().slice(0, 5000);
  const leadRef = clean(body.lead_ref);
  const enquiry = ["interest", "question", "current"].includes(clean(body.enquiry)) ? clean(body.enquiry) : "interest";

  const errors: string[] = [];
  if (!parentName) errors.push("parent_name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if ((phone.match(/\d/g) || []).length < 7) errors.push("phone");
  if (enquiry === "interest" && !yeargroup) errors.push("yeargroup");
  if (enquiry !== "interest" && !message) errors.push("message");
  if (!consent) errors.push("consent");
  if (errors.length) return jsonResponse({ ok: false, error: "validation", fields: errors }, 400);
  if (!yeargroup) yeargroup = "Not given";

  const ipHash = await hashIp(clientIp(req));
  const rateKey = `enquiry:${email}`;
  if (await isRateLimited(supabase, ipHash, rateKey)) return jsonResponse({ ok: false, error: "rate_limited" }, 429);
  await recordAttempt(supabase, ipHash, rateKey);

  const label = LABEL[enquiry];
  const subject = `${label}: ${parentName}${enquiry === "interest" ? ` (${yeargroup})` : ""}`;
  const text = [
    `A new enquiry (${label}) was submitted on ${SITE}.`,
    "",
    `Parent/guardian: ${parentName}\nEmail: ${email}\nPhone: ${phone}\nYear group: ${yeargroup}\nTime zone: ${timezone || "(not detected)"}\nLead reference: ${leadRef || "(none)"} (the same reference on a later application from this email means the same family)`,
    "",
    `Message: ${message || "(none)"}`,
  ].join("\n");
  const sent = await sendEmail({ to: INBOX, toName: SITE, subject, html: emailShell(para(text)) });
  if (!sent.ok) {
    console.error("website-enquiry: inbox email failed", sent.detail);
    return jsonResponse({ ok: false, error: "send_failed" }, 502);
  }

  const first = parentName.split(" ")[0];
  const ack = [
    `Assalamu alaikum${first ? ` ${first}` : ""},`,
    enquiry === "interest"
      ? `Thank you for registering your interest in ${SITE}. We have received your details and will be in touch as places open.`
      : `Thank you for your message to ${SITE}. We have received it and will reply within one working day.`,
    `If you have any questions in the meantime, you can reach us at ${INBOX}.`,
    `Warm regards,\n${SITE}\nPart of the Tarbiyyah Education Trust`,
  ].join("\n\n");
  const ackRes = await sendEmail({
    to: email,
    toName: parentName,
    subject: enquiry === "interest" ? `Thank you for registering your interest: ${SITE}` : `We have your message: ${SITE}`,
    html: emailShell(para(ack)),
  });
  if (!ackRes.ok) console.error("website-enquiry: acknowledgement failed", ackRes.detail);

  return jsonResponse({ ok: true });
});
