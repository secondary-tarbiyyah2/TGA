// Sends an editable admissions update (assessment details, interview
// invitation, offer, payment-proof rejection, decline / waitlist, document request) to the parent of an application and records it
// in admissions_messages. Deployed WITH JWT verification; additionally the
// caller's own user_roles are re-checked here: Headteacher, Admin or
// Admissions only. The recipient address is read from the application row,
// never trusted from the request body. A failed send is never fatal: the log
// row is still written with email_sent=false and the error, and returned.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, emailShell } from "../_shared/resend.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const TEMPLATES = ["assessment_invite", "assessment_details", "interview_invite", "offer", "decline_waitlist", "request_documents", "payment_rejected", "custom"];
const SITE_URL = (Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk").replace(/\/$/, "");
// Replaced with the family's personal proof-of-payment upload link when sent.
const PAYMENT_LINK_TOKEN = "{{PAYMENT_LINK}}";
const ALLOWED = ["head_teacher", "admin", "admissions"];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Plain text -> paragraphs; bare URLs become links.
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

async function requireStaff(authHeader: string | null) {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: roleRows } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  const roles = (roleRows || []).map((r) => r.role as string);
  if (!roles.some((r) => ALLOWED.includes(r))) return null;
  return userData.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const user = await requireStaff(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const applicationId = String(body.applicationId || "");
  const template = String(body.template || "custom");
  const subject = String(body.subject || "").trim();
  const text = String(body.body || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !TEMPLATES.includes(template) || !subject || !text) {
    return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  }
  if (subject.length > 300 || text.length > 20000) return jsonResponse({ ok: false, error: "too_long" }, 400);

  const { data: app, error: appErr } = await serviceClient
    .from("admissions_applications")
    .select("id, reference, parent_name, parent_email")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) return jsonResponse({ ok: false, error: "application_not_found" }, 404);

  // Personal upload link: a fresh random token (only its SHA-256 hash is
  // stored once the email is sent), which switches off any earlier link. The
  // history log keeps the text WITHOUT the secret.
  let token: string | null = null;
  let sendText = text;
  let loggedText = text;
  if (text.includes(PAYMENT_LINK_TOKEN)) {
    if (!app.reference) return jsonResponse({ ok: false, error: "application_has_no_reference" }, 400);
    token = generateToken();
    const link = `${SITE_URL}/admissions/payment?ref=${encodeURIComponent(app.reference as string)}&token=${token}`;
    sendText = text.split(PAYMENT_LINK_TOKEN).join(link);
    loggedText = text.split(PAYMENT_LINK_TOKEN).join("(personal secure upload link sent by email)");
  }

  let emailSent = false;
  let emailError: string | null = null;
  try {
    const result = await sendEmail({
      to: app.parent_email as string,
      toName: app.parent_name as string,
      subject,
      html: emailShell(bodyToHtml(sendText)),
    });
    emailSent = result.ok;
    if (!result.ok) emailError = result.detail;
  } catch (e) {
    emailError = String(e);
  }

  const { data: logged, error: logErr } = await serviceClient
    .from("admissions_messages")
    .insert({
      application_id: applicationId,
      template,
      subject,
      body: loggedText,
      sent_by: user.id,
      email_sent: emailSent,
      email_error: emailError ? emailError.slice(0, 500) : null,
    })
    .select("id, sent_at")
    .single();

  // Activate the new link only once the email has really gone out, so a failed
  // send never kills the family's previous (working) link.
  if (emailSent && token) {
    await serviceClient
      .from("admissions_stage_details")
      .upsert({ application_id: applicationId, payment_token_hash: await hashToken(token), payment_token_created_at: new Date().toISOString() }, { onConflict: "application_id" });
  }

  // Stamp the stage the email belonged to (only when it really went out).
  if (emailSent) {
    const stamp: Record<string, unknown> | null =
      template === "assessment_details" || template === "assessment_invite"
        ? { assessment_emailed_at: new Date().toISOString() }
        : template === "interview_invite"
          ? { interview_emailed_at: new Date().toISOString() }
          : template === "offer"
            ? { offer_emailed_at: new Date().toISOString() }
            : null;
    if (stamp) await serviceClient.from("admissions_stage_details").upsert({ application_id: applicationId, ...stamp }, { onConflict: "application_id" });
  }

  return jsonResponse({
    ok: true,
    emailSent,
    emailError: emailError || undefined,
    messageId: logged?.id,
    logged: !logErr,
    logError: logErr?.message,
  });
});
