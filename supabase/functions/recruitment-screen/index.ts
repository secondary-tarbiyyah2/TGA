// recruitment-screen: the portal's "Screen with AI" for job applications.
// Deployed WITH JWT verification; the caller must be Headteacher or Admin
// (re-checked here with the service role). Advisory only: it writes the AI
// screening onto the application and a line on its timeline, and never
// changes a status or contacts anyone. See _shared/recruitmentScreen.ts.
// It also sends staff-written emails to a candidate from the portal (the
// "Email candidate" and "Unsuccessful" dialogs), so nobody has to copy the
// message into their own mail app.
//
// POST { action: "status" }            -> { ok, configured }
// POST { action: "screen", ids: [..] } -> { ok, results: { [id]: { ok, score?, recommendation?, error? } }, stopped? }
//   ids: up to 5 per call (the portal loops for more). Stops early at the
//   daily AI cap and reports stopped: "ai_daily_limit".
// POST { action: "email", id, subject, message } -> { ok, detail? }
//   Sends the message to the candidate in the school's email layout (from the
//   school mailbox, replies go to the recruitment inbox) and logs it on the
//   application's timeline. error "send_failed" if no provider accepted it.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { screenApplication, screeningConfigured } from "../_shared/recruitmentScreen.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 5;

async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  const me = data?.user;
  if (!me) return null;
  const { data: rows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  return rows && rows.length > 0 ? me.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const me = await callerId(req);
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (body.action === "status") return jsonResponse({ ok: true, configured: screeningConfigured() });

  if (body.action === "email") return await emailCandidate(body, me);

  if (body.action !== "screen") return jsonResponse({ ok: false, error: "invalid_input" }, 400);
  if (!screeningConfigured()) return jsonResponse({ ok: false, error: "ai_not_configured", detail: "AI is not set up yet." }, 503);

  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => UUID.test(x)).slice(0, MAX_IDS);
  if (ids.length === 0) return jsonResponse({ ok: false, error: "invalid_input" }, 400);

  const results: Record<string, { ok: boolean; score?: number; recommendation?: string; error?: string }> = {};
  for (const id of ids) {
    const r = await screenApplication(service, id, me);
    if (r.ok) {
      results[id] = { ok: true, score: r.screening.score, recommendation: r.screening.recommendation };
    } else {
      results[id] = { ok: false, error: r.error };
      if (r.error === "ai_daily_limit") return jsonResponse({ ok: true, results, stopped: "ai_daily_limit" });
    }
  }
  return jsonResponse({ ok: true, results });
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function emailCandidate(body: Record<string, unknown>, me: string): Promise<Response> {
  const id = String(body.id || "");
  const subject = String(body.subject || "").trim().slice(0, 200);
  const message = String(body.message || "").replace(/\r\n/g, "\n").trim().slice(0, 8000);
  if (!UUID.test(id) || !subject || !message) return jsonResponse({ ok: false, error: "invalid_input" }, 400);

  const { data: app } = await service.from("job_applications").select("id, email, first_name, last_name").eq("id", id).maybeSingle();
  if (!app?.email) return jsonResponse({ ok: false, error: "not_found" }, 404);

  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const fullName = `${app.first_name} ${app.last_name}`.trim();
  let sent: { ok: boolean; detail: string };
  try {
    sent = await sendEmail({ to: app.email, toName: fullName, subject, html: emailShell(paragraphs, subject) });
  } catch (e) {
    sent = { ok: false, detail: String(e) };
  }
  if (!sent.ok) return jsonResponse({ ok: false, error: "send_failed", detail: sent.detail.slice(0, 300) });

  await service.from("job_application_events").insert({ application_id: id, kind: "email", body: `Emailed the candidate: ${subject}\n\n${message}`.slice(0, 4000), created_by: me });
  return jsonResponse({ ok: true });
}
