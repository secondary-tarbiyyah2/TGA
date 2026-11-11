// Run: deno test supabase/functions/payments-webhook/
// Signature checks, amount checks and idempotency, with Stripe mocked.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */
import { formEncode, signStripePayload, stripeMode, stripeRequest, verifyStripeSignature } from "../_shared/stripe.ts";
import {
  allocateRefund,
  checkoutParams,
  checkPaidAmount,
  processOnce,
  splitByWeights,
  startCheckout,
  type EventStore,
  type PayableCharge,
} from "../_shared/payments.ts";
import { buildPlan, firstDueDate, matchBand, siblingDiscounts } from "../_shared/feePlan.ts";
import { FakeDb, fakeStripe } from "../_shared/fakeDb_test_helpers.ts";
import { handleEvent } from "./handlers.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq<T>(a: T, b: T, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const SECRET = "whsec_test_secret_for_unit_tests_only";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

// ── signatures ──────────────────────────────────────────────────────────
Deno.test("a correct Stripe signature is accepted", async () => {
  const now = 1_800_000_000;
  const header = await signStripePayload(SECRET, BODY, now);
  const r = await verifyStripeSignature(SECRET, header, BODY, now + 10);
  assert(r.ok, "should pass");
});

Deno.test("a changed body is refused", async () => {
  const now = 1_800_000_000;
  const header = await signStripePayload(SECRET, BODY, now);
  const r = await verifyStripeSignature(SECRET, header, BODY.replace("evt_1", "evt_2"), now);
  eq(r, { ok: false, reason: "no_match" });
});

Deno.test("the wrong secret is refused", async () => {
  const now = 1_800_000_000;
  const header = await signStripePayload("whsec_someone_else", BODY, now);
  eq((await verifyStripeSignature(SECRET, header, BODY, now)).ok, false);
});

Deno.test("an old signature (replay) is refused", async () => {
  const now = 1_800_000_000;
  const header = await signStripePayload(SECRET, BODY, now - 301);
  eq(await verifyStripeSignature(SECRET, header, BODY, now), { ok: false, reason: "too_old" });
});

Deno.test("a missing or broken header is refused", async () => {
  eq(await verifyStripeSignature(SECRET, null, BODY, 1), { ok: false, reason: "missing_header" });
  eq(await verifyStripeSignature(SECRET, "t=abc", BODY, 1), { ok: false, reason: "bad_header" });
  eq(await verifyStripeSignature(SECRET, "v1=deadbeef", BODY, 1), { ok: false, reason: "bad_header" });
});

Deno.test("any one of several v1 signatures may match (secret rotation)", async () => {
  const now = 1_800_000_000;
  const good = (await signStripePayload(SECRET, BODY, now)).split("v1=")[1];
  const header = `t=${now},v1=${"0".repeat(64)},v1=${good}`;
  assert((await verifyStripeSignature(SECRET, header, BODY, now)).ok);
});

Deno.test("the key prefix gives the mode; the key itself is never needed", () => {
  eq(stripeMode("sk_test_abc"), "test");
  eq(stripeMode("rk_live_abc"), "live");
  eq(stripeMode("pk_test_abc"), null);
  eq(stripeMode(""), null);
});

// ── Stripe requests ─────────────────────────────────────────────────────
Deno.test("Stripe requests are form encoded, with an idempotency key on create", async () => {
  const s = fakeStripe({ "POST customers": () => ({ json: { id: "cus_1" } }) });
  const r = await stripeRequest("sk_test_x", "POST", "customers", { name: "A", metadata: { family_reference: "TGA-F-1001" } }, { idempotencyKey: "customer-1", fetchImpl: s.fetch });
  assert(r.ok);
  eq(s.calls[0].headers.get("Idempotency-Key"), "customer-1");
  eq(s.calls[0].body.get("metadata[family_reference]"), "TGA-F-1001");
  eq(formEncode({ a: ["x", "y"], b: { c: 1 }, d: null }), "a%5B0%5D=x&a%5B1%5D=y&b%5Bc%5D=1");
});

Deno.test("a Stripe error comes back as a failure, not an exception", async () => {
  const s = fakeStripe({ "POST customers": () => ({ status: 402, json: { error: { message: "Your card was declined", code: "card_declined" } } }) });
  const r = await stripeRequest("sk_test_x", "POST", "customers", {}, { fetchImpl: s.fetch });
  assert(!r.ok && r.status === 402 && r.code === "card_declined");
});

// ── amounts ─────────────────────────────────────────────────────────────
const charge = (id: string, amount: number, paid = 0, status = "due"): PayableCharge => ({
  id,
  invoice_number: `TGA-INV-27-${id}`,
  description: `Charge ${id}`,
  amount_pence: amount,
  paid_pence: paid,
  status,
  due_date: "2027-01-08",
  fee_account_id: "acc1",
});

