// What payments-webhook does with each Stripe event. Every money amount is
// checked against our own payment_attempts row (what we asked Stripe for) and
// the charges it pays; metadata is only ever used to describe an unmatched
// payment to the office. See docs/payments.md.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */
import { stripeRequest, type FetchLike } from "../_shared/stripe.ts";
import { allocateRefund, checkPaidAmount, raiseAlert, splitByWeights, ukToday, type Allocation } from "../_shared/payments.ts";

export type Ctx = { sb: any; key: string; fetchImpl?: FetchLike };
export type Outcome = { outcome: "processed" | "ignored"; detail?: string };

/** Stripe ids only (letters, digits, underscores), so they are safe inside a PostgREST filter. */
const safeId = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_]{3,255}$/.test(v) ? v : null);

const pounds = (p: number) => `£${(p / 100).toFixed(2)}`;

type Attempt = { id: string; kind: string; fee_account_id: string; allocations: Allocation[]; amount_pence: number; currency: string; status: string; payment_intent_id: string | null };

async function attemptById(ctx: Ctx, id: string): Promise<Attempt | null> {
  const { data } = await ctx.sb.from("payment_attempts").select("id, kind, fee_account_id, allocations, amount_pence, currency, status, payment_intent_id").eq("id", id).maybeSingle();
  return (data as Attempt) || null;
}

async function refresh(ctx: Ctx, chargeIds: string[]) {
  for (const id of chargeIds) await ctx.sb.rpc("fee_charge_refresh", { p_charge: id });
}

type PiDetails = { id: string; amount_received: number; currency: string; status: string; chargeId: string | null; methodType: string | null; feePence: number | null; netPence: number | null; livemode: boolean };

/** The payment as Stripe holds it now (not as the event said), with its fee. */
export async function loadIntent(ctx: Ctx, piId: string): Promise<PiDetails | null> {
  const res = await stripeRequest<any>(ctx.key, "GET", `payment_intents/${encodeURIComponent(piId)}`, { expand: ["latest_charge.balance_transaction"] }, { fetchImpl: ctx.fetchImpl });
  if (!res.ok) return null;
  const pi = res.data;
  const ch = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const bt = ch?.balance_transaction && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
  const type = ch?.payment_method_details?.type || pi.payment_method_types?.[0] || null;
  return {
    id: pi.id,
    amount_received: pi.amount_received,
    currency: pi.currency,
    status: pi.status,
    chargeId: ch?.id || (typeof pi.latest_charge === "string" ? pi.latest_charge : null),
    methodType: ["pay_by_bank", "card", "bacs_debit", "link"].includes(type) ? type : type ? "other" : null,
    feePence: bt ? Number(bt.fee) : null,
    netPence: bt ? Number(bt.net) : null,
    livemode: Boolean(pi.livemode),
  };
}

