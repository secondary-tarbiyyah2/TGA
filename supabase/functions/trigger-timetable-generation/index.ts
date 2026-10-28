// Fires the "Generate timetable" GitHub Actions workflow
// (.github/workflows/generate-timetable.yml) via GitHub's workflow_dispatch
// API, so a Headteacher/Admin/Timetabler can start a new draft timetable
// run from a button on /learn/admin/lessons, no GitHub access required
// (reported feedback: "the user explicitly does not want to touch GitHub
// at all"). This function only ever DISPATCHES the workflow; the workflow
// itself still runs on its own time in GitHub Actions using the CP-SAT
// solver against the live Supabase project, and writes its result back to
// timetable_runs/timetable_slots/timetable_conflicts exactly as before, 
// the existing /learn/admin/lessons draft-review UI picks that up once it
// appears, same as it already does for a manually-triggered run. This
// function does not, and cannot, poll GitHub's own run status back to the
// browser (GitHub gives no webhook-free way to do that from an Edge
// Function without also polling); the page instead re-polls
// `timetable_runs` for a new row, which is what actually matters to the
// admin ("did a new draft appear").
//
// Deployed WITH JWT verification: only a caller holding the `timetabler`
// permission or head_teacher/admin may call this at all, re-checked here
// server-side from THEIR OWN user_roles/user_permissions, never trusted
// from the request body. Same requirement, same re-check shape, as
// timetable-move and timetable-cover.
//
// Requires the `GH_DISPATCH_TOKEN` Edge Function secret, the SAME
// fine-grained GitHub PAT already documented in SETUP.md for the Sanity
// publish webhook (repository access: only this repo, permission:
// "Actions: Read and write"). That scope already covers firing
// workflow_dispatch on any workflow in this repo, so this reuses the exact
// same secret rather than asking for a second one, see SETUP.md for the
// one manual step (adding it as an Edge Function secret too; it's already
// a GitHub Actions repo secret from the Sanity webhook setup, but Edge
// Function secrets and GitHub Actions repo secrets are two separate
// stores, so it needs adding in both places).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const ghDispatchToken = Deno.env.get("GH_DISPATCH_TOKEN");
const githubRepo = Deno.env.get("GITHUB_REPOSITORY") || "secondary-tarbiyyah2/TGA";

async function requireTimetableGenerator(authHeader: string | null) {
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

type Body = { academic_year_label?: string; run_label?: string; solver_max_seconds?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const caller = await requireTimetableGenerator(req.headers.get("Authorization"));
  if (!caller) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  if (!ghDispatchToken) {
    return jsonResponse(
      { ok: false, error: "not_configured", detail: "GH_DISPATCH_TOKEN Edge Function secret is not set, see SETUP.md." },
      500
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  // Labels are plain text ("2026-27", "Draft 3"): letters, digits, spaces
  // and a few punctuation marks, bounded in length. The workflow also passes
  // them through environment variables rather than inline, but validating
  // here keeps anything shell-like out of the dispatch entirely.
  const LABEL = /^[A-Za-z0-9 ._\/()&'-]{1,80}$/;
  const academicYearLabel = (body.academic_year_label || "").trim();
  if (!academicYearLabel) {
    return jsonResponse({ ok: false, error: "missing_academic_year_label" }, 400);
  }
  if (!LABEL.test(academicYearLabel)) return jsonResponse({ ok: false, error: "invalid_academic_year_label" }, 400);
  const runLabel = (body.run_label || "").trim();
  if (runLabel && !LABEL.test(runLabel)) return jsonResponse({ ok: false, error: "invalid_run_label" }, 400);
  const maxSeconds = (body.solver_max_seconds || "").trim();
  if (maxSeconds && !/^[0-9]{1,4}$/.test(maxSeconds)) return jsonResponse({ ok: false, error: "invalid_solver_max_seconds" }, 400);

  const inputs: Record<string, string> = { academic_year_label: academicYearLabel };
  if (runLabel) inputs.run_label = runLabel;
  if (maxSeconds) inputs.solver_max_seconds = maxSeconds;

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${githubRepo}/actions/workflows/generate-timetable.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghDispatchToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    }
  );

  // GitHub returns 204 No Content on a successful dispatch, with no run id
  // in the response, there's genuinely nothing more specific to report
  // back than "it was accepted"; the admin sees the actual result once the
  // new draft appears in timetable_runs, same as a manual trigger today.
  if (dispatchRes.status !== 204) {
    const detail = await dispatchRes.text().catch(() => "");
    return jsonResponse({ ok: false, error: "github_dispatch_failed", detail: detail || `GitHub returned ${dispatchRes.status}` }, 502);
  }

  return jsonResponse({ ok: true });
});
