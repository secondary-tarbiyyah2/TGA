// Starts the "Sync curriculum from the portal" GitHub Actions workflow
// (.github/workflows/sync-curriculum-from-portal.yml) right after a teacher
// saves a unit in the Curriculum planner or a lesson in the Lesson library's
// editor, so the change reaches content/ and the slides, lesson plans and
// syllabus pack are rebuilt without anyone touching GitHub. The workflow also
// runs every hour as a backstop, so a failed or skipped call here only delays
// the rebuild; the save itself has already succeeded in the database.
//
// GitHub keeps at most one waiting run of the workflow (its concurrency
// group), so many saves in a row start one run, not one each.
//
// Deployed WITH JWT verification; the caller's role is re-checked here from
// their own user_roles row (teacher, head_teacher or admin), never trusted
// from the request. Uses the GH_DISPATCH_TOKEN / GH_DISPATCH_REPO Edge
// Function secrets that deploy-supabase.yml already sets for the website
// rebuild trigger (fine-grained PAT, "Actions: Read and write" on this repo).
//
// Quick build (Tafweed T35): when the body carries { lesson_id }, it also starts "Build one
// lesson" (.github/workflows/build-one-lesson.yml) for just that lesson, so the teacher can
// download the new slides and plan within a couple of minutes. The lesson is first marked
// "queued" through curriculum_request_lesson_build, as the caller, which also checks that they
// may edit this lesson (their subject, or Headteacher/Admin).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const ghToken = Deno.env.get("GH_DISPATCH_TOKEN");
const ghRepo = Deno.env.get("GH_DISPATCH_REPO") || "secondary-tarbiyyah2/tga";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function dispatch(workflow: string, inputs: Record<string, string>) {
  const res = await fetch(`https://api.github.com/repos/${ghRepo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });
  // GitHub answers 204 No Content when the run is queued.
  if (res.status === 204) return null;
  const detail = await res.text().catch(() => "");
  return detail.slice(0, 300) || `GitHub returned ${res.status}`;
}

async function requireCurriculumEditor(authHeader: string | null) {
  if (!authHeader) return false;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return false;
  const { data: roles } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  return (roles || []).some((r) => r.role === "teacher" || r.role === "head_teacher" || r.role === "admin");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  if (!(await requireCurriculumEditor(req.headers.get("Authorization")))) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const lessonId = typeof body?.lesson_id === "string" && UUID.test(body.lesson_id) ? body.lesson_id : null;

  // Not set up yet: the save already worked, the hourly run will pick it up.
  if (!ghToken) return jsonResponse({ ok: false, error: "not_configured" }, 200);

  let quick: { ok: boolean; error?: string } | undefined;
  if (lessonId) {
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    const { error } = await callerClient.rpc("curriculum_request_lesson_build", { p_lesson: lessonId });
    if (error) quick = { ok: false, error: /not allowed/.test(error.message) ? "forbidden" : "request_failed" };
    else {
      const failed = await dispatch("build-one-lesson.yml", { lesson_id: lessonId });
      quick = failed ? { ok: false, error: "dispatch_failed" } : { ok: true };
    }
  }

  const failed = await dispatch("sync-curriculum-from-portal.yml", { trigger: "portal" });
  if (failed) return jsonResponse({ ok: false, error: "dispatch_failed", detail: failed, quick }, 200);
  return jsonResponse({ ok: true, quick });
});