Deno.test("Checkout asks only for each charge's balance, Pay by Bank first", () => {
  const charges = [charge("00001", 15000), charge("00002", 39943, 10000)];
  const p = checkoutParams({
    account: { id: "acc1", reference: "TGA-F-1042", billing_name: "A Parent", billing_email: "a@example.com", stripe_customer_id: "cus_1" },
    customerId: "cus_1",
    charges,
    allocations: [{ charge_id: "00001", amount_pence: 15000 }, { charge_id: "00002", amount_pence: 29943 }],
    successUrl: "https://x/ok",
    cancelUrl: "https://x/no",
    source: "portal",
  });
  eq(p.payment_method_types, ["pay_by_bank", "card"]);
  eq(p.currency, "gbp");
  eq(p.line_items.map((l: any) => l.price_data.unit_amount), [15000, 29943]);
  eq(p.client_reference_id, "TGA-F-1042");
  eq(p.metadata.invoices, "TGA-INV-27-00001,TGA-INV-27-00002");
  eq(p.payment_intent_data.statement_descriptor_suffix, "TGA-F-1042");
  eq(p.payment_intent_data.receipt_email, "a@example.com");
});

Deno.test("checkPaidAmount: exact match only", () => {
  const attempt = { amount_pence: 45000, allocations: [{ charge_id: "a", amount_pence: 15000 }, { charge_id: "b", amount_pence: 30000 }] };
  assert(checkPaidAmount(attempt, { amount_total: 45000, currency: "gbp" }).ok);
  assert(!checkPaidAmount(attempt, { amount_total: 44999, currency: "gbp" }).ok, "a penny short");
  assert(!checkPaidAmount(attempt, { amount_total: 45000, currency: "eur" }).ok, "wrong currency");
  assert(!checkPaidAmount(attempt, { amount_total: null, currency: "gbp" }).ok, "no amount");
  assert(!checkPaidAmount({ amount_pence: 45000, allocations: [{ charge_id: "a", amount_pence: 15000 }] }, { amount_total: 45000, currency: "gbp" }).ok, "allocations must add up");
});

Deno.test("fees and refunds split to the penny", () => {
  eq(splitByWeights(100, [1, 1, 1]), [33, 33, 34]);
  eq(splitByWeights(500, [15000, 29943]).reduce((s, x) => s + x, 0), 500);
  const r = allocateRefund(20000, [{ id: "p1", amount_pence: 15000 }, { id: "p2", amount_pence: 30000 }]);
  eq([r.get("p1"), r.get("p2")], [15000, 5000]);
});

// ── idempotency ─────────────────────────────────────────────────────────
function memoryStore(): EventStore & { seen: Map<string, string | null> } {
  const seen = new Map<string, string | null>();
  return {
    seen,
    claim(id) {
      const s = seen.get(id);
      if (s === "processed" || s === "ignored") return Promise.resolve(false);
      seen.set(id, null);
      return Promise.resolve(true);
    },
    finish(id, outcome) {
      seen.set(id, outcome);
      return Promise.resolve();
    },
  };
}

Deno.test("an event is processed once, however often Stripe sends it", async () => {
  const store = memoryStore();
  let runs = 0;
  const ev = { id: "evt_a", type: "x", livemode: false, objectId: null };
  const h = () => {
    runs++;
    return Promise.resolve({ outcome: "processed" as const });
  };
  eq((await processOnce(store, ev, h)).duplicate, false);
  eq((await processOnce(store, ev, h)).duplicate, true);
  eq(runs, 1);
});

Deno.test("an event that failed is processed again on Stripe's retry", async () => {
  const store = memoryStore();
  const ev = { id: "evt_b", type: "x", livemode: false, objectId: null };
  const r1 = await processOnce(store, ev, () => Promise.reject(new Error("db down")));
  eq(r1.outcome, "error");
  const r2 = await processOnce(store, ev, () => Promise.resolve({ outcome: "processed" as const }));
  eq(r2.outcome, "processed");
});

