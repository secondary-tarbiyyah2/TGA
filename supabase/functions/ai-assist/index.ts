// ai-assist: staff-only AI DRAFTS. Deployed WITH JWT verification, and the
// caller's role is re-checked here with their own token (like the other
// staff functions). Nothing in this function sends anything to a family:
// it returns text that staff edit and send themselves.
//
// POST { task: "status" }
//   -> { ok, configured, daily_limit, can: { report_comment, tarbiyah_note, message_triage } }
// POST { task: "report_comment", first_name, pronoun?, year_group?, subject?, notes,
//        attainment?, effort?, attendance_pct?, homework?, assessment_avg?,
//        recipe_value?, want_recipe_line?, variant?, current_draft? }
//   -> { ok, comment, recipe_line }
// POST { task: "tarbiyah_note", first_name, pronoun?, notes, variant?, current_draft? }
//   -> { ok, note }
// POST { task: "triage_message", thread_id, draft?: boolean }  (see triageThread's modes)
//   -> { ok, triage: { message_id, category, urgency, summary, handler, dsl, cached }, reply }
//      (triage null when the thread has no incoming parent message)
// POST { task: "triage_batch", thread_ids: string[] (max 10) }
//   -> { ok, results: { [thread_id]: triage | null }, stopped? }
//
// Errors: ai_not_configured (503, "AI is not set up yet."), ai_daily_limit
// (429), forbidden (403), invalid_input / input_too_long (400), ai_failed (502).
//
// Privacy: only first names reach the model; contact details are stripped
// from parent messages; no medical or SEND data is read by this function.
// Usage (calls and tokens per UK day and task) goes to public.ai_usage, and
// AI_DAILY_LIMIT (default 500) caps calls per day across all tasks.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaudeJson, isClaudeConfigured } from "../_shared/claude.ts";
import {
  LIMITS,
  buildNotePrompt,
  buildReportPrompt,
  buildTriageContext,
  buildTriagePrompt,
  looksLikeSafeguarding,
  validateNoteInput,
  validateNoteOutput,
  validateReportInput,
  validateReportOutput,
  validateTriageOutput,
  type Task,
  type ThreadMessage,
  type TriageResult,
} from "./prompts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const DAILY_LIMIT = (() => {
  const n = Number(Deno.env.get("AI_DAILY_LIMIT"));
  return Number.isInteger(n) && n >= 0 ? n : 500;
})();

const STAFF = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"];
const WRITERS = ["head_teacher", "admin", "teacher", "teaching_assistant_cover"];

const NOT_SET_UP = { ok: false, error: "ai_not_configured", detail: "AI is not set up yet." };

const callerClient = (auth: string) => createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
type Caller = { id: string; roles: string[]; client: ReturnType<typeof callerClient> };

async function getCaller(req: Request): Promise<Caller | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const client = callerClient(auth);
  const { data } = await client.auth.getUser();
  const me = data?.user;
  if (!me) return null;
  const { data: rows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", STAFF);
  const roles = Array.from(new Set((rows || []).map((r) => r.role as string)));
  return roles.length ? { id: me.id, roles, client } : null;
}

/** Counts one call against today's cap; false when the cap is reached. */
async function reserve(task: Task): Promise<boolean> {
  const { data, error } = await service.rpc("ai_usage_reserve", { p_task: task, p_limit: DAILY_LIMIT });
  if (error) {
    console.error("ai_usage_reserve", error.message);
    return false;
  }
  return data === true;
}

async function addTokens(task: Task, usage?: { input_tokens: number; output_tokens: number }) {
  if (!usage) return;
  const { error } = await service.rpc("ai_usage_add_tokens", { p_task: task, p_input: usage.input_tokens, p_output: usage.output_tokens });
  if (error) console.error("ai_usage_add_tokens", error.message);
}

const LIMIT_REACHED = () => jsonResponse({ ok: false, error: "ai_daily_limit", detail: `The school's AI limit for today (${DAILY_LIMIT} drafts) has been reached. It resets at midnight.` }, 429);
const AI_FAILED = (detail?: string) => jsonResponse({ ok: false, error: "ai_failed", detail: detail || "The AI couldn't write a draft just now. Try again in a moment." }, 502);

/**
 * Logs why a call failed (Supabase → Edge Functions → ai-assist → Logs) and
 * turns a settings problem into words staff can pass on, instead of the same
 * "try again" every time (owner, Nov 2026: "AI isn't working", Tafweed T32).
 * Only staff writers reach the AI tasks, so naming the setting is safe.
 */
