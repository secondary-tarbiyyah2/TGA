// Assigns a covering teacher to a specific slot/date. Deployed WITH JWT
// verification: caller must hold manage_academic or be head_teacher/admin
// (re-checked from their own user_roles/user_permissions).
//
// A direct client INSERT into cover_assignments would also be allowed by
// RLS for a manage_academic holder (see 0008's policy), but this goes
// through an Edge Function anyway so the same hard-constraint re-check
// used for manual moves (timetable-move) also applies here: covering a
// lesson must not double-book the covering teacher into another lesson at
// that same date/time, which RLS alone can't express.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

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

  let body: { slot_id?: string; cover_date?: string; covering_teacher_user_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const { slot_id, cover_date, covering_teacher_user_id, reason } = body;
  if (!slot_id || !cover_date || !covering_teacher_user_id) {
    return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  }

  const { data: slot, error: slotErr } = await serviceClient
    .from("timetable_slots")
    .select("id, teacher_user_id, run_id, weekday, start_time, end_time")
    .eq("id", slot_id)
    .single();
  if (slotErr || !slot) return jsonResponse({ ok: false, error: "slot_not_found" }, 404);

  if (covering_teacher_user_id === slot.teacher_user_id) {    return jsonResponse({ ok: false, error: "same_teacher", detail: "The covering teacher can't be the original teacher." }, 400);
  }

  // Does the covering teacher already have another slot at this exact
  // weekday/time in the SAME run (their normal weekly timetable)?
  const { data: conflictSlots } = await serviceClient
    .from("timetable_slots")
    .select("id")
    .eq("run_id", slot.run_id)
    .eq("teacher_user_id", covering_teacher_user_id)
    .eq("weekday", slot.weekday)
    .lt("start_time", slot.end_time)
    .gt("end_time", slot.start_time);
  if (conflictSlots && conflictSlots.length > 0) {
    return jsonResponse({ ok: false, error: "covering_teacher_busy", detail: "That teacher already has a lesson at this time." }, 409);
  }

  // Already covering something else on that date at an overlapping time?
  const { data: existingCovers } = await serviceClient
    .from("cover_assignments")
    .select("id, timetable_slots(weekday, start_time, end_time)")
    .eq("covering_teacher_user_id", covering_teacher_user_id)
    .eq("cover_date", cover_date);
  const overlapsExistingCover = (existingCovers || []).some((c) => {
    const other = c.timetable_slots as unknown as { weekday: number; start_time: string; end_time: string } | null;
    if (!other || other.weekday !== slot.weekday) return false;
    return other.start_time < slot.end_time && slot.start_time < other.end_time;
  });
  if (overlapsExistingCover) {
    return jsonResponse({ ok: false, error: "covering_teacher_already_covering", detail: "That teacher is already covering another lesson at this time." }, 409);
  }

  // Who would have taught it: the (class, subject) teacher in force on that
  // date (migration 0051), falling back to the weekly slot's teacher.
  const { data: effectiveTeacher } = await serviceClient.rpc("lesson_effective_teacher", { p_slot_id: slot_id, p_date: cover_date });
  const originalTeacher = (effectiveTeacher as string | null) || slot.teacher_user_id;

  const { error: insertErr } = await serviceClient.from("cover_assignments").insert({
    slot_id,
    cover_date,
    original_teacher_user_id: originalTeacher,
    covering_teacher_user_id,
    reason: reason || null,
    created_by: userData.user.id,
  });
  if (insertErr) {
    return jsonResponse({ ok: false, error: "db_rejected", detail: insertErr.message }, 409);
  }

  // The dated lesson (if already generated) now has the covering teacher.
  await serviceClient
    .from("lesson_instances")
    .update({ teacher_user_id: covering_teacher_user_id })
    .eq("timetable_slot_id", slot_id)
    .eq("date", cover_date);

  return jsonResponse({ ok: true });
});
