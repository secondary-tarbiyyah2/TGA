// Pay fees in the portal (the preferred route). A signed-in parent asks to pay
// one or more of their family's charges ("Pay now" or "Pay all due"); this
// makes a Stripe Checkout Session server-side and returns its address.
// Amounts come ONLY from fee_charges (never from the browser), in GBP, with
// Pay by Bank listed first, then card. One Stripe Customer per family.
//
// POST { chargeIds?: string[] }        pay these (all must be the family's), or every charge due when left out
// POST { action: "setup_direct_debit" } set up a Bacs Direct Debit for the monthly plan
//                                       (only while the head teacher's switch is on)
// Deployed WITH JWT verification. See docs/payments.md.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { stripeMode, stripeRequest, stripeSecretKey } from "../_shared/stripe.ts";
import { ensureCustomer, PAYABLE, startCheckout, type Account, type PayableCharge } from "../_shared/payments.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parentFrom(authHeader: string | null): Promise<{ id: string; email: string | null } | null> {
  if (!authHeader) return null;
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data } = await caller.auth.getUser();
  if (!data?.user) return null;
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", data.user.id);
  if (!(roles || []).some((r) => r.role === "parent")) return null;
  return { id: data.user.id, email: data.user.email || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const parent = await parentFrom(req.headers.get("Authorization"));
  if (!parent) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const key = stripeSecretKey();
  if (!key) return jsonResponse({ ok: false, error: "payments_not_configured" }, 503);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body: pay everything due
  }

  const { data: accountId } = await sb.rpc("fee_account_for_parent", { p_parent: parent.id });
  if (!accountId) return jsonResponse({ ok: false, error: "no_account" }, 404);
  const { data: account } = await sb.from("fee_accounts").select("id, reference, billing_name, billing_email, stripe_customer_id").eq("id", accountId).maybeSingle();
  if (!account) return jsonResponse({ ok: false, error: "no_account" }, 404);

  // ── Direct Debit set-up (monthly plan) ─────────────────────────────────
  if (body.action === "setup_direct_debit") {
    const { data: settings } = await sb.from("site_settings").select("payments_direct_debit_enabled").eq("id", true).maybeSingle();
    if (!settings?.payments_direct_debit_enabled) return jsonResponse({ ok: false, error: "direct_debit_off" }, 403);
    const customerId = await ensureCustomer(sb, key, account as Account);
    if (!customerId) return jsonResponse({ ok: false, error: "stripe_customer_failed" }, 502);
    const res = await stripeRequest<{ id: string; url: string }>(
      key,
      "POST",
      "checkout/sessions",
      {
        mode: "setup",
        customer: customerId,
        currency: "gbp",
        payment_method_types: ["bacs_debit"],
        client_reference_id: account.reference,
        metadata: { family_reference: account.reference, fee_account_id: account.id, purpose: "direct_debit_mandate" },
        setup_intent_data: { metadata: { family_reference: account.reference, fee_account_id: account.id } },
        success_url: `${LEARN_SITE_URL}/family/fees/?mandate=done`,
        cancel_url: `${LEARN_SITE_URL}/family/fees/?mandate=cancelled`,
      },
      { idempotencyKey: `mandate-${account.id}-${Math.floor(Date.now() / 300_000)}` },
    );
    if (!res.ok) return jsonResponse({ ok: false, error: "stripe_checkout_failed" }, 502);
    await sb.from("payment_attempts").upsert(
      { id: res.data.id, kind: "setup", fee_account_id: account.id, allocations: [], amount_pence: 0, source: "mandate", created_by: parent.id, livemode: stripeMode(key) === "live" },
      { onConflict: "id", ignoreDuplicates: true },
    );
    return jsonResponse({ ok: true, url: res.data.url });
  }

  // ── pay charges ────────────────────────────────────────────────────────
  const requested = Array.isArray(body.chargeIds) ? (body.chargeIds as unknown[]).map(String) : null;
  if (requested && (requested.length === 0 || requested.length > 50 || requested.some((id) => !UUID.test(id)))) {
    return jsonResponse({ ok: false, error: "invalid_charges" }, 400);
  }
  const { data: rows } = await sb
    .from("fee_charges")
    .select("id, invoice_number, description, amount_pence, paid_pence, status, due_date, fee_account_id")
    .eq("fee_account_id", account.id)
    .in("status", PAYABLE)
    .is("voided_at", null)
    .order("due_date");
  let charges = (rows || []) as PayableCharge[];
  if (requested) {
    const mine = new Set(charges.map((c) => c.id));
    // Every requested charge must be this family's and payable now.
    if (requested.some((id) => !mine.has(id))) return jsonResponse({ ok: false, error: "charge_not_payable" }, 409);
    charges = charges.filter((c) => requested.includes(c.id));
  } else {
    // "Pay all due": what is overdue or due today or earlier, else the next one due.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
    const dueNow = charges.filter((c) => c.due_date <= today);
    charges = dueNow.length ? dueNow : charges.slice(0, 1);
  }

  const out = await startCheckout(sb, key, {
    account: account as Account,
    charges,
    successUrl: `${LEARN_SITE_URL}/family/fees/?paid=1&session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${LEARN_SITE_URL}/family/fees/?paid=0`,
    source: "portal",
    createdBy: parent.id,
    livemode: stripeMode(key) === "live",
  });
  if (!out.ok) return jsonResponse({ ok: false, error: out.error }, out.status);
  return jsonResponse({ ok: true, url: out.url });
});
