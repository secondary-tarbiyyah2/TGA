// Shared payment logic for payments-checkout, payments-checkout-public,
// payments-webhook and payments-daily. Amounts always come from our own
// fee_charges rows, never from a browser or from Stripe metadata alone.
// See docs/payments.md.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */
import { stripeRequest, type FetchLike, type StripeMode } from "./stripe.ts";

export type Allocation = { charge_id: string; amount_pence: number };

export type PayableCharge = {
  id: string;
  invoice_number: string;
  description: string;
  amount_pence: number;
  paid_pence: number;
  status: string;
  due_date: string;
  fee_account_id: string;
};

export type Account = {
  id: string;
  reference: string;
  billing_name: string;
  billing_email: string;
  stripe_customer_id: string | null;
};

/** Charges a family can pay now. */
export const PAYABLE = ["due", "overdue", "part_paid", "failed"];

export const balanceOf = (c: Pick<PayableCharge, "amount_pence" | "paid_pence">) => Math.max(0, c.amount_pence - c.paid_pence);

/** Stripe's limits on one payment: at least 30p (card minimum), at most £10,000 (Pay by Bank maximum). */
export const MIN_PENCE = 30;
export const MAX_PENCE = 1_000_000;

/** Build Checkout's allocations from the charges: each pays its own balance, and nothing else. */
export function allocationsFor(charges: PayableCharge[]): Allocation[] {
  return charges
    .filter((c) => PAYABLE.includes(c.status))
    .map((c) => ({ charge_id: c.id, amount_pence: balanceOf(c) }))
    .filter((a) => a.amount_pence > 0);
}

export const sumPence = (a: { amount_pence: number }[]) => a.reduce((s, x) => s + x.amount_pence, 0);

/** Stripe's statement descriptor suffix: letters, digits, spaces and dashes, up to 22 characters. */
export const descriptorSuffix = (ref: string) => ref.replace(/[^A-Za-z0-9 -]/g, "").slice(0, 22);

/**
 * The Checkout Session request. Pay by Bank is listed first, then card.
 * metadata and client_reference_id carry the family reference, charge ids and
 * invoice numbers so a payment can be found from the Stripe dashboard, but the
 * webhook checks every amount against our own payment_attempts row.
 */
export function checkoutParams(input: {
  account: Account;
  customerId: string;
  charges: PayableCharge[];
  allocations: Allocation[];
  successUrl: string;
  cancelUrl: string;
  source: string;
  childLabels?: Record<string, string>;
  methods?: string[];
}): Record<string, any> {
  const byId = new Map(input.charges.map((c) => [c.id, c]));
  const invoices = input.allocations.map((a) => byId.get(a.charge_id)?.invoice_number || "").filter(Boolean);
  const meta = {
    family_reference: input.account.reference,
    fee_account_id: input.account.id,
    charge_ids: input.allocations.map((a) => a.charge_id).join(",").slice(0, 500),
    invoices: invoices.join(",").slice(0, 500),
    source: input.source,
  };
  return {
    mode: "payment",
    customer: input.customerId,
    client_reference_id: input.account.reference,
    currency: "gbp",
    payment_method_types: input.methods || ["pay_by_bank", "card"],
    line_items: input.allocations.map((a) => {
      const c = byId.get(a.charge_id)!;
      return {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: a.amount_pence,
          product_data: { name: `${c.invoice_number}: ${c.description}`.slice(0, 250) },
        },
      };
    }),
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
      description: `Tarbiyyah Global Academy fees ${input.account.reference}: ${invoices.join(", ")}`.slice(0, 1000),
      statement_descriptor_suffix: descriptorSuffix(input.account.reference),
      receipt_email: input.account.billing_email,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // an abandoned page stops working after an hour
  };
}