function failureDetail(task: string, res: { error?: string; status?: number; detail?: string; model?: string }): string | undefined {
  console.error("ai-assist failed", task, JSON.stringify({ error: res.error, status: res.status, model: res.model, detail: (res.detail || "").slice(0, 300) }));
  const d = (res.detail || "").toLowerCase();
  if (res.status === 401 || res.status === 403) return "The AI provider refused the school's API key. The site admin needs to check ANTHROPIC_API_KEY in the repository secrets, then redeploy.";
  if (res.status === 404 || (res.status === 400 && d.includes("model"))) return `The AI model "${res.model}" isn't available. The site admin needs to check the AI_MODEL setting.`;
  if (d.includes("credit") || d.includes("billing")) return "The school's AI account has run out of credit. The site admin needs to top it up.";
  if (res.error === "rate_limited") return "The AI service is busy. Try again in a minute.";
  if (res.error === "timeout") return "The AI took too long to answer. Try again.";
  return undefined;
}

function ukStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UK time";
}

// ── triage ──────────────────────────────────────────────────────────────

type TriageOut = { message_id: string; category: string; urgency: string; summary: string; handler: string; dsl: boolean; cached: boolean };
type TriageAttempt = { triage: TriageOut | null; reply?: string | null; limit?: boolean; failed?: string; forbidden?: boolean };

/**
 * mode "open":  a member of staff opened the thread. Cached result if there is
 *               one (no call); otherwise one call that classifies AND drafts.
 * mode "draft": they pressed "Draft a reply": always one call with a draft.
 * mode "batch": "Sort my inbox": classify only, skip anything already done.
 */
