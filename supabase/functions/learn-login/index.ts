// Login rate-limiting/lockout support for /learn. Deployed WITHOUT JWT
// verification (--no-verify-jwt) since it must be callable before the user
// has a session at all, that's the whole point.
//
// Honest limitation, documented rather than hidden: this function can only
// see attempts a client actually reports to it. A client that skips calling
// "record" bypasses this layer's lockout entirely. The backstop that can't
// be skipped is Supabase Auth's own built-in server-side rate limiting on
// sign-in, which this supplements (account-level lockout + a visible
// login_attempts audit trail) rather than replaces. The real login call
// itself (supabase.auth.signInWithPassword) still goes directly from the
// browser to Supabase Auth, this function only sits either side of it.
//
// Because "record" is unauthenticated and the outcome it reports cannot be
// verified, the lockout is scoped to the (email, IP) pair: five failures
// from one connection lock that connection out of that account, never the
// account itself. Otherwise anyone could post five fake failures and lock
// the Headteacher out from anywhere. One connection may also record at most
// RECORD_CAP attempts per window, so the audit table cannot be flooded.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { hashIp } from "../_shared/spam.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const LOCKOUT_THRESHOLD = 5; // failed attempts
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 15;
const RECORD_CAP = 60; // rows one connection may add per window

function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return hashIp(ip);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || email.length > 254) return jsonResponse({ ok: false, error: "missing_email" }, 400);
  const ip = await ipHash(req);
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();

  if (action === "check") {
    const { data: attempts, error } = await serviceClient
      .from("login_attempts")
      .select("success, attempted_at")
      .eq("email", email)
      .eq("ip_hash", ip)
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(LOCKOUT_THRESHOLD * 3);
    if (error) {
      console.error("learn-login check:", error.message);
      return jsonResponse({ ok: false, error: "check_failed" }, 500);
    }

    // Count only the CONSECUTIVE most-recent failures, a success anywhere
    // in the window resets the count, so one bad guess days apart from
    // genuine sign-ins never accumulates into a lockout.
    let consecutiveFailures = 0;
    for (const a of attempts || []) {
      if (a.success) break;
      consecutiveFailures += 1;
    }

    if (consecutiveFailures >= LOCKOUT_THRESHOLD) {
      const lastAttempt = attempts![0].attempted_at as string;
      const unlocksAt = new Date(new Date(lastAttempt).getTime() + LOCKOUT_DURATION_MINUTES * 60_000);
      if (unlocksAt > new Date()) {
        return jsonResponse({ ok: true, locked: true, retryAfterSeconds: Math.ceil((unlocksAt.getTime() - Date.now()) / 1000) });
      }
    }
    return jsonResponse({ ok: true, locked: false });
  }

  if (action === "record") {
    const success = Boolean(body.success);
    const { count } = await serviceClient
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip)
      .gte("attempted_at", since);
    if ((count ?? 0) >= RECORD_CAP) return jsonResponse({ ok: false, error: "rate_limited" }, 429);
    const { error } = await serviceClient.from("login_attempts").insert({ email, success, ip_hash: ip });
    if (error) {
      console.error("learn-login record:", error.message);
      return jsonResponse({ ok: false, error: "record_failed" }, 500);
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
