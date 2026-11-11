// Pay without logging in: the application fee after applying, and the first
// payment from the offer email. Deployed with verify_jwt = false. Access is the
// family's personal link (application reference + random token), the same
// pattern as the proof-of-payment link before it: only the token's SHA-256
// hash is stored (admissions_stage_details.payment_token_hash), it is compared
// in constant time, it expires after TOKEN_TTL_DAYS, and failed tries are
// throttled per IP and per reference. It never takes an amount from the URL
// or the browser: amounts come from fee_charges, made from fee_bands.
//
// POST { action: "info",     reference, token }         what is due now, and the plans to choose from
// POST { action: "checkout", reference, token, plan? }  a Stripe Checkout Session for what is due now
// See docs/payments.md.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { hashToken } from "../_shared/manageToken.ts";
import { hashIp } from "../_shared/spam.ts";
import { stripeMode, stripeSecretKey } from "../_shared/stripe.ts";
import { PAYABLE, startCheckout, type Account, type PayableCharge } from "../_shared/payments.ts";
import { ensurePlanCharges, quotePlans } from "../_shared/planCharges.ts";
import { PLAN_LABEL, PLANS } from "../_shared/feePlan.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE_URL = (Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk").replace(/\/$/, "");
const TOKEN_TTL_DAYS = 90;
const MAX_FAILURES_PER_HOUR = 10;
const CLOSED = ["declined", "withdrawn"];

function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type App = { id: string; reference: string; status: string; child_first_name: string; child_last_name: string; parent_name: string; parent_email: string };