// ── the webhook end to end, with Stripe and the database mocked ─────────
function world() {
  const db = new FakeDb({
    fee_accounts: [{ id: "acc1", reference: "TGA-F-1042", billing_name: "A Parent", billing_email: "a@example.com", stripe_customer_id: "cus_1" }],
    fee_charges: [
      { id: "c1", fee_account_id: "acc1", invoice_number: "TGA-INV-27-00001", description: "Application fee", amount_pence: 15000, paid_pence: 0, status: "due", due_date: "2027-01-08" },
      { id: "c2", fee_account_id: "acc1", invoice_number: "TGA-INV-27-00002", description: "Payment 1 of 7", amount_pence: 39943, paid_pence: 0, status: "due", due_date: "2027-01-08" },
    ],
    payment_attempts: [
      { id: "cs_test_1", kind: "checkout", fee_account_id: "acc1", allocations: [{ charge_id: "c1", amount_pence: 15000 }, { charge_id: "c2", amount_pence: 39943 }], amount_pence: 54943, currency: "gbp", status: "open", payment_intent_id: null },
    ],
    fee_payments: [],
    payment_alerts: [],
  });
  db.uniques.fee_payments = [["stripe_payment_intent_id", "charge_id"]];
  db.generated.fee_payments = (r) => ({ amount_pence: Math.round(r.amount * 100) });
  db.uniques.payment_alerts = [["kind", "stripe_object_id"]];
  db.rpcs.fee_charge_refresh = ({ p_charge }: any) => {
    const c = db.rows("fee_charges").find((r) => r.id === p_charge)!;
    c.paid_pence = db.rows("fee_payments").filter((p) => p.charge_id === p_charge).reduce((s, p) => s + Math.round(p.amount * 100) - (p.refunded_pence || 0), 0);
    c.status = c.paid_pence >= c.amount_pence ? "paid" : c.paid_pence > 0 ? "part_paid" : c.processing_since ? "processing" : "due";
    return c.status;
  };
  const stripe = fakeStripe({
    "GET payment_intents/pi_1": () => ({
      json: { id: "pi_1", amount_received: 54943, currency: "gbp", status: "succeeded", livemode: false, latest_charge: { id: "py_1", payment_method_details: { type: "pay_by_bank" }, balance_transaction: { fee: 295, net: 54648 } } },
    }),
  });
  return { db, stripe, ctx: { sb: db, key: "sk_test_x", fetchImpl: stripe.fetch } };
}

