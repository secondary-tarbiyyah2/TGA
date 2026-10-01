// Creates/fetches the BBB meeting for a lesson instance and returns a
// role-scoped, signed join URL. Deployed WITH JWT verification. Never
// returns the BBB shared secret, meeting passwords, or an unsigned URL —
// only the final, ready-to-open join link for THIS caller's role.
//
// Role mapping (ground rule: moderator for the teacher, viewer for
// everyone else who may join at all):
//   - the class's assigned teacher/TA-cover -> moderator
//   - staff with manage_academic / head_teacher / admin -> moderator
//     (so an admin can step in in an emergency; still logged)
//   - a parent of an enrolled child, or the enrolled child's own student
//     account -> viewer
// Anyone else gets 403 — RLS on lesson_instances would already have hidden
// the lesson from them client-side, but this is the actual enforcement
// point (see 0009's migration header on why lesson_instances has no client
// write policy: the same reasoning applies to "who may start/join a call").
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { bbbConfigured, ensureMeeting, buildJoinUrl, derivePasswords, type BbbRole } from "../_shared/bbb.ts";

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
  const userId = userData.user.id;

  let body: { lesson_instance_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const lessonInstanceId = body.lesson_instance_id;
  if (!lessonInstanceId) return jsonResponse({ ok: false, error: "missing_lesson_instance_id" }, 400);

  const { data: instance, error: instanceErr } = await serviceClient
    .from("lesson_instances")
    .select("id, date, recording_enabled, timetable_slots(class_id, classes(name, meeting_url, subjects(name)))")
    .eq("id", lessonInstanceId)
    .single();
  if (instanceErr || !instance) return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);

  const classId = (instance.timetable_slots as unknown as { class_id: string } | null)?.class_id;
  if (!classId) return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);

  const [{ data: profile }, { data: teacherRoles }, { data: perms }, { data: staffRoles }, { data: enrolment }, { data: studentAccount }] =
    await Promise.all([
      serviceClient.from("profiles").select("full_name").eq("id", userId).single(),
      serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("scope_type", "class")
        .eq("scope_id", classId)
        .in("role", ["teacher", "teaching_assistant_cover"]),
      serviceClient.from("user_permissions").select("permission").eq("user_id", userId),
      serviceClient.from("user_roles").select("role").eq("user_id", userId).eq("scope_type", "none"),
      serviceClient.from("enrolments").select("child_id, children!inner(parent_user_id)").eq("class_id", classId),
      serviceClient.from("student_accounts").select("child_id").eq("profile_id", userId),
    ]);

  const isClassTeacher = (teacherRoles || []).length > 0;
  const isManageAcademicStaff =
    (perms || []).some((p) => p.permission === "manage_academic") ||
    (staffRoles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  const enrolledChildIds = new Set((enrolment || []).map((e) => e.child_id as string));
  const isParentOfEnrolledChild = (enrolment || []).some(
    (e) => (e.children as unknown as { parent_user_id: string } | null)?.parent_user_id === userId
  );
  const isEnrolledStudent = (studentAccount || []).some((sa) => enrolledChildIds.has(sa.child_id));

  let role: BbbRole;
  if (isClassTeacher || isManageAcademicStaff) role = "moderator";
  else if (isParentOfEnrolledChild || isEnrolledStudent) role = "viewer";
  else return jsonResponse({ ok: false, error: "forbidden" }, 403);

  // No BigBlueButton server yet: fall back to the class's own recurring
  // meeting link (e.g. a Microsoft Teams link) so lessons still run.
  if (!bbbConfigured()) {
    const link = (instance.timetable_slots as unknown as { classes?: { meeting_url?: string | null } })?.classes?.meeting_url;
    if (!link) {
      return jsonResponse(
        {
          ok: false,
          error: "bbb_not_configured",
          detail: "This class has no meeting link yet. Add one (for example a recurring Teams link) in Academic setup, on the class.",
        },
        503
      );
    }
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      action: "LESSON_JOIN",
      target_table: "lesson_instances",
      target_id: lessonInstanceId,
      changes: { role, provider: "class_link" },
    });
    return jsonResponse({ ok: true, joinUrl: link, role, provider: "link" });
  }

  // Deterministic external meeting ID — the lesson instance's own id, so
  // "ensure it exists" is naturally idempotent across repeated joins.
  const meetingId = `lesson-${instance.id}`;
  const { moderatorPassword, attendeePassword } = await derivePasswords(meetingId);

  const meetingName = `${(instance.timetable_slots as unknown as { classes?: { subjects?: { name?: string } } })?.classes?.subjects?.name || "Lesson"} — ${
    (instance.timetable_slots as unknown as { classes?: { name?: string } })?.classes?.name || ""
  }`.trim();

  const ensured = await ensureMeeting({
    meetingId,
    meetingName,
    moderatorPassword,
    attendeePassword,
    recordingEnabled: instance.recording_enabled,
  });
  if (!ensured.ok) {
    return jsonResponse({ ok: false, error: "bbb_create_failed", detail: ensured.detail }, 502);
  }

  await serviceClient
    .from("lesson_instances")
    .update({ bbb_meeting_id: meetingId, bbb_status: "live" })
    .eq("id", lessonInstanceId)
    .is("bbb_meeting_id", null);
  // (only sets it the first time — repeated joins don't need another write;
  // "is bbb_meeting_id null" makes this a harmless no-op afterwards)

  const joinUrl = await buildJoinUrl({
    meetingId,
    fullName: profile?.full_name || "Guest",
    password: role === "moderator" ? moderatorPassword : attendeePassword,
    userId,
  });

  await serviceClient.from("audit_log").insert({
    actor_id: userId,
    action: "LESSON_JOIN",
    target_table: "lesson_instances",
    target_id: lessonInstanceId,
    changes: { role },
  });

  return jsonResponse({ ok: true, joinUrl, role });
});