/** A stable key for one click: same account, same charges and amounts, same five minutes. */
export async function checkoutIdempotencyKey(accountId: string, allocations: Allocation[], now = Date.now()): Promise<string> {
  const bucket = Math.floor(now / 300_000);
  const raw = `${accountId}|${[...allocations].sort((a, b) => a.charge_id.localeCompare(b.charge_id)).map((a) => `${a.charge_id}:${a.amount_pence}`).join(",")}|${bucket}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return `checkout-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40)}`;
}

/** The family's Stripe Customer, made once and stored. */
export async function ensureCustomer(sb: any, key: string, account: Account, fetchImpl?: FetchLike): Promise<string | null> {
  if (account.stripe_customer_id) return account.stripe_customer_id;
  const res = await stripeRequest<{ id: string }>(
    key,
    "POST",
    "customers",
    { name: account.billing_name, email: account.billing_email, metadata: { family_reference: account.reference, fee_account_id: account.id } },
    { idempotencyKey: `customer-${account.id}`, fetchImpl },
  );
  if (!res.ok) return null;
  // Only fill an empty slot, so two tabs at once never swap the customer.
  await sb.from("fee_accounts").update({ stripe_customer_id: res.data.id }).eq("id", account.id).is("stripe_customer_id", null);
  const { data } = await sb.from("fee_accounts").select("stripe_customer_id").eq("id", account.id).maybeSingle();
  return (data?.stripe_customer_id as string) || res.data.id;
}

export type CheckoutOutcome = { ok: true; url: string; id: string } | { ok: false; error: string; status: number };

/** Create the Checkout Session and remember exactly what it pays. */
export async function startCheckout(
  sb: any,
  key: string,
  opts: { account: Account; charges: PayableCharge[]; successUrl: string; cancelUrl: string; source: "portal" | "public_link"; createdBy?: string | null; livemode: boolean; fetchImpl?: FetchLike },
): Promise<CheckoutOutcome> {
  const allocations = allocationsFor(opts.charges);
  const total = sumPence(allocations);
  if (!allocations.length || total <= 0) return { ok: false, error: "nothing_to_pay", status: 400 };
  if (total < MIN_PENCE) return { ok: false, error: "amount_too_small", status: 400 };
  if (total > MAX_PENCE) return { ok: false, error: "amount_too_large", status: 400 };
  const customerId = await ensureCustomer(sb, key, opts.account, opts.fetchImpl);
  if (!customerId) return { ok: false, error: "stripe_customer_failed", status: 502 };
  const params = checkoutParams({ account: opts.account, customerId, charges: opts.charges, allocations, successUrl: opts.successUrl, cancelUrl: opts.cancelUrl, source: opts.source });
  const idem = await checkoutIdempotencyKey(opts.account.id, allocations);
  const res = await stripeRequest<{ id: string; url: string; amount_total: number }>(key, "POST", "checkout/sessions", params, { idempotencyKey: idem, fetchImpl: opts.fetchImpl });
  if (!res.ok) return { ok: false, error: "stripe_checkout_failed", status: 502 };
  if (res.data.amount_total !== total) return { ok: false, error: "amount_mismatch", status: 502 };
  const { error } = await sb.from("payment_attempts").upsert(
    { id: res.data.id, kind: "checkout", fee_account_id: opts.account.id, allocations, amount_pence: total, source: opts.source, created_by: opts.createdBy || null, livemode: opts.livemode },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "could_not_save", status: 500 };
  return { ok: true, url: res.data.url, id: res.data.id };
}

// ── checks used by the webhook ──────────────────────────────────────────

export type AmountCheck = { ok: true } | { ok: false; reason: string };

/**
 * A completed payment is recorded only when Stripe's amount and currency are
 * exactly what we asked for, and the allocations still add up to it.
 */
export function checkPaidAmount(attempt: { amount_pence: number; currency?: string; allocations: Allocation[] }, paid: { amount_total: number | null; currency: string | null }): AmountCheck {
  if ((paid.currency || "").toLowerCase() !== "gbp") return { ok: false, reason: `currency ${paid.currency}` };
  if (!Number.isInteger(paid.amount_total)) return { ok: false, reason: "no amount" };
  if (paid.amount_total !== attempt.amount_pence) return { ok: false, reason: `paid ${paid.amount_total}p, expected ${attempt.amount_pence}p` };
  const sum = sumPence(attempt.allocations);
  if (sum !== attempt.amount_pence) return { ok: false, reason: `allocations ${sum}p, expected ${attempt.amount_pence}p` };
  if (attempt.allocations.some((a) => !Number.isInteger(a.amount_pence) || a.amount_pence <= 0)) return { ok: false, reason: "bad allocation" };
  return { ok: true };
}

/** Split a whole-pence amount (Stripe's fee) in proportion to weights; the last takes the remainder. */
export function splitByWeights(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, i) => (i === weights.length - 1 ? total : 0));
  let used = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return total - used;
    const part = Math.floor((total * w) / sum);
    used += part;
    return part;
  });
}

/**
 * Spread a Stripe charge's total refunded amount across our payment rows for
 * it, oldest first, never more than each row's amount.
 */
export function allocateRefund(totalRefunded: number, rows: { id: string; amount_pence: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  let left = Math.max(0, totalRefunded);
  for (const r of rows) {
    const take = Math.min(left, r.amount_pence);
    out.set(r.id, take);
    left -= take;
  }
  return out;
}

/** Store of seen events: `claim` returns false when the event was already processed. */
export type EventStore = {
  claim(id: string, type: string, livemode: boolean, objectId: string | null): Promise<boolean>;
  finish(id: string, outcome: "processed" | "ignored" | "error", detail?: string): Promise<void>;
};

/** Process each Stripe event once. A failed attempt can be retried by Stripe. */
export async function processOnce(
  store: EventStore,
  event: { id: string; type: string; livemode: boolean; objectId: string | null },
  handler: () => Promise<{ outcome: "processed" | "ignored"; detail?: string }>,
): Promise<{ duplicate: boolean; outcome?: string; error?: string }> {
  const fresh = await store.claim(event.id, event.type, event.livemode, event.objectId);
  if (!fresh) return { duplicate: true };
  try {
    const r = await handler();
    await store.finish(event.id, r.outcome, r.detail);
    return { duplicate: false, outcome: r.outcome };
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 500);
    await store.finish(event.id, "error", msg);
    return { duplicate: false, outcome: "error", error: msg };
  }
}

/** Supabase-backed EventStore: the event id is the primary key of stripe_events. */
export function dbEventStore(sb: any): EventStore {
  return {
    async claim(id, type, livemode, objectId) {
      const { data: existing } = await sb.from("stripe_events").select("id, outcome, received_at").eq("id", id).maybeSingle();
      if (existing) {
        // Already done, or another delivery is working on it right now.
        if (existing.outcome === "processed" || existing.outcome === "ignored") return false;
        if (!existing.outcome && Date.now() - new Date(existing.received_at).getTime() < 120_000) return false;
        await sb.from("stripe_events").update({ outcome: null, detail: null, received_at: new Date().toISOString() }).eq("id", id);
        return true;
      }
      const { error } = await sb.from("stripe_events").insert({ id, type, livemode, object_id: objectId });
      return !error; // a duplicate key means a parallel delivery claimed it
    },
    async finish(id, outcome, detail) {
      await sb.from("stripe_events").update({ outcome, detail: detail?.slice(0, 1000) || null, processed_at: new Date().toISOString() }).eq("id", id);
    },
  };
}

export async function raiseAlert(
  sb: any,
  a: { kind: string; urgency?: "now" | "soon" | "info"; title: string; detail?: string; fee_account_id?: string | null; charge_id?: string | null; stripe_object_id?: string | null; livemode?: boolean | null },
): Promise<void> {
  const row = { urgency: "soon", ...a };
  if (a.stripe_object_id) {
    await sb.from("payment_alerts").upsert(row, { onConflict: "kind,stripe_object_id", ignoreDuplicates: true });
  } else {
    await sb.from("payment_alerts").insert(row);
  }
}

export const ukToday = (now = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export function modeOf(livemode: boolean): StripeMode {
  return livemode ? "live" : "test";
}