/** Record a succeeded payment against the attempt's charges. Safe to run twice. */
export async function recordPayment(ctx: Ctx, attempt: Attempt, piId: string, sessionId: string | null): Promise<Outcome> {
  const pi = await loadIntent(ctx, piId);
  if (!pi) throw new Error(`could not read payment ${piId} from Stripe`);
  if (pi.status !== "succeeded") return { outcome: "ignored", detail: `payment ${pi.status}` };
  const check = checkPaidAmount(attempt, { amount_total: pi.amount_received, currency: pi.currency });
  if (!check.ok) {
    await raiseAlert(ctx.sb, {
      kind: "amount_mismatch",
      urgency: "now",
      title: `Payment amount does not match: ${pounds(pi.amount_received)}`,
      detail: `Stripe payment ${pi.id} (${check.reason}). Nothing was recorded. Check it in Stripe and record or refund it.`,
      fee_account_id: attempt.fee_account_id,
      stripe_object_id: pi.id,
      livemode: pi.livemode,
    });
    return { outcome: "processed", detail: `amount mismatch: ${check.reason}` };
  }

  const ids = attempt.allocations.map((a) => a.charge_id);
  const { data: charges } = await ctx.sb.from("fee_charges").select("id, fee_account_id, amount_pence, paid_pence, invoice_number").in("id", ids);
  const byId = new Map(((charges || []) as any[]).map((c) => [c.id, c]));
  const fees = pi.feePence === null ? attempt.allocations.map(() => null) : splitByWeights(pi.feePence, attempt.allocations.map((a) => a.amount_pence));
  const nets = pi.netPence === null ? attempt.allocations.map(() => null) : splitByWeights(pi.netPence, attempt.allocations.map((a) => a.amount_pence));
  const today = ukToday();
  for (let i = 0; i < attempt.allocations.length; i++) {
    const a = attempt.allocations[i];
    const c = byId.get(a.charge_id);
    if (!c || c.fee_account_id !== attempt.fee_account_id) {
      await raiseAlert(ctx.sb, { kind: "unmatched", urgency: "now", title: `Payment for a missing charge: ${pounds(a.amount_pence)}`, detail: `Stripe payment ${pi.id} was for a charge that no longer belongs to this family. Nothing was recorded for it.`, fee_account_id: attempt.fee_account_id, stripe_object_id: `${pi.id}:${a.charge_id}`, livemode: pi.livemode });
      continue;
    }
    // Paid in the meantime (another tab, or by hand)? Record the money anyway and ask the office to refund the extra.
    const { data: already } = await ctx.sb.from("fee_payments").select("id").eq("stripe_payment_intent_id", pi.id).eq("charge_id", a.charge_id).maybeSingle();
    if (!already && c.amount_pence - c.paid_pence < a.amount_pence) {
      await raiseAlert(ctx.sb, { kind: "overpaid", urgency: "now", title: `Charge ${c.invoice_number} paid twice`, detail: `Stripe payment ${pi.id} paid ${pounds(a.amount_pence)} but only ${pounds(Math.max(0, c.amount_pence - c.paid_pence))} was still due. Refund the difference in Stripe.`, fee_account_id: attempt.fee_account_id, charge_id: c.id, stripe_object_id: `${pi.id}:${c.id}`, livemode: pi.livemode });
    }
    const { error } = await ctx.sb.from("fee_payments").upsert(
      {
        charge_id: a.charge_id,
        amount: a.amount_pence / 100,
        method: "online",
        paid_on: today,
        reference: pi.id,
        payment_method_type: pi.methodType,
        stripe_payment_intent_id: pi.id,
        stripe_charge_id: pi.chargeId && /^(ch|py)_/.test(pi.chargeId) ? pi.chargeId : null,
        stripe_checkout_session_id: sessionId,
        stripe_fee_pence: fees[i],
        net_pence: nets[i],
        livemode: pi.livemode,
      },
      { onConflict: "stripe_payment_intent_id,charge_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`could not record payment for ${c.invoice_number}: ${error.message}`);
  }
  await ctx.sb.from("fee_charges").update({ processing_since: null }).in("id", ids);
  await refresh(ctx, ids);
  await ctx.sb.from("payment_attempts").update({ status: "paid", payment_intent_id: pi.id, completed_at: new Date().toISOString() }).eq("id", attempt.id);
  return { outcome: "processed", detail: `recorded ${pounds(pi.amount_received)} for ${ids.length} charge(s)` };
}

async function markProcessing(ctx: Ctx, attempt: Attempt, piId: string | null) {
  const ids = attempt.allocations.map((a) => a.charge_id);
  await ctx.sb.from("payment_attempts").update({ status: "processing", payment_intent_id: piId }).eq("id", attempt.id);
  await ctx.sb.from("fee_charges").update({ processing_since: new Date().toISOString() }).in("id", ids);
  await refresh(ctx, ids);
}

async function markFailed(ctx: Ctx, attempt: Attempt, objectId: string, reason: string, livemode: boolean) {
  const ids = attempt.allocations.map((a) => a.charge_id);
  await ctx.sb.from("payment_attempts").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", attempt.id);
  await ctx.sb.from("fee_charges").update({ processing_since: null, last_failed_at: new Date().toISOString(), failure_reason: reason.slice(0, 500) }).in("id", ids);
  await refresh(ctx, ids);
  const { data: acc } = await ctx.sb.from("fee_accounts").select("reference").eq("id", attempt.fee_account_id).maybeSingle();
  await raiseAlert(ctx.sb, {
    kind: "payment_failed",
    urgency: "soon",
    title: `Payment failed: ${acc?.reference || "family"}, ${pounds(attempt.amount_pence)}`,
    detail: `${reason}. The family can try again from their Fees page; contact them if it fails again.`,
    fee_account_id: attempt.fee_account_id,
    charge_id: ids[0] || null,
    stripe_object_id: objectId,
    livemode,
  });
}

async function unmatched(ctx: Ctx, obj: any, what: string): Promise<Outcome> {
  const amount = Number(obj.amount_total ?? obj.amount_received ?? obj.amount ?? 0);
  const ref = obj.client_reference_id || obj.metadata?.family_reference || "none";
  await raiseAlert(ctx.sb, {
    kind: "unmatched",
    urgency: "now",
    title: `Payment in Stripe not matched: ${pounds(amount)}`,
    detail: `${what} ${obj.id} (reference given: ${String(ref).slice(0, 80)}). Find the family, then record it on the Payments page with this Stripe reference.`,
    stripe_object_id: obj.id,
    livemode: Boolean(obj.livemode),
  });
  return { outcome: "processed", detail: "unmatched" };
}

async function mandateFromSetup(ctx: Ctx, session: any, attempt: Attempt): Promise<Outcome> {
  const siId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!siId) return { outcome: "ignored", detail: "no setup intent" };
  const res = await stripeRequest<any>(ctx.key, "GET", `setup_intents/${encodeURIComponent(siId)}`, { expand: ["mandate"] }, { fetchImpl: ctx.fetchImpl });
  if (!res.ok) throw new Error("could not read the Direct Debit set-up from Stripe");
  const si = res.data;
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (!pm || si.customer !== session.customer) return { outcome: "ignored", detail: "set-up without a payment method" };
  const status = si.mandate && typeof si.mandate === "object" ? si.mandate.status : "pending";
  await ctx.sb
    .from("fee_accounts")
    .update({ dd_payment_method_id: pm, dd_mandate_status: ["active", "inactive", "pending"].includes(status) ? status : "pending", dd_mandate_updated_at: new Date().toISOString() })
    .eq("id", attempt.fee_account_id);
  await ctx.sb.from("payment_attempts").update({ status: "complete", completed_at: new Date().toISOString() }).eq("id", attempt.id);
  return { outcome: "processed", detail: `Direct Debit ${status}` };
}

export async function handleEvent(ctx: Ctx, event: { id: string; type: string; livemode: boolean; data: { object: any } }): Promise<Outcome> {
  const obj = event.data?.object || {};
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const attempt = await attemptById(ctx, obj.id);
      if (!attempt) return unmatched(ctx, obj, "Checkout payment");
      if (obj.mode === "setup") return attempt.kind === "setup" ? mandateFromSetup(ctx, obj, attempt) : { outcome: "ignored" };
      const piId = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
      if (!piId) return { outcome: "ignored", detail: "no payment intent" };
      // Check the session's own total too, before looking at the payment.
      const sCheck = checkPaidAmount(attempt, { amount_total: obj.amount_total, currency: obj.currency });
      if (!sCheck.ok) {
        await raiseAlert(ctx.sb, { kind: "amount_mismatch", urgency: "now", title: `Checkout total does not match: ${pounds(Number(obj.amount_total || 0))}`, detail: `Checkout ${obj.id}: ${sCheck.reason}. Nothing was recorded.`, fee_account_id: attempt.fee_account_id, stripe_object_id: obj.id, livemode: event.livemode });
        return { outcome: "processed", detail: `amount mismatch: ${sCheck.reason}` };
      }
      if (obj.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded") return recordPayment(ctx, attempt, piId, obj.id);
      await markProcessing(ctx, attempt, piId);
      return { outcome: "processed", detail: "processing" };
    }
    case "checkout.session.async_payment_failed": {
      const attempt = await attemptById(ctx, obj.id);
      if (!attempt) return unmatched(ctx, obj, "Failed checkout");
      await markFailed(ctx, attempt, obj.id, "The bank did not complete the payment", event.livemode);
      return { outcome: "processed", detail: "failed" };
    }
    case "checkout.session.expired": {
      await ctx.sb.from("payment_attempts").update({ status: "expired" }).eq("id", obj.id).eq("status", "open");
      return { outcome: "processed", detail: "expired" };
    }
    case "payment_intent.succeeded":
    case "payment_intent.processing":
    case "payment_intent.payment_failed": {
      // Direct Debit collections we started ourselves (payments-daily). Checkout payments are handled above.
      const attempt = await attemptById(ctx, obj.id);
      if (!attempt || attempt.kind !== "direct_debit") return { outcome: "ignored" };
      if (event.type === "payment_intent.succeeded") return recordPayment(ctx, attempt, obj.id, null);
      if (event.type === "payment_intent.processing") {
        await markProcessing(ctx, attempt, obj.id);
        return { outcome: "processed", detail: "processing" };
      }
      const reason = obj.last_payment_error?.message || "The Direct Debit was not paid";
      await markFailed(ctx, attempt, obj.id, String(reason), event.livemode);
      return { outcome: "processed", detail: "failed" };
    }
    case "charge.refunded": {
      const chId = safeId(obj.id);
      const piId = safeId(typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id);
      if (!chId) return { outcome: "ignored", detail: "bad id" };
      const { data: rows } = await ctx.sb
        .from("fee_payments")
        .select("id, charge_id, amount_pence, created_at")
        .or(`stripe_charge_id.eq.${chId}${piId ? `,stripe_payment_intent_id.eq.${piId}` : ""}`)
        .order("created_at");
      const list = (rows || []) as any[];
      if (!list.length) return unmatched(ctx, obj, "Refund of a payment");
      const split = allocateRefund(Number(obj.amount_refunded || 0), list);
      for (const r of list) await ctx.sb.from("fee_payments").update({ refunded_pence: split.get(r.id) || 0 }).eq("id", r.id);
      const { data: c } = await ctx.sb.from("fee_charges").select("fee_account_id, invoice_number").eq("id", list[0].charge_id).maybeSingle();
      await raiseAlert(ctx.sb, {
        kind: "refund",
        urgency: "info",
        title: `Refund of ${pounds(Number(obj.amount_refunded || 0))} on ${c?.invoice_number || "a payment"}`,
        detail: `Stripe payment ${obj.id}. The charge now shows what is still owed. Check this was intended.`,
        fee_account_id: c?.fee_account_id || null,
        charge_id: list[0].charge_id,
        stripe_object_id: `${obj.id}:${obj.amount_refunded}`,
        livemode: event.livemode,
      });
      return { outcome: "processed", detail: "refund recorded" };
    }
    case "charge.dispute.created": {
      const chId = safeId(typeof obj.charge === "string" ? obj.charge : obj.charge?.id);
      const piId = safeId(typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id);
      const filter = [chId ? `stripe_charge_id.eq.${chId}` : "", piId ? `stripe_payment_intent_id.eq.${piId}` : ""].filter(Boolean).join(",");
      const { data: rows } = filter ? await ctx.sb.from("fee_payments").select("id, charge_id").or(filter) : { data: [] };
      const list = (rows || []) as any[];
      if (list.length) await ctx.sb.from("fee_payments").update({ disputed: true }).in("id", list.map((r) => r.id));
      const { data: c } = list.length ? await ctx.sb.from("fee_charges").select("fee_account_id, invoice_number").eq("id", list[0].charge_id).maybeSingle() : { data: null };
      await raiseAlert(ctx.sb, {
        kind: "dispute",
        urgency: "now",
        title: `Payment disputed: ${pounds(Number(obj.amount || 0))}${c?.invoice_number ? ` on ${c.invoice_number}` : ""}`,
        detail: `The payer's bank has opened a dispute (reason: ${obj.reason || "not given"}). Respond in Stripe before the deadline, with the invoice and the family's agreement.`,
        fee_account_id: c?.fee_account_id || null,
        charge_id: list[0]?.charge_id || null,
        stripe_object_id: obj.id,
        livemode: event.livemode,
      });
      return { outcome: "processed", detail: "dispute flagged" };
    }
    case "mandate.updated": {
      const pm = typeof obj.payment_method === "string" ? obj.payment_method : obj.payment_method?.id;
      if (!pm) return { outcome: "ignored" };
      const status = ["active", "inactive", "pending"].includes(obj.status) ? obj.status : "pending";
      const { data: acc } = await ctx.sb.from("fee_accounts").select("id, reference").eq("dd_payment_method_id", pm).maybeSingle();
      if (!acc) return { outcome: "ignored", detail: "mandate for no family" };
      await ctx.sb.from("fee_accounts").update({ dd_mandate_status: status, dd_mandate_updated_at: new Date().toISOString() }).eq("id", acc.id);
      if (status === "inactive") {
        await raiseAlert(ctx.sb, { kind: "mandate", urgency: "soon", title: `Direct Debit cancelled: ${acc.reference}`, detail: "The family's Direct Debit is no longer active. Their monthly payments now need to be paid on the Fees page.", fee_account_id: acc.id, stripe_object_id: `${obj.id}:inactive`, livemode: event.livemode });
      }
      return { outcome: "processed", detail: `mandate ${status}` };
    }
    default:
      return { outcome: "ignored" };
  }
}
