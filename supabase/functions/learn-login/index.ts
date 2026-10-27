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
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const LOCKOUT_THRESHOLD = 5; // failed attempts
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 15;

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  if (!email) return jsonResponse({ ok: false, error: "missing_email" }, 400);

  if (action === "check") {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000).toISOString();
    const { data: attempts, error } = await serviceClient
      .from("login_attempts")
      .select("success, attempted_at")
      .eq("email", email)
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(LOCKOUT_THRESHOLD * 3);
    if (error) return jsonResponse({ ok: false, error: "check_failed", detail: error.message }, 500);

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
    const { error } = await serviceClient.from("login_attempts").insert({ email, success, ip_hash: await ipHash(req) });
    if (error) return jsonResponse({ ok: false, error: "record_failed", detail: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