const completed = (over: Record<string, unknown> = {}) => ({
  id: "evt_c1",
  type: "checkout.session.completed",
  livemode: false,
  data: { object: { id: "cs_test_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 54943, currency: "gbp", client_reference_id: "TGA-F-1042", ...over } },
});

Deno.test("a paid Checkout records one payment per charge, with Stripe's fee split", async () => {
  const { db, ctx } = world();
  const r = await handleEvent(ctx, completed());
  eq(r.outcome, "processed");
  const pays = db.rows("fee_payments");
  eq(pays.length, 2);
  eq(pays.map((p) => Math.round(p.amount * 100)), [15000, 39943]);
  eq(pays.reduce((s, p) => s + p.stripe_fee_pence, 0), 295);
  eq(pays[0].payment_method_type, "pay_by_bank");
  eq(db.rows("fee_charges").map((c) => c.status), ["paid", "paid"]);
  eq(db.rows("payment_attempts")[0].status, "paid");
});

Deno.test("the same payment twice is recorded once", async () => {
  const { db, ctx } = world();
  await handleEvent(ctx, completed());
  await handleEvent(ctx, { ...completed(), id: "evt_c2", type: "checkout.session.async_payment_succeeded" });
  eq(db.rows("fee_payments").length, 2);
});

Deno.test("a Checkout total that differs from what we asked for is not recorded", async () => {
  const { db, ctx } = world();
  const r = await handleEvent(ctx, completed({ amount_total: 100 }));
  eq(r.outcome, "processed");
  eq(db.rows("fee_payments").length, 0);
  eq(db.rows("payment_alerts")[0].kind, "amount_mismatch");
});

Deno.test("metadata alone never records a payment: an unknown session is flagged", async () => {
  const { db, ctx } = world();
  await handleEvent(ctx, completed({ id: "cs_test_unknown", metadata: { charge_ids: "c1,c2" } }));
  eq(db.rows("fee_payments").length, 0);
  eq(db.rows("payment_alerts")[0].kind, "unmatched");
});

Deno.test("Stripe's own payment amount is checked too", async () => {
  const { db, ctx, stripe } = world();
  stripe.calls.length = 0;
  (ctx as any).fetchImpl = fakeStripe({
    "GET payment_intents/pi_1": () => ({ json: { id: "pi_1", amount_received: 50000, currency: "gbp", status: "succeeded", livemode: false, latest_charge: null } }),
  }).fetch;
  await handleEvent(ctx, completed());
  eq(db.rows("fee_payments").length, 0);
  eq(db.rows("payment_alerts")[0].kind, "amount_mismatch");
});

Deno.test("Pay by Bank still processing marks the charges processing; failure flags the office", async () => {
  const { db, ctx } = world();
  await handleEvent(ctx, completed({ payment_status: "unpaid" }));
  eq(db.rows("fee_charges").map((c) => c.status), ["processing", "processing"]);
  await handleEvent(ctx, { ...completed(), id: "evt_f", type: "checkout.session.async_payment_failed" });
  eq(db.rows("payment_attempts")[0].status, "failed");
  eq(db.rows("payment_alerts")[0].kind, "payment_failed");
});

Deno.test("a refund is spread over the payments and flagged", async () => {
  const { db, ctx } = world();
  await handleEvent(ctx, completed());
  await handleEvent(ctx, { id: "evt_r", type: "charge.refunded", livemode: false, data: { object: { id: "py_1", payment_intent: "pi_1", amount_refunded: 15000 } } });
  eq(db.rows("fee_payments").map((p) => p.refunded_pence), [15000, 0]);
  eq(db.rows("payment_alerts")[0].kind, "refund");
});

Deno.test("a dispute is flagged as urgent", async () => {
  const { db, ctx } = world();
  await handleEvent(ctx, completed());
  await handleEvent(ctx, { id: "evt_d", type: "charge.dispute.created", livemode: false, data: { object: { id: "dp_1", charge: "py_1", payment_intent: "pi_1", amount: 54943, reason: "fraudulent" } } });
  const a = db.rows("payment_alerts").find((x) => x.kind === "dispute")!;
  eq(a.urgency, "now");
  eq(db.rows("fee_payments").every((p) => p.disputed), true);
});

Deno.test("startCheckout takes amounts from the charges and saves what it asked for", async () => {
  const db = new FakeDb({ fee_accounts: [{ id: "acc1", stripe_customer_id: "cus_1" }], payment_attempts: [] });
  let asked = 0;
  const s = fakeStripe({
    "POST checkout/sessions": (body) => {
      asked = Number(body.get("line_items[0][price_data][unit_amount]")) + Number(body.get("line_items[1][price_data][unit_amount]") || 0);
      return { json: { id: "cs_new", url: "https://checkout.stripe.com/c/cs_new", amount_total: asked } };
    },
  });
  const out = await startCheckout(db, "sk_test_x", {
    account: { id: "acc1", reference: "TGA-F-1042", billing_name: "A", billing_email: "a@example.com", stripe_customer_id: "cus_1" },
    charges: [charge("00001", 15000), charge("00002", 39943, 39943, "paid")],
    successUrl: "https://x/ok",
    cancelUrl: "https://x/no",
    source: "portal",
    livemode: false,
    fetchImpl: s.fetch,
  });
  assert(out.ok);
  eq(asked, 15000, "a paid charge is never asked for again");
  eq(db.rows("payment_attempts")[0].amount_pence, 15000);
  assert(s.calls[0].headers.get("Idempotency-Key")?.startsWith("checkout-"), "idempotency key");
});

// ── fee plans ───────────────────────────────────────────────────────────
Deno.test("plans sum exactly, with the last payment taking the rounding", () => {
  const kids = [{ key: "a", label: "A", annualPence: 279600 }];
  const monthly = buildPlan(kids, "monthly", "2026-11-11")[0];
  eq(monthly.lines.length, 7);
  eq(monthly.lines.reduce((s, l) => s + l.amountPence, 0), 279600);
  eq(monthly.lines.map((l) => l.dueDate), ["2026-11-18", "2027-01-28", "2027-02-28", "2027-03-28", "2027-04-28", "2027-05-28", "2027-06-28"]);
  const annual = buildPlan(kids, "annual", "2026-11-11")[0];
  eq(annual.totalPence, 279600 - 5592);
  const termly = buildPlan(kids, "termly", "2027-01-05")[0];
  eq(termly.lines.map((l) => l.dueDate), ["2027-01-08", "2027-03-28"]);
});

Deno.test("sibling discount: 5% second child, 10% third, ranked by fee", () => {
  const kids = [
    { key: "a", label: "A", annualPence: 159600 },
    { key: "b", label: "B", annualPence: 300000 },
    { key: "c", label: "C", annualPence: 213000 },
  ];
  eq(siblingDiscounts(kids, { annualDiscountPercent: 2, siblingSecondPercent: 5, siblingLaterPercent: 10 }), [15960, 0, 10650]);
});

Deno.test("first payment is due within a week, never after 8 January 2027", () => {
  eq(firstDueDate("2026-11-11"), "2026-11-18");
  eq(firstDueDate("2027-01-05"), "2027-01-08");
  eq(firstDueDate("2027-02-01"), "2027-02-01");
});

Deno.test("year groups find their fee band", () => {
  const bands = [
    { yearGroupRange: "Year 1 – Year 2", annualFee: 1596 },
    { yearGroupRange: "Year 7 – Year 9", annualFee: 2796 },
  ];
  eq(matchBand("Year 8", bands)?.annualFee, 2796);
  eq(matchBand("Reception", bands), null);
});
