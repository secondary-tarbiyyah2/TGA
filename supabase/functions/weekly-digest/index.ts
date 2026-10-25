// Friday parent digest: ONE branded email per family covering each child's
// week (attendance, homework, merits, teacher comments) and next week's
// lessons. Idempotent per week: weekly_digest_log (0073) has a unique
// (week_start, parent) row that is claimed BEFORE anything is sent, so a
// re-run, a retry or both of the two cron slots can never double-send.
//
// Deployed with --no-verify-jwt because the scheduled caller is not a user;
// authorisation is done here, in code:
//   * Scheduled run  -- Authorization: Bearer <service-role key>
//                       (.github/workflows/weekly-digest.yml). Body (all optional):
//                       { uk_hour: 15, week_start: "YYYY-MM-DD" }.
//                       `uk_hour` makes the run a no-op unless it is currently
//                       that hour in the UK, so one workflow can carry both the
//                       BST and the GMT cron slots.
//   * Admin tools    -- a signed-in Headteacher/Admin JWT:
//                       { action: "families" }                         list families + this week's status,
//                                                                       year groups and whether it is test data
//                       { action: "preview", parent_user_id }          returns { subject, html }
//                       { action: "test", parent_user_id }             emails the preview to the CALLER only
//                       Previews/tests are never logged and never reach the parent.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { buildDigests, loadFamilies, mondayOf, ukNow, weekFor, type Family } from "../_shared/weeklyDigest.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);

const TIME_BUDGET_MS = 110_000; // stop starting new families after this; the caller re-invokes
const SEND_GAP_MS = 600; // Resend's default limit is 2 requests/second
const CHUNK = 8; // families loaded per batch of queries
const STALE_CLAIM_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A service-role caller: the exact key, or any key the auth admin API accepts. */
async function isServiceCaller(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

async function claim(parentId: string, weekStart: string): Promise<boolean> {
  const { error } = await service.from("weekly_digest_log").insert({ week_start: weekStart, parent_user_id: parentId, status: "sending" });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`claim: ${error.message}`);
  // The slot exists: take it over only if the earlier attempt failed or its run died.
  const now = new Date().toISOString();
  const { data: failed } = await service
    .from("weekly_digest_log")
    .update({ status: "sending", claimed_at: now, detail: null })
    .eq("week_start", weekStart)
    .eq("parent_user_id", parentId)
    .eq("status", "failed")
    .select("id");
  if (failed && failed.length > 0) return true;
  const { data: stale } = await service
    .from("weekly_digest_log")
    .update({ claimed_at: now })
    .eq("week_start", weekStart)
    .eq("parent_user_id", parentId)
    .eq("status", "sending")
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
    .select("id");
  return !!(stale && stale.length > 0);
}

async function runScheduled(body: Record<string, unknown>): Promise<Response> {
  const now = ukNow();
  if (typeof body.uk_hour === "number" && body.uk_hour !== now.hour) {
    return jsonResponse({ ok: true, skipped: "not_the_hour", uk_hour_now: now.hour });
  }
  const week = weekFor(isDate(body.week_start) ? mondayOf(body.week_start) : now.date);

  const { families, optedOut } = await loadFamilies(service, {});
  const { data: logs } = await service.from("weekly_digest_log").select("parent_user_id, status, claimed_at").eq("week_start", week.weekStart);
  const done = new Set<string>();
  for (const l of logs || []) {
    const fresh = Date.now() - new Date(l.claimed_at).getTime() < STALE_CLAIM_MS;
    if (l.status === "sent" || (l.status === "sending" && fresh)) done.add(l.parent_user_id);
  }

  const todo: Family[] = families.filter((f) => !optedOut.has(f.parentId) && !done.has(f.parentId));
  const deadline = Date.now() + TIME_BUDGET_MS;
  const stats = { sent: 0, failed: 0, no_content: 0, opted_out: families.filter((f) => optedOut.has(f.parentId)).length, already_done: done.size };
  let processed = 0;

  for (let i = 0; i < todo.length; i += CHUNK) {
    if (Date.now() > deadline) break;
    const chunk = todo.slice(i, i + CHUNK);
    const digests = await buildDigests(service, chunk, week);
    for (const f of chunk) {
      processed++;
      const d = digests.get(f.parentId);
      if (!d) {
        stats.no_content++;
        continue;
      }
      if (!(await claim(f.parentId, week.weekStart))) continue;
      let ok = false;
      let detail = "";
      try {
        const r = await sendEmail({ to: f.parentEmail, toName: f.parentName || undefined, subject: d.subject, html: d.html });
        ok = r.ok;
        detail = r.detail;
      } catch (e) {
        detail = String((e as Error).message || e);
      }
      await service
        .from("weekly_digest_log")
        .update({ status: ok ? "sent" : "failed", detail: ok ? null : detail.slice(0, 300), sent_at: ok ? new Date().toISOString() : null })
        .eq("week_start", week.weekStart)
        .eq("parent_user_id", f.parentId);
      if (ok) stats.sent++;
      else stats.failed++;
      await sleep(SEND_GAP_MS);
    }
  }

  const remaining = todo.length - processed;
  return jsonResponse({ ok: true, week_start: week.weekStart, ...stats, remaining, partial: remaining > 0 });
}

