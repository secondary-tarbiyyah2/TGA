// Pause/resume the in-progress recording for a lesson instance. Deployed
// WITH JWT verification: only the class's own teacher/TA-cover, or staff
// with manage_academic/head_teacher/admin, may call this, re-checked
// server-side from the caller's own user_roles/user_permissions, never
// trusted from the request body.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { bbbConfigured, setRecordingStatus, derivePasswords } from "../_shared/bbb.ts";

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

  let body: { lesson_instance_id?: string; action?: "pause" | "resume" };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const { lesson_instance_id: lessonInstanceId, action } = body;
  if (!lessonInstanceId || (action !== "pause" && action !== "resume")) {
    return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);
  }

  const { data: instance, error: instanceErr } = await serviceClient
    .from("lesson_instances")
    .select("id, bbb_meeting_id, bbb_status, timetable_slots(class_id)")
    .eq("id", lessonInstanceId)
    .single();
  if (instanceErr || !instance) return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);
  if (!instance.bbb_meeting_id || instance.bbb_status !== "live") {
    return jsonResponse({ ok: false, error: "meeting_not_live" }, 409);
  }
  const classId = (instance.timetable_slots as unknown as { class_id: string } | null)?.class_id;

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
  const canControl =
    (teacherRoles || []).length > 0 ||
    (perms || []).some((p) => p.permission === "manage_academic") ||
    (staffRoles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!canControl) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { moderatorPassword } = await derivePasswords(instance.bbb_meeting_id);
  const result = await setRecordingStatus({
    meetingId: instance.bbb_meeting_id,
    moderatorPassword,
    recording: action === "resume",
  });
  if (!result.ok) return jsonResponse({ ok: false, error: "bbb_call_failed" }, 502);

  await serviceClient.from("lesson_instances").update({ recording_paused: action === "pause" }).eq("id", lessonInstanceId);
  await serviceClient.from("audit_log").insert({
    actor_id: userId,
    action: action === "pause" ? "RECORDING_PAUSE" : "RECORDING_RESUME",
    target_table: "lesson_instances",
    target_id: lessonInstanceId,
    changes: null,
  });

  return jsonResponse({ ok: true });
});
