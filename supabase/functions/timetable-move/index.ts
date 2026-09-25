// Server-side re-check + apply for a manual drag-and-drop timetable edit.
// The review UI does an immediate client-side check for instant feedback,
// but per the ground rule "never trust client-only validation", the move
// is only actually saved here — after independently re-verifying it
// against every hard constraint the solver itself enforces, using the
// service-role key so this function (not RLS, not the client) is the
// single source of truth for "is this move allowed".
//
// Deployed WITH JWT verification: only a caller holding the `timetabler`
// permission or head_teacher/admin may call this at all (re-checked here
// server-side from THEIR OWN user_roles/user_permissions, never trusted
// from the request body).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

async function requireTimetabler(authHeader: string | null) {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const [{ data: perms }, { data: roles }] = await Promise.all([
    callerClient.from("user_permissions").select("permission").eq("user_id", userData.user.id),
    callerClient.from("user_roles").select("role").eq("user_id", userData.user.id),
  ]);
  const isTimetabler = (perms || []).some((p) => p.permission === "timetabler");
  const isHeadOrAdmin = (roles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!isTimetabler && !isHeadOrAdmin) return null;
  return userData.user;
}

type MoveBody = {
  slot_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  teacher_user_id?: string; // optional: also reassign the teacher in the same move
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const caller = await requireTimetabler(req.headers.get("Authorization"));
  if (!caller) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: MoveBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const { slot_id, weekday, start_time, end_time } = body;
  if (!slot_id || !weekday || !start_time || !end_time) {
    return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  }
  if (weekday < 1 || weekday > 5) {
    return jsonResponse({ ok: false, error: "invalid_weekday" }, 400);
  }
  if (end_time <= start_time) {
    return jsonResponse({ ok: false, error: "invalid_time_range" }, 400);
  }

  const { data: slot, error: slotErr } = await serviceClient
    .from("timetable_slots")
    .select("id, run_id, class_id, teacher_user_id, virtual_session_id")
    .eq("id", slot_id)
    .single();
  if (slotErr || !slot) return jsonResponse({ ok: false, error: "slot_not_found" }, 404);

  const { data: run } = await serviceClient.from("timetable_runs").select("status").eq("id", slot.run_id).single();
  if (!run || run.status !== "draft") {
    return jsonResponse({ ok: false, error: "run_not_editable", detail: "Only a draft run can be edited manually." }, 409);
  }

  const teacherUserId = body.teacher_user_id || slot.teacher_user_id;

  // Hard-constraint re-check: teacher double-booking, class double-booking,
  // virtual-session double-booking, within the same run, excluding this
  // slot itself. Mirrors the DB's own EXCLUDE constraints exactly, but
  // checked explicitly here first so we can return a plain-language reason
  // instead of a raw constraint-violation error, and re-checked in
  // teacher_availability too (something the DB constraint can't express).
  const overlapsTimeRange = (a_start: string, a_end: string, b_start: string, b_end: string) => a_start < b_end && b_start < a_end;

  const { data: sameRunSlots } = await serviceClient
    .from("timetable_slots")
    .select("id, class_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time")
    .eq("run_id", slot.run_id)
    .eq("weekday", weekday)
    .neq("id", slot_id);

  for (const other of sameRunSlots || []) {
    if (!overlapsTimeRange(start_time, end_time, other.start_time, other.end_time)) continue;
    if (other.teacher_user_id === teacherUserId) {
      return jsonResponse({ ok: false, error: "teacher_double_booked", detail: "That teacher already has a lesson at this time." }, 409);
    }
    if (other.class_id === slot.class_id) {
      return jsonResponse({ ok: false, error: "class_double_booked", detail: "That class already has a lesson at this time." }, 409);
    }
    if (slot.virtual_session_id && other.virtual_session_id === slot.virtual_session_id) {
      return jsonResponse({ ok: false, error: "session_double_booked", detail: "That virtual session is already in use at this time." }, 409);
    }
  }

  // Teacher availability (hard constraint the solver also enforces).
  const { data: academicYearRow } = await serviceClient.from("timetable_runs").select("academic_year_id").eq("id", slot.run_id).single();
  const { data: availability } = await serviceClient
    .from("teacher_availability")
    .select("start_time, end_time")
    .eq("teacher_user_id", teacherUserId)
    .eq("academic_year_id", academicYearRow?.academic_year_id)
    .eq("weekday", weekday);

  const withinAvailability = (availability || []).some((a) => a.start_time <= start_time && a.end_time >= end_time);
  if (!withinAvailability) {
    return jsonResponse({ ok: false, error: "outside_availability", detail: "That teacher isn't available at this time." }, 409);
  }

  // Protected times (e.g. Jumu'ah break).
  const { data: protectedTimes } = await serviceClient
    .from("protected_times")
    .select("start_time, end_time")
    .eq("academic_year_id", academicYearRow?.academic_year_id)
    .eq("weekday", weekday);
  const hitsProtectedTime = (protectedTimes || []).some((p) => overlapsTimeRange(start_time, end_time, p.start_time, p.end_time));
  if (hitsProtectedTime) {
    return jsonResponse({ ok: false, error: "protected_time", detail: "That time is a protected time (e.g. Jumu'ah break)." }, 409);
  }

  const { error: updateErr } = await serviceClient
    .from("timetable_slots")
    .update({ weekday, start_time, end_time, teacher_user_id: teacherUserId })
    .eq("id", slot_id);

  if (updateErr) {
    // The DB's own EXCLUDE constraints are the final backstop even after
    // all the checks above (e.g. a concurrent edit racing this one).
    return jsonResponse({ ok: false, error: "db_rejected", detail: updateErr.message }, 409);
  }

  return jsonResponse({ ok: true });
});