async function runAdmin(me: { id: string; email?: string }, body: Record<string, unknown>): Promise<Response> {
  const action = String(body.action || "");
  const week = weekFor(ukNow().date);

  if (action === "families") {
    const { families, optedOut } = await loadFamilies(service, { includeTest: true });
    const { data: logs } = await service.from("weekly_digest_log").select("parent_user_id, status, sent_at, detail").eq("week_start", week.weekStart);
    const logBy = new Map((logs || []).map((l) => [l.parent_user_id as string, l]));
    return jsonResponse({
      ok: true,
      week_start: week.weekStart,
      families: families
        .sort((a, b) => a.parentName.localeCompare(b.parentName))
        .map((f) => ({
          parent_user_id: f.parentId,
          parent_name: f.parentName,
          parent_email: f.parentEmail,
          children: f.children.map((c) => c.name),
          children_detail: f.children.map((c) => ({ name: c.name, year_group: c.yearGroup })),
          is_test: f.children.length > 0 && f.children.every((c) => c.isTest),
          opted_out: optedOut.has(f.parentId),
          this_week: (logBy.get(f.parentId)?.status as string | undefined) || null,
          this_week_sent_at: (logBy.get(f.parentId)?.sent_at as string | undefined) || null,
          this_week_detail: (logBy.get(f.parentId)?.detail as string | undefined) || null,
        })),
    });
  }

  if (action === "preview" || action === "test") {
    const parentId = String(body.parent_user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(parentId)) return jsonResponse({ ok: false, error: "missing_parent" }, 400);
    const { families } = await loadFamilies(service, { parentId, includeTest: true });
    const family = families[0];
    if (!family) return jsonResponse({ ok: false, error: "family_not_found" }, 404);
    const digests = await buildDigests(service, [family], week, {
      testBanner: "Test preview for staff -- this was not sent to the family.",
    });
    const d = digests.get(family.parentId);
    if (!d) return jsonResponse({ ok: false, error: "no_content", detail: "None of this family's children are enrolled in a class yet." }, 200);
    if (action === "preview") return jsonResponse({ ok: true, subject: d.subject, html: d.html });

    const { data: profile } = await service.from("profiles").select("email, full_name").eq("id", me.id).maybeSingle();
    const to = profile?.email || me.email;
    if (!to) return jsonResponse({ ok: false, error: "no_email", detail: "Your account has no email address." }, 400);
    const r = await sendEmail({ to, toName: profile?.full_name || undefined, subject: d.subject, html: d.html });
    if (!r.ok) return jsonResponse({ ok: false, error: "send_failed", detail: r.detail }, 502);
    return jsonResponse({ ok: true, sent_to: to, subject: d.subject });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // an empty body is fine for the scheduled call
  }

  try {
    if (token === serviceRoleKey) return await runScheduled(body);

    // A signed-in user? Then they must be Headteacher/Admin.
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await caller.auth.getUser();
    const me = userData?.user;
    if (me) {
      const { data: roles } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
      if (!roles || roles.length === 0) return jsonResponse({ ok: false, error: "forbidden" }, 403);
      return await runAdmin({ id: me.id, email: me.email }, body);
    }

    if (await isServiceCaller(token)) return await runScheduled(body);
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  } catch (e) {
    console.error("weekly-digest failed", (e as Error).message);
    return jsonResponse({ ok: false, error: "digest_failed", detail: (e as Error).message.slice(0, 200) }, 500);
  }
});
