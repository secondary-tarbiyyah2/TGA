// Emails the covering teacher (T30) and the families of a class when a cover
// teacher has been assigned to one of its lessons. Called by the admin "Suggest cover" panel straight
// after timetable-cover succeeds. Deployed WITH JWT verification; the caller
// must hold manage_academic or be head_teacher/admin (re-checked here from
// their own roles/permissions, like timetable-cover).
//
// Idempotent: cover_assignments.teacher_notified_at (0187) and
// families_notified_at (0070) are set once each email has gone out, and a
// second call only sends what hasn't been sent.
//
// POST { slot_id, cover_date }  ->  { ok, emailed, teacherEmailed, already? }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const LEARN_SITE_URL = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type SlotRow = {
  class_id: string;
  start_time: string;
  end_time: string;
  classes: { name: string } | null;
  subjects: { name: string } | null;
};
type EnrolRow = { children: { name: string; parent_user_id: string } | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const [{ data: permRows }, { data: roleRows }] = await Promise.all([
    callerClient.from("user_permissions").select("permission").eq("user_id", userData.user.id),
    callerClient.from("user_roles").select("role").eq("user_id", userData.user.id),
  ]);
  const canManage =
    (permRows || []).some((p) => p.permission === "manage_academic") ||
    (roleRows || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!canManage) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: { slot_id?: string; cover_date?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const { slot_id, cover_date } = body;
  if (!slot_id || !cover_date) return jsonResponse({ ok: false, error: "missing_fields" }, 400);

  const { data: cover } = await serviceClient
    .from("cover_assignments")
    .select("id, original_teacher_user_id, covering_teacher_user_id, families_notified_at, teacher_notified_at")
    .eq("slot_id", slot_id)
    .eq("cover_date", cover_date)
    .maybeSingle();
  if (!cover) return jsonResponse({ ok: false, error: "cover_not_found" }, 404);
  if (cover.families_notified_at && cover.teacher_notified_at) return jsonResponse({ ok: true, emailed: 0, teacherEmailed: false, already: true });

  const { data: slotData } = await serviceClient
    .from("timetable_slots")
    .select("class_id, start_time, end_time, classes(name), subjects(name)")
    .eq("id", slot_id)
    .maybeSingle();
  const slot = slotData as unknown as SlotRow | null;
  if (!slot) return jsonResponse({ ok: false, error: "slot_not_found" }, 404);

  const [{ data: teachers }, { data: enrolData }] = await Promise.all([
    serviceClient.from("profiles").select("id, full_name, email").in("id", [cover.original_teacher_user_id, cover.covering_teacher_user_id]),
    serviceClient.from("enrolments").select("children(name, parent_user_id)").eq("class_id", slot.class_id),
  ]);
  const nameOf = (id: string): string => (teachers || []).find((t) => t.id === id)?.full_name || "a colleague";
  const coverName = nameOf(cover.covering_teacher_user_id);
  const originalName = nameOf(cover.original_teacher_user_id);

  // One email per parent, listing their children in this class.
  const byParent = new Map<string, string[]>();
  for (const e of (enrolData as unknown as EnrolRow[]) || []) {
    if (!e.children) continue;
    byParent.set(e.children.parent_user_id, [...(byParent.get(e.children.parent_user_id) || []), e.children.name]);
  }
  const { data: parentRows } = byParent.size > 0
    ? await serviceClient.from("profiles").select("id, email, full_name").in("id", Array.from(byParent.keys()))
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

  const subject = slot.subjects?.name || "lesson";
  const className = slot.classes?.name || "the class";
  const when = new Date(`${cover_date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`;

  // The covering teacher first: what, when, and where to find it. The reason
  // for the absence is never included (it may be medical).
  let teacherEmailed = false;
  if (!cover.teacher_notified_at) {
    const coverer = (teachers || []).find((t) => t.id === cover.covering_teacher_user_id) as { full_name: string | null; email: string | null } | undefined;
    if (coverer?.email) {
      const html = emailShell(`
        <h2 style="margin:0 0 12px;font-size:18px;">You're covering ${esc(subject)} for ${esc(className)}</h2>
        <p style="margin:0 0 12px;">Assalamu alaikum${coverer.full_name ? ` ${esc(coverer.full_name)}` : ""},</p>
        <p style="margin:0 0 12px;">Please cover <strong>${esc(subject)}</strong> for <strong>${esc(className)}</strong> on <strong>${esc(when)}</strong> (${time}) in place of ${esc(originalName)}.</p>
        <p style="margin:0 0 20px;">The lesson is on your Today page with its register and lesson plan, and it uses the class's usual Teams link.</p>
        <p style="margin:0;"><a href="${LEARN_SITE_URL}/teach/today" style="color:#B08E45;">Open Today &rarr;</a></p>
      `);
      const result = await sendEmail({ to: coverer.email, toName: coverer.full_name || undefined, subject: `Cover: ${subject}, ${className}, ${when}`, html });
      if (result.ok) {
        teacherEmailed = true;
        await serviceClient.from("cover_assignments").update({ teacher_notified_at: new Date().toISOString() }).eq("id", cover.id);
      }
    }
  }
  if (cover.families_notified_at) return jsonResponse({ ok: true, emailed: 0, teacherEmailed });

  let emailed = 0;
  for (const p of (parentRows as { id: string; email: string | null; full_name: string | null }[] | null) || []) {
    if (!p.email) continue;
    const kids = byParent.get(p.id) || [];
    const html = emailShell(`
      <h2 style="margin:0 0 12px;font-size:18px;">A change of teacher for ${esc(subject)}</h2>
      <p style="margin:0 0 12px;">Assalamu alaikum${p.full_name ? ` ${esc(p.full_name)}` : ""},</p>
      <p style="margin:0 0 12px;"><strong>${esc(coverName)}</strong> will teach <strong>${esc(subject)}</strong> for ${esc(className)} on <strong>${esc(when)}</strong> (${time}) instead of ${esc(originalName)}${kids.length ? `, for ${esc(kids.join(" and "))}` : ""}.</p>
      <p style="margin:0 0 20px;">Nothing changes for your child: the lesson is at the same time and the same &ldquo;Join lesson&rdquo; button on their dashboard is used.</p>
      <p style="margin:0;"><a href="${LEARN_SITE_URL}/family/dashboard" style="color:#B08E45;">Open the family dashboard &rarr;</a></p>
    `);
    const result = await sendEmail({ to: p.email, toName: p.full_name || undefined, subject: `${subject}: a change of teacher on ${when}`, html });
    if (result.ok) emailed++;
  }

  // Only mark the families as told if someone actually received the email
  // (or there was nobody to tell), so a failed send can be retried.
  if (emailed > 0 || byParent.size === 0) {
    await serviceClient.from("cover_assignments").update({ families_notified_at: new Date().toISOString() }).eq("id", cover.id);
  }
  return jsonResponse({ ok: true, emailed, teacherEmailed });
});
