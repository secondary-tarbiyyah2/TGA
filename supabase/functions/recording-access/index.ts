// Two related, deliberately separate actions on ONE recording:
//   mode: "stream" — returns BBB's streaming playback URL (no download) to
//     an enrolled child's parent/student (gated on recording_consents) or
//     the class's teacher/staff with manage_academic. This is the ONLY path
//     most people ever get.
//   mode: "export" — returns BBB's raw file URL. Restricted to Head
//     Teacher/Admin who ALSO hold the can_export_data permission. Every
//     call (both modes) is logged to audit_log with actor + mode, per the
//     ground rule that raw-file access itself must be logged.
// Deployed WITH JWT verification.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { bbbConfigured, listRecordings } from "../_shared/bbb.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  if (!bbbConfigured()) return jsonResponse({ ok: false, error: "bbb_not_configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const userId = userData.user.id;

  let body: { recording_id?: string; mode?: "stream" | "export" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const { recording_id: recordingId, mode } = body;
  if (!recordingId || (mode !== "stream" && mode !== "export")) {
    return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  }

  const { data: recording, error: recErr } = await serviceClient
    .from("lesson_recordings")
    .select("id, bbb_recording_id, status, lesson_instance_id, lesson_instances(timetable_slots(class_id))")
    .eq("id", recordingId)
    .single();
  if (recErr || !recording || recording.status !== "available") {
    return jsonResponse({ ok: false, error: "recording_not_found" }, 404);
  }
  const classId = (recording.lesson_instances as unknown as { timetable_slots?: { class_id: string } } | null)?.timetable_slots?.class_id;

  const [{ data: teacherRoles }, { data: perms }, { data: staffRoles }] = await Promise.all([
    serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("scope_type", "class")
      .eq("scope_id", classId)
      .in("role", ["teacher", "teaching_assistant_cover"]),
    serviceClient.from("user_permissions").select("permission").eq("user_id", userId),
    serviceClient.from("user_roles").select("role").eq("user_id", userId).eq("scope_type", "none"),
  ]);
  const isClassStaff = (teacherRoles || []).length > 0 || (perms || []).some((p) => p.permission === "manage_academic");
  const isHeadTeacherOrAdmin = (staffRoles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  const canExportData = (perms || []).some((p) => p.permission === "can_export_data");

  if (mode === "export") {
    if (!isHeadTeacherOrAdmin || !canExportData) {
      return jsonResponse({ ok: false, error: "forbidden", detail: "Raw recording export requires Headteacher/Admin with the Can export data permission." }, 403);
    }
  } else {
    // stream mode: class staff, headteacher/admin, or a consenting
    // enrolled family member.
    let isConsentingFamily = false;
    if (!isClassStaff && !isHeadTeacherOrAdmin && classId) {
      const [{ data: enrolment }, { data: studentAccount }] = await Promise.all([
        serviceClient.from("enrolments").select("child_id, children!inner(parent_user_id)").eq("class_id", classId),
        serviceClient.from("student_accounts").select("child_id").eq("profile_id", userId),
      ]);
      const enrolledChildIds = new Set((enrolment || []).map((e) => e.child_id as string));
      const myChildIds = new Set([
        ...(enrolment || [])
          .filter((e) => (e.children as unknown as { parent_user_id: string } | null)?.parent_user_id === userId)
          .map((e) => e.child_id as string),
        ...(studentAccount || []).filter((sa) => enrolledChildIds.has(sa.child_id)).map((sa) => sa.child_id as string),
      ]);
      if (myChildIds.size > 0) {
        const { data: consents } = await serviceClient
          .from("recording_consents")
          .select("child_id, given")
          .in("child_id", Array.from(myChildIds));
        isConsentingFamily = (consents || []).some((c) => c.given);
      }
    }
    if (!isClassStaff && !isHeadTeacherOrAdmin && !isConsentingFamily) {
      return jsonResponse({ ok: false, error: "forbidden_or_consent_required" }, 403);
    }
  }

  const bbbRecordings = await listRecordings(recording.bbb_recording_id);
  const match = bbbRecordings.find((r) => r.recordID === recording.bbb_recording_id) || bbbRecordings[0];
  if (!match) return jsonResponse({ ok: false, error: "not_available_on_bbb" }, 502);

  const url = mode === "export" ? match.rawDownloadUrl : match.playbackUrl;
  if (!url) return jsonResponse({ ok: false, error: mode === "export" ? "raw_format_not_published" : "playback_not_ready" }, 409);

  await serviceClient.from("audit_log").insert({
    actor_id: userId,
    action: mode === "export" ? "RECORDING_RAW_EXPORT" : "RECORDING_VIEW",
    target_table: "lesson_recordings",
    target_id: recordingId,
    changes: null,
  });

  return jsonResponse({ ok: true, url, mode });
});
