// Scheduled clean-up of expired subject-access export files
// (.github/workflows/safeguarding-review-check.yml calls this hourly).
// Takes no input and only ever deletes files whose signed link has already
// expired, so it is deployed --no-verify-jwt like the other scheduled functions.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isServiceRequest } from "../_shared/serviceCaller.ts";
import { purgeExpiredExports } from "../_shared/exportPurge.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  if (!(await isServiceRequest(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const purged = await purgeExpiredExports(service);
  return jsonResponse({ ok: true, purged });
});
