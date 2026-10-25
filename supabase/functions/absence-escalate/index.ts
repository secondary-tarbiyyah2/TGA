// Tells the Headteacher and the safeguarding lead(s) that an absence
// follow-up has been escalated. Called by the Absences page straight after
// the case is marked "escalated" (the status, who/when and the note are
// already saved under the caller's own RLS; this only sends the email).
//
// Deployed WITH JWT verification. The caller must be head_teacher/admin
// (the only roles that may write follow-ups, 0049/0098), re-checked here.
// The email names the pupil and the date only: the contact log and any
// note stay in the portal, behind sign-in.
//
// Idempotent: absence_followups.escalation_notified_at (0130) is set once an
// email has gone out, and a second call for the same escalation is a no-op.
//
// POST { followup_id }  ->  { ok, emailed, already? }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Person = { id: string; email: string | null; full_name: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const me = userData?.user;
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  if (!roleRows || roleRows.length === 0) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let followupId = "";
  try {
    const body = await req.json();
    followupId = String(body.followup_id || "");
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(followupId)) return jsonResponse({ ok: false, error: "missing_followup" }, 400);

  const { data: fu } = await service
    .from("absence_followups")
    .select("id, status, absence_date, escalated_at, escalation_notified_at, escalated_by, children(name)")
    .eq("id", followupId)
    .maybeSingle();
  if (!fu) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (fu.status !== "escalated") return jsonResponse({ ok: false, error: "not_escalated", detail: "This follow-up isn't escalated." }, 409);
  if (fu.escalation_notified_at) return jsonResponse({ ok: true, emailed: 0, already: true });

  // The Headteacher(s) and everyone holding the safeguarding_lead permission.
  const [{ data: heads }, { data: dsls }] = await Promise.all([
    service.from("user_roles").select("user_id").eq("role", "head_teacher"),
    service.from("user_permissions").select("user_id").eq("permission", "safeguarding_lead"),
  ]);
  const ids = Array.from(new Set([...(heads || []), ...(dsls || [])].map((r) => r.user_id as string)));
  const { data: people } = ids.length > 0 ? await service.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] as Person[] };
  const { data: byRow } = fu.escalated_by ? await service.from("profiles").select("full_name").eq("id", fu.escalated_by).maybeSingle() : { data: null };

  const child = (Array.isArray(fu.children) ? fu.children[0] : fu.children) as { name: string } | null;
  const childName = child?.name || "A pupil";
  const when = new Date(`${fu.absence_date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const by = byRow?.full_name || "A member of staff";

  let emailed = 0;
  for (const p of (people as Person[] | null) || []) {
    if (!p.email) continue;
    const html = emailShell(`
      <h2 style="margin:0 0 12px;font-size:18px;">An absence follow-up has been escalated to you</h2>
      <p style="margin:0 0 12px;">Assalamu alaikum${p.full_name ? ` ${esc(p.full_name)}` : ""},</p>
      <p style="margin:0 0 12px;"><strong>${esc(by)}</strong> has escalated the follow-up for <strong>${esc(childName)}</strong>, absent on <strong>${esc(when)}</strong>, with no reason from the family yet.</p>
      <p style="margin:0 0 20px;">The contact log and any note are on the Absences page. If you think this is a safeguarding matter, record it through "Report a concern".</p>
      <p style="margin:0;"><a href="${LEARN_SITE_URL}/admin/absences" style="color:#B08E45;">Open Absences &rarr;</a></p>
    `);
    const r = await sendEmail({ to: p.email, toName: p.full_name || undefined, subject: `Absence escalated: ${childName}`, html });
    if (r.ok) emailed++;
  }

  if (emailed > 0) await service.from("absence_followups").update({ escalation_notified_at: new Date().toISOString() }).eq("id", fu.id);
  if (emailed === 0) return jsonResponse({ ok: false, error: "not_emailed", detail: ids.length === 0 ? "No Headteacher or safeguarding lead has an account yet." : "The email couldn't be sent." }, 200);
  return jsonResponse({ ok: true, emailed });
});
