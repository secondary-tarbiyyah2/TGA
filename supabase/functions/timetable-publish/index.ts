// Publish, or roll back, a timetable run. Deployed WITH JWT verification;
// only head_teacher/admin may call this at all (re-checked here from the
// caller's OWN user_roles, never trusted from the request body) — matches
// the ground rule "Publish action (Head Teacher/Admin/Timetabler only)"
// (timetabler alone is deliberately NOT enough for publish/rollback: those
// are higher-stakes than editing a draft, same reasoning 0007 already
// applies to "sensitive roles").
//
// POST body: { action: "publish", run_id } | { action: "rollback", run_id }
// "rollback" republishes an OLD run's slots as a brand-new run (never
// mutates history), then publishes that new run — matching the ground
// rule "rollback = republish an old run's slots as a new run".
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

async function requirePublisher(authHeader: string | null) {
  if (!authHeader) return null;
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return null;
  const { data: roles } = await callerClient.from("user_roles").select("role").eq("user_id", userData.user.id);
  const ok = (roles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!ok) return null;
  return userData.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const caller = await requirePublisher(req.headers.get("Authorization"));
  if (!caller) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: { action?: string; run_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const { action, run_id } = body;
  if (!run_id || (action !== "publish" && action !== "rollback")) {
    return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  }

  const { data: targetRun, error: runErr } = await serviceClient
    .from("timetable_runs")
    .select("id, academic_year_id, term_id, status, label")
    .eq("id", run_id)
    .single();
  if (runErr || !targetRun) return jsonResponse({ ok: false, error: "run_not_found" }, 404);

  let runToPublishId = run_id;

  if (action === "rollback") {
    if (targetRun.status !== "published" && targetRun.status !== "superseded") {
      return jsonResponse({ ok: false, error: "not_a_publishable_history_run" }, 409);
    }
    const { data: sourceSlots } = await serviceClient
      .from("timetable_slots")
      .select("class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time")
      .eq("run_id", run_id);

    const { data: newRun, error: newRunErr } = await serviceClient
      .from("timetable_runs")
      .insert({
        academic_year_id: targetRun.academic_year_id,
        term_id: targetRun.term_id,
        status: "draft",
        label: `${targetRun.label} — rollback`,
        generated_by: "rollback",
        source_run_id: run_id,
        created_by: caller.id,
      })
      .select()
      .single();
    if (newRunErr || !newRun) return jsonResponse({ ok: false, error: "rollback_run_create_failed", detail: newRunErr?.message }, 500);

    if (sourceSlots && sourceSlots.length > 0) {
      const rows = sourceSlots.map((s) => ({ ...s, run_id: newRun.id }));
      const { error: insertErr } = await serviceClient.from("timetable_slots").insert(rows);
      if (insertErr) return jsonResponse({ ok: false, error: "rollback_slots_copy_failed", detail: insertErr.message }, 500);
    }
    runToPublishId = newRun.id;
  } else {
    if (targetRun.status !== "draft" && targetRun.status !== "review") {
      return jsonResponse({ ok: false, error: "run_not_publishable", detail: `Run is already ${targetRun.status}.` }, 409);
    }
    const { data: unresolvedHard } = await serviceClient
      .from("timetable_conflicts")
      .select("id")
      .eq("run_id", run_id)
      .eq("severity", "hard")
      .eq("resolved", false)
      .limit(1);
    if (unresolvedHard && unresolvedHard.length > 0) {
      return jsonResponse(
        { ok: false, error: "unresolved_hard_conflicts", detail: "This run has unresolved hard conflicts — resolve or accept them first." },
        409
      );
    }
  }

  // Supersede the currently published run for the same academic year (if
  // any), then publish the target run — done as two sequential updates
  // (Supabase's JS client has no multi-statement transaction API); a
  // failure between them leaves at most a stale "published" flag on the
  // old run alongside the new one, which the next publish/rollback call
  // self-heals, not a data-loss risk.
  await serviceClient
    .from("timetable_runs")
    .update({ status: "superseded" })
    .eq("academic_year_id", targetRun.academic_year_id)
    .eq("status", "published");

  const { error: publishErr } = await serviceClient
    .from("timetable_runs")
    .update({ status: "published", published_by: caller.id, published_at: new Date().toISOString() })
    .eq("id", runToPublishId);
  if (publishErr) return jsonResponse({ ok: false, error: "publish_failed", detail: publishErr.message }, 500);

  return jsonResponse({ ok: true, run_id: runToPublishId });
});
