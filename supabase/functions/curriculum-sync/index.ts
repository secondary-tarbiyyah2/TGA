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
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const ghToken = Deno.env.get("GH_DISPATCH_TOKEN");
const ghRepo = Deno.env.get("GH_DISPATCH_REPO") || "secondary-tarbiyyah2/tga";

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

  // Not set up yet: the save already worked, the hourly run will pick it up.
  if (!ghToken) return jsonResponse({ ok: false, error: "not_configured" }, 200);

  const res = await fetch(`https://api.github.com/repos/${ghRepo}/actions/workflows/sync-curriculum-from-portal.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { trigger: "portal" } }),
  });
  // GitHub answers 204 No Content when the run is queued.
  if (res.status !== 204) {
    const detail = await res.text().catch(() => "");
    return jsonResponse({ ok: false, error: "dispatch_failed", detail: detail.slice(0, 300) || `GitHub returned ${res.status}` }, 200);
  }
  return jsonResponse({ ok: true });
});