async function authenticate(reference: string, token: string, ipHash: string): Promise<{ app: App } | { error: Response }> {
  const ref = reference.trim().toUpperCase();
  const fail = async (key: string) => {
    await sb.from("booking_attempts").insert({ ip_hash: ipHash, email: `paylink-fail:${key}` });
    return { error: jsonResponse({ ok: false, error: "invalid_link" }, 403) };
  };
  if (!/^TGA-\d{4}-\d{4,6}$/.test(ref) || !/^[0-9a-f]{48}$/.test(token)) return fail(ref.slice(0, 20));
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [byIp, byRef] = await Promise.all([
    sb.from("booking_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).like("email", "paylink-fail:%").gte("created_at", since),
    sb.from("booking_attempts").select("id", { count: "exact", head: true }).eq("email", `paylink-fail:${ref}`).gte("created_at", since),
  ]);
  if ((byIp.count ?? 0) >= MAX_FAILURES_PER_HOUR || (byRef.count ?? 0) >= MAX_FAILURES_PER_HOUR * 2) {
    return { error: jsonResponse({ ok: false, error: "rate_limited" }, 429) };
  }
  const { data: app } = await sb
    .from("admissions_applications")
    .select("id, reference, status, child_first_name, child_last_name, parent_name, parent_email")
    .eq("reference", ref)
    .maybeSingle();
  const { data: details } = app
    ? await sb.from("admissions_stage_details").select("payment_token_hash, payment_token_created_at").eq("application_id", app.id).maybeSingle()
    : { data: null };
  const hash = await hashToken(token);
  const stored = (details?.payment_token_hash as string | null) || "";
  const created = details?.payment_token_created_at ? new Date(details.payment_token_created_at as string).getTime() : 0;
  const fresh = created > Date.now() - TOKEN_TTL_DAYS * 86400_000;
  const match = timingSafeEqual(stored || "0".repeat(hash.length), hash) && Boolean(stored);
  if (!app || !match || !fresh) return fail(ref);
  if (CLOSED.includes(app.status as string)) return { error: jsonResponse({ ok: false, error: "application_closed" }, 403) };
  return { app: app as App };
}

type ChargeRow = PayableCharge & { kind: string; plan: string | null; instalment_no: number | null; instalment_count: number | null };

/** This child's charges, plus the application fees of brothers and sisters who applied on the same form. */
async function chargesFor(appId: string): Promise<ChargeRow[]> {
  const { data: me } = await sb.from("admissions_applications").select("family_id").eq("id", appId).maybeSingle();
  let ids = [appId];
  if (me?.family_id) {
    const { data: sibs } = await sb.from("admissions_applications").select("id, status").eq("family_id", me.family_id);
    ids = Array.from(new Set([appId, ...((sibs || []) as { id: string; status: string }[]).filter((s) => !CLOSED.includes(s.status)).map((s) => s.id)]));
  }
  const { data } = await sb
    .from("fee_charges")
    .select("id, invoice_number, description, amount_pence, paid_pence, status, due_date, fee_account_id, kind, plan, instalment_no, instalment_count, application_id")
    .in("application_id", ids)
    .is("voided_at", null)
    .order("due_date")
    .order("instalment_no");
  return ((data || []) as (ChargeRow & { application_id: string })[]).filter((c) => c.application_id === appId || c.kind === "application_fee");
}

const view = (c: ChargeRow) => ({
  invoice: c.invoice_number,
  description: c.description,
  amountPence: c.amount_pence,
  paidPence: c.paid_pence,
  dueDate: c.due_date,
  status: c.status,
  kind: c.kind,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const ipHash = await hashIp(clientIp(req));
  const auth = await authenticate(String(body.reference || ""), String(body.token || ""), ipHash);
  if ("error" in auth) return auth.error;
  const app = auth.app;
  const offered = ["offered", "accepted"].includes(app.status);
  const key = stripeSecretKey();

  if (body.action === "info") {
    const charges = await chargesFor(app.id);
    const planCharges = charges.filter((c) => c.plan);
    const locked = planCharges.some((c) => c.paid_pence > 0 || ["processing", "paid", "part_paid", "waived"].includes(c.status));
    const quotes = offered && !locked ? await quotePlans(sb, app.id) : null;
    const accountId = charges[0]?.fee_account_id;
    const { data: account } = accountId ? await sb.from("fee_accounts").select("reference").eq("id", accountId).maybeSingle() : { data: null };
    return jsonResponse({
      ok: true,
      childFirstName: app.child_first_name,
      applicationReference: app.reference,
      familyReference: account?.reference || null,
      offered,
      paymentsReady: Boolean(key),
      charges: charges.map(view),
      plan: planCharges[0]?.plan || null,
      planLocked: locked,
      plans: quotes
        ? PLANS.map((p) => ({ plan: p, label: PLAN_LABEL[p], lines: quotes[p].map((l) => ({ amountPence: l.amountPence, dueDate: l.dueDate })) }))
        : [],
    });
  }

  if (body.action !== "checkout") return jsonResponse({ ok: false, error: "unknown_action" }, 400);
  if (!key) return jsonResponse({ ok: false, error: "payments_not_configured" }, 503);

  if (offered && typeof body.plan === "string" && body.plan) {
    const made = await ensurePlanCharges(sb, app.id, body.plan);
    if (!made.ok) return jsonResponse({ ok: false, error: made.error }, made.error === "plan_locked" ? 409 : 400);
  }
  const charges = await chargesFor(app.id);
  const payable = charges.filter((c) => PAYABLE.includes(c.status));
  // What is due now: the application fee, and once a place is offered the plan's first payment.
  const now = payable.filter((c) => c.kind === "application_fee" || (offered && c.kind === "first_payment"));
  if (offered && !charges.some((c) => c.plan)) return jsonResponse({ ok: false, error: "choose_plan" }, 400);
  if (!now.length) return jsonResponse({ ok: false, error: "nothing_to_pay" }, 400);

  const { data: account } = await sb.from("fee_accounts").select("id, reference, billing_name, billing_email, stripe_customer_id").eq("id", now[0].fee_account_id).maybeSingle();
  if (!account) return jsonResponse({ ok: false, error: "no_account" }, 500);
  const back = `${SITE_URL}/admissions/payment/?ref=${encodeURIComponent(app.reference)}&token=${encodeURIComponent(String(body.token))}`;
  const out = await startCheckout(sb, key, {
    account: account as Account,
    charges: now,
    successUrl: `${back}&paid=1`,
    cancelUrl: `${back}&paid=0`,
    source: "public_link",
    livemode: stripeMode(key) === "live",
  });
  if (!out.ok) return jsonResponse({ ok: false, error: out.error }, out.status);
  return jsonResponse({ ok: true, url: out.url });
});
