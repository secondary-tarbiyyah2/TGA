// Payments for the office (head teacher and admin only).
//
// POST { action: "status" }                         is Stripe connected (test or live, from the key's prefix; the key
//                                                    itself never leaves the server), last webhook event, last daily check
// POST { action: "generate_plan", applicationId, plan } make (or change, while nothing is paid) a child's plan charges
// POST { action: "plan_quote", applicationId }      what each plan would charge this child
// Deployed WITH JWT verification. See docs/payments.md.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { stripeMode, stripeSecretKey, stripeWebhookSecret } from "../_shared/stripe.ts";
import { ensurePlanCharges, quotePlans } from "../_shared/planCharges.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINANCE = ["head_teacher", "admin"];

async function financeUser(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data } = await caller.auth.getUser();
  if (!data?.user) return null;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", data.user.id);
  return (roles || []).some((r) => FINANCE.includes(r.role as string)) ? data.user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  const user = await financeUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (body.action === "status") {
    const key = stripeSecretKey();
    const [{ data: lastEvent }, { data: lastRun }, { data: settings }, { count: openAlerts }] = await Promise.all([
      sb.from("stripe_events").select("type, received_at, livemode, outcome").order("received_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("payment_reconciliation_runs").select("ran_at, ok, summary").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("site_settings").select("payments_direct_debit_enabled").eq("id", true).maybeSingle(),
      sb.from("payment_alerts").select("id", { count: "exact", head: true }).is("resolved_at", null),
    ]);
    return jsonResponse({
      ok: true,
      stripe: { connected: Boolean(key), mode: stripeMode(key) },
      webhook: { secretSet: Boolean(stripeWebhookSecret()), lastEvent: lastEvent || null },
      reconciliation: lastRun || null,
      directDebitEnabled: Boolean(settings?.payments_direct_debit_enabled),
      openAlerts: openAlerts ?? 0,
    });
  }

  const applicationId = String(body.applicationId || "");
  if (!UUID.test(applicationId)) return jsonResponse({ ok: false, error: "missing_or_invalid_fields" }, 400);

  if (body.action === "plan_quote") {
    const quotes = await quotePlans(sb, applicationId);
    if (!quotes) return jsonResponse({ ok: false, error: "no_fee_band" }, 404);
    return jsonResponse({ ok: true, quotes });
  }

  if (body.action === "generate_plan") {
    const out = await ensurePlanCharges(sb, applicationId, String(body.plan || ""));
    if (!out.ok) return jsonResponse({ ok: false, error: out.error, detail: out.detail }, out.error === "plan_locked" ? 409 : 400);
    return jsonResponse(out);
  }

  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