async function triageThread(caller: Caller, threadId: string, mode: "open" | "draft" | "batch"): Promise<TriageAttempt> {
  // Visible to the caller under the thread's own RLS, or not at all.
  const { data: threadRow } = await caller.client
    .from("message_threads")
    .select("id, kind, child_id, parent_id, teacher_id, staff_a_id, staff_b_id")
    .eq("id", threadId)
    .maybeSingle();
  const thread = threadRow as { id: string; child_id: string | null } | null;
  if (!thread) return { triage: null, forbidden: true };

  const { data: msgRows } = await service
    .from("message_thread_messages")
    .select("id, sender_id, body, created_at, flagged, recalled_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(12);
  const msgs = ((msgRows || []) as { id: string; sender_id: string; body: string; created_at: string; flagged: boolean; recalled_at: string | null }[]).filter((m) => !m.recalled_at).reverse();
  if (!msgs.length) return { triage: null };

  const senderIds = Array.from(new Set(msgs.map((m) => m.sender_id)));
  const { data: roleRows } = await service.from("user_roles").select("user_id, role").in("user_id", senderIds);
  const rolesBy = new Map<string, Set<string>>();
  for (const r of (roleRows || []) as { user_id: string; role: string }[]) (rolesBy.get(r.user_id) || rolesBy.set(r.user_id, new Set()).get(r.user_id)!).add(r.role);
  const isParent = (uid: string) => {
    const rs = rolesBy.get(uid);
    return !!rs && rs.has("parent") && !STAFF.some((s) => rs.has(s));
  };

  const latestIdx = msgs.map((m) => isParent(m.sender_id)).lastIndexOf(true);
  if (latestIdx < 0) return { triage: null };
  const latest = msgs[latestIdx];

  const { data: cachedRow } = await service.from("ai_message_triage").select("message_id, category, urgency, summary, handler").eq("message_id", latest.id).maybeSingle();
  const cached = cachedRow as { message_id: string; category: string; urgency: string; summary: string; handler: string } | null;
  if (cached && mode !== "draft") {
    return { triage: { ...cached, summary: cached.summary || "", handler: cached.handler || "", dsl: cached.category === "safeguarding concern" || !!latest.flagged || looksLikeSafeguarding(latest.body), cached: true } };
  }

  const wantReply = mode !== "batch";
  if (!(await reserve("message_triage"))) return { triage: null, limit: true };

  const [{ data: parentProf }, { data: meProf }, childRes] = await Promise.all([
    service.from("profiles").select("full_name").eq("id", latest.sender_id).maybeSingle(),
    service.from("profiles").select("full_name").eq("id", caller.id).maybeSingle(),
    thread.child_id ? service.from("children").select("name").eq("id", thread.child_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const context = msgs.slice(0, latestIdx + 1).map<ThreadMessage>((m) => ({ from: isParent(m.sender_id) ? "parent" : "school", text: m.body }));
  const ctx = buildTriageContext({
    parentFirstName: (parentProf as { full_name?: string } | null)?.full_name || "",
    staffFirstName: (meProf as { full_name?: string } | null)?.full_name || "",
    childFirstName: (childRes.data as { name?: string } | null)?.name || "",
    messages: context,
    flagged: !!latest.flagged,
    receivedAt: ukStamp(latest.created_at),
    wantReply,
  });
  const p = buildTriagePrompt(ctx);
  const res = await callClaudeJson<TriageResult>({ system: p.system, user: p.user, maxTokens: p.maxTokens, temperature: p.temperature }, (raw) => validateTriageOutput(raw, ctx));
  await addTokens("message_triage", res.usage);
  if (!res.ok) return { triage: null, failed: res.error };

  const t = res.data;
  const { error: upErr } = await service.from("ai_message_triage").upsert(
    { thread_id: threadId, message_id: latest.id, category: t.category, urgency: t.urgency, summary: t.summary, handler: t.handler, model: res.model.slice(0, 80), created_by: caller.id, created_at: new Date().toISOString() },
    { onConflict: "message_id" },
  );
  if (upErr) console.error("ai_message_triage upsert", upErr.message);
  return { triage: { message_id: latest.id, category: t.category, urgency: t.urgency, summary: t.summary, handler: t.handler, dsl: t.dsl, cached: false }, reply: t.reply };
}

// ── handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const text = await req.text();
  if (text.length > LIMITS.requestBytes) return jsonResponse({ ok: false, error: "input_too_long", detail: "That request is too large." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse({ ok: false, error: "invalid_json" }, 400);

  const isWriter = caller.roles.some((r) => WRITERS.includes(r));
  const task = String(body.task || "");

  if (task === "status") {
    return jsonResponse({ ok: true, configured: isClaudeConfigured(), daily_limit: DAILY_LIMIT, can: { report_comment: isWriter, tarbiyah_note: isWriter, message_triage: true } });
  }

  if (!isClaudeConfigured()) return jsonResponse(NOT_SET_UP, 503);

  if (task === "report_comment") {
    if (!isWriter) return jsonResponse({ ok: false, error: "forbidden" }, 403);
    const v = validateReportInput(body);
    if (!v.ok) return jsonResponse(v, 400);
    if (!(await reserve("report_comment"))) return LIMIT_REACHED();
    const p = buildReportPrompt(v.input);
    const res = await callClaudeJson({ system: p.system, user: p.user, maxTokens: p.maxTokens, temperature: p.temperature }, (raw) => validateReportOutput(raw, v.input));
    await addTokens("report_comment", res.usage);
    if (!res.ok) return AI_FAILED(failureDetail("report_comment", res));
    return jsonResponse({ ok: true, comment: res.data.comment, recipe_line: res.data.recipe_line });
  }

  if (task === "tarbiyah_note") {
    if (!isWriter) return jsonResponse({ ok: false, error: "forbidden" }, 403);
    const v = validateNoteInput(body);
    if (!v.ok) return jsonResponse(v, 400);
    if (!(await reserve("tarbiyah_note"))) return LIMIT_REACHED();
    const p = buildNotePrompt(v.input);
    const res = await callClaudeJson({ system: p.system, user: p.user, maxTokens: p.maxTokens, temperature: p.temperature }, validateNoteOutput);
    await addTokens("tarbiyah_note", res.usage);
    if (!res.ok) return AI_FAILED(failureDetail("tarbiyah_note", res));
    return jsonResponse({ ok: true, note: res.data.note });
  }

  if (task === "triage_message") {
    const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(threadId)) return jsonResponse({ ok: false, error: "invalid_input", detail: "Missing thread." }, 400);
    const r = await triageThread(caller, threadId, body.draft === true ? "draft" : "open");
    if (r.forbidden) return jsonResponse({ ok: false, error: "forbidden" }, 403);
    if (r.limit) return LIMIT_REACHED();
    if (r.failed) return AI_FAILED();
    return jsonResponse({ ok: true, triage: r.triage, reply: r.reply ?? null });
  }

  if (task === "triage_batch") {
    const ids = Array.isArray(body.thread_ids) ? (body.thread_ids as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
    if (!ids.length) return jsonResponse({ ok: false, error: "invalid_input", detail: "No conversations to sort." }, 400);
    if (ids.length > LIMITS.batchThreads) return jsonResponse({ ok: false, error: "input_too_long", detail: `Sort up to ${LIMITS.batchThreads} conversations at a time.` }, 400);
    const results: Record<string, TriageOut | null> = {};
    let stopped: string | undefined;
    for (const id of ids) {
      const r = await triageThread(caller, id, "batch");
      if (r.limit) {
        stopped = "ai_daily_limit";
        break;
      }
      results[id] = r.triage;
    }
    return jsonResponse({ ok: true, results, ...(stopped ? { stopped } : {}) });
  }

  return jsonResponse({ ok: false, error: "unknown_task" }, 400);
});
