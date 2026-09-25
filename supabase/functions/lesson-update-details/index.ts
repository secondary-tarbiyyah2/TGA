// Lets a lesson's own teacher/TA-cover (or staff with manage_academic) edit
// its objectives and resource links. Deployed WITH JWT verification. A
// dedicated Edge Function rather than a direct RLS write policy because
// lesson_instances also carries BBB fields (bbb_status, bbb_meeting_id,
// recording_paused) that must NEVER be client-writable, and Postgres RLS
// can't restrict individual columns within one UPDATE policy — see
// 0009_lessons_attendance.sql's comment on this table.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const MAX_OBJECTIVES_LENGTH = 4000;
const MAX_RESOURCES = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const userId = userData.user.id;

  let body: { lesson_instance_id?: string; objectives?: string; resources?: { label: string; url: string }[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const { lesson_instance_id: lessonInstanceId, objectives, resources } = body;
  if (!lessonInstanceId) return jsonResponse({ ok: false, error: "missing_lesson_instance_id" }, 400);
  if (objectives !== undefined && (typeof objectives !== "string" || objectives.length > MAX_OBJECTIVES_LENGTH)) {
    return jsonResponse({ ok: false, error: "invalid_objectives" }, 400);
  }
  if (resources !== undefined) {
    if (!Array.isArray(resources) || resources.length > MAX_RESOURCES) return jsonResponse({ ok: false, error: "invalid_resources" }, 400);
    for (const r of resources) {
      if (typeof r?.label !== "string" || typeof r?.url !== "string" || !r.url.trim()) {
        return jsonResponse({ ok: false, error: "invalid_resource_entry" }, 400);
      }
      try {
        const parsed = new URL(r.url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
      } catch {
        return jsonResponse({ ok: false, error: "invalid_resource_url", detail: r.url }, 400);
      }
    }
  }

  const { data: instance, error: instanceErr } = await serviceClient
    .from("lesson_instances")
    .select("id, timetable_slots(class_id)")
    .eq("id", lessonInstanceId)
    .single();
  if (instanceErr || !instance) return jsonResponse({ ok: false, error: "lesson_not_found" }, 404);
  const classId = (instance.timetable_slots as unknown as { class_id: string } | null)?.class_id;

  const [{ data: teacherRoles }, { data: perms }] = await Promise.all([
    serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("scope_type", "class")
      .eq("scope_id", classId)
      .in("role", ["teacher", "teaching_assistant_cover"]),
    serviceClient.from("user_permissions").select("permission").eq("user_id", userId),
  ]);
  const canEdit = (teacherRoles || []).length > 0 || (perms || []).some((p) => p.permission === "manage_academic");
  if (!canEdit) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const update: Record<string, unknown> = {};
  if (objectives !== undefined) update.objectives = objectives;
  if (resources !== undefined) update.resources = resources;
  if (Object.keys(update).length === 0) return jsonResponse({ ok: false, error: "nothing_to_update" }, 400);

  const { error: updateErr } = await serviceClient.from("lesson_instances").update(update).eq("id", lessonInstanceId);
  if (updateErr) return jsonResponse({ ok: false, error: "db_error", detail: updateErr.message }, 500);

  return jsonResponse({ ok: true });
});
