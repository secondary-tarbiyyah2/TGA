// Generates lesson_instances rows for every slot of a PUBLISHED timetable
// run, for each date in [from, to] whose weekday matches that slot.
// Idempotent: (timetable_slot_id, date) is unique, so re-running over an
// overlapping range just upserts (no-ops for dates already generated).
// Deployed WITH JWT verification: caller must hold manage_academic or
// timetabler, or be head_teacher/admin.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

function* datesBetween(from: Date, to: Date) {
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) yield new Date(d);
}

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
    (permRows || []).some((p) => p.permission === "manage_academic" || p.permission === "timetabler") ||
    (roleRows || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!canManage) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: { run_id?: string; from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const { run_id: runId, from, to } = body;
  if (!runId || !from || !to) return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
    return jsonResponse({ ok: false, error: "invalid_date_range" }, 400);
  }
  // Cap the range so a mistaken/malicious huge range can't generate an
  // unbounded number of rows in one call.
  const maxDays = 120;
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > maxDays) {
    return jsonResponse({ ok: false, error: "range_too_large", detail: `Max ${maxDays} days per call.` }, 400);
  }

  const { data: run, error: runErr } = await serviceClient.from("timetable_runs").select("id, status").eq("id", runId).single();
  if (runErr || !run) return jsonResponse({ ok: false, error: "run_not_found" }, 404);
  if (run.status !== "published") {
    return jsonResponse({ ok: false, error: "run_not_published", detail: "Lesson instances can only be generated from a published run." }, 400);
  }

  const { data: slots, error: slotsErr } = await serviceClient
    .from("timetable_slots")
    .select("id, weekday")
    .eq("run_id", runId);
  if (slotsErr) return jsonResponse({ ok: false, error: "db_error", detail: slotsErr.message }, 500);

  const rows: { timetable_slot_id: string; date: string }[] = [];
  for (const date of datesBetween(fromDate, toDate)) {
    const weekday = date.getDay();
    for (const slot of slots || []) {
      if (slot.weekday === weekday) {
        rows.push({ timetable_slot_id: slot.id, date: date.toISOString().slice(0, 10) });
      }
    }
  }
  if (rows.length === 0) return jsonResponse({ ok: true, created: 0 });

  const { error: insertErr, count } = await serviceClient
    .from("lesson_instances")
    .upsert(rows, { onConflict: "timetable_slot_id,date", ignoreDuplicates: true, count: "exact" });
  if (insertErr) return jsonResponse({ ok: false, error: "db_error", detail: insertErr.message }, 500);

  return jsonResponse({ ok: true, created: count ?? rows.length });
});
