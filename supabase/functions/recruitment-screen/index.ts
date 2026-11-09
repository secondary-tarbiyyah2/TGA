// recruitment-screen: the portal's "Screen with AI" for job applications.
// Deployed WITH JWT verification; the caller must be Headteacher or Admin
// (re-checked here with the service role). Advisory only: it writes the AI
// screening onto the application and a line on its timeline, and never
// changes a status or contacts anyone. See _shared/recruitmentScreen.ts.
//
// POST { action: "status" }            -> { ok, configured }
// POST { action: "screen", ids: [..] } -> { ok, results: { [id]: { ok, score?, recommendation?, error? } }, stopped? }
//   ids: up to 5 per call (the portal loops for more). Stops early at the
//   daily AI cap and reports stopped: "ai_daily_limit".
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { screenApplication, screeningConfigured } from "../_shared/recruitmentScreen.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 5;

async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  const me = data?.user;
  if (!me) return null;
  const { data: rows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  return rows && rows.length > 0 ? me.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const me = await callerId(req);
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (body.action === "status") return jsonResponse({ ok: true, configured: screeningConfigured() });

  if (body.action !== "screen") return jsonResponse({ ok: false, error: "invalid_input" }, 400);
  if (!screeningConfigured()) return jsonResponse({ ok: false, error: "ai_not_configured", detail: "AI is not set up yet." }, 503);

  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => UUID.test(x)).slice(0, MAX_IDS);
  if (ids.length === 0) return jsonResponse({ ok: false, error: "invalid_input" }, 400);

  const results: Record<string, { ok: boolean; score?: number; recommendation?: string; error?: string }> = {};
  for (const id of ids) {
    const r = await screenApplication(service, id, me);
    if (r.ok) {
      results[id] = { ok: true, score: r.screening.score, recommendation: r.screening.recommendation };
    } else {
      results[id] = { ok: false, error: r.error };
      if (r.error === "ai_daily_limit") return jsonResponse({ ok: true, results, stopped: "ai_daily_limit" });
    }
  }
  return jsonResponse({ ok: true, results });
});
