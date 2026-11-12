// The daily payments job (GitHub Actions: .github/workflows/payments-daily.yml).
// Deployed with --no-verify-jwt; only the service-role key may call it.
//   1. Statuses: due becomes overdue the day after the due date.
//   2. Reminders: one email 7 days before a charge is due, and one the day
//      after it becomes overdue. Each email lists only that family's charges.
//   3. Direct Debit (only while the head teacher's switch is on): collects each
//      monthly instalment due today or earlier from families with an active
//      Bacs mandate, once per charge.
//   4. Reconciliation: the last few days of Stripe balance transactions and
//      payouts against fee_payments; anything in Stripe that is not in our
//      records, or the other way round, and any failed payout, goes to the
//      Action centre (payment_alerts). The run is saved in
//      payment_reconciliation_runs.
// POST {} or { days: 1..14 }. See docs/payments.md.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isServiceRequest } from "../_shared/serviceCaller.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { stripeMode, stripeRequest, stripeSecretKey } from "../_shared/stripe.ts";
import { balanceOf, raiseAlert, ukToday } from "../_shared/payments.ts";
import { formatPence } from "../_shared/feePlan.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const addDays = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// ── 2. reminders ────────────────────────────────────────────────────────
async function sendReminders(today: string) {
  const soon = addDays(today, 7);
  const yesterday = addDays(today, -1);
  const { data } = await sb
    .from("fee_charges")
    .select("id, fee_account_id, invoice_number, description, amount_pence, paid_pence, due_date, status")
    .in("status", ["due", "overdue", "part_paid", "failed"])
    .in("due_date", [soon, yesterday])
    .is("voided_at", null);
  const rows = ((data || []) as any[]).filter((c) => c.fee_account_id && balanceOf(c) > 0);
  const { data: sentRows } = rows.length ? await sb.from("payment_reminders").select("charge_id, kind").in("charge_id", rows.map((r) => r.id)) : { data: [] };
  const sent = new Set(((sentRows || []) as any[]).map((r) => `${r.charge_id}|${r.kind}`));
  // One email per family per kind, listing only that family's charges.
  const groups = new Map<string, any[]>();
  for (const c of rows) {
    const kind = c.due_date === soon ? "before_due" : "overdue";
    if (sent.has(`${c.id}|${kind}`)) continue;
    const k = `${c.fee_account_id}|${kind}`;
    groups.set(k, [...(groups.get(k) || []), c]);
  }
  let emails = 0;
  for (const [k, list] of groups) {
    const [accountId, kind] = k.split("|");
    const { data: acc } = await sb.from("fee_accounts").select("reference, billing_name, billing_email").eq("id", accountId).maybeSingle();
    if (!acc) continue;
    const first = String(acc.billing_name || "").trim().split(/\s+/)[0] || "";
    const lines = list
      .map((c) => `<tr><td style="padding:6px 0;">${esc(c.invoice_number)}<br><span style="color:#5b6670;">${esc(c.description)}</span></td><td style="padding:6px 0;text-align:right;white-space:nowrap;">${formatPence(balanceOf(c))}</td></tr>`)
      .join("");
    const subject = kind === "before_due" ? `Fees due on ${longDate(list[0].due_date)}` : "A fee payment is overdue";
    const intro =
      kind === "before_due"
        ? `This is a reminder that the payment below is due on <strong>${esc(longDate(list[0].due_date))}</strong>.`
        : `The payment below was due on <strong>${esc(longDate(list[0].due_date))}</strong> and we have not yet received it. If you have just paid, thank you, and please ignore this email.`;
    const html = emailShell(
      `<p>Assalamu alaikum${first ? ` ${esc(first)}` : ""},</p>
       <p>${intro}</p>
       <table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;">${lines}</table>
       <p>Your family payment reference is <strong>${esc(acc.reference)}</strong>.</p>
       <p><a href="${LEARN_SITE_URL}/family/fees/" style="color:#1f4d3a;font-weight:bold;">Pay in the portal</a> (Fees). You can pay straight from your bank app or by card.</p>
       <p>If anything is wrong, or you need to talk about payments, please reply to this email.</p>`,
      subject,
    );
    const r = await sendEmail({ to: acc.billing_email, toName: acc.billing_name, subject, html });
    emails += r.ok ? 1 : 0;
    await sb.from("payment_reminders").upsert(list.map((c) => ({ charge_id: c.id, kind, email_ok: r.ok })), { onConflict: "charge_id,kind", ignoreDuplicates: true });
  }
  return { reminders: emails };
}

// ── 3. Direct Debit ─────────────────────────────────────────────────────
async function collectDirectDebits(key: string, today: string) {
  const { data: settings } = await sb.from("site_settings").select("payments_direct_debit_enabled").eq("id", true).maybeSingle();
  if (!settings?.payments_direct_debit_enabled) return { directDebits: "off" };
  const { data: accounts } = await sb.from("fee_accounts").select("id, reference, stripe_customer_id, dd_payment_method_id").eq("dd_mandate_status", "active").not("dd_payment_method_id", "is", null);
  let started = 0;
  for (const acc of (accounts || []) as any[]) {
    if (!acc.stripe_customer_id) continue;
    const { data: charges } = await sb
      .from("fee_charges")
      .select("id, invoice_number, description, amount_pence, paid_pence, due_date, status")
      .eq("fee_account_id", acc.id)
      .eq("plan", "monthly")
      .gt("instalment_no", 1)
      .in("status", ["due", "overdue"])
      .lte("due_date", today)
      .is("voided_at", null);
    for (const c of (charges || []) as any[]) {
      const amount = balanceOf(c);
      if (amount <= 0) continue;
      // Once per charge: an earlier attempt for it (open, processing or paid) stops a second one.
      const { data: prior } = await sb.from("payment_attempts").select("id, status").eq("kind", "direct_debit").filter("allocations", "cs", JSON.stringify([{ charge_id: c.id }])).in("status", ["open", "processing", "paid"]).limit(1);
      if (prior && prior.length) continue;
      const meta = { family_reference: acc.reference, fee_account_id: acc.id, charge_ids: c.id, invoices: c.invoice_number, source: "direct_debit" };
      const res = await stripeRequest<any>(
        key,
        "POST",
        "payment_intents",
        {
          amount,
          currency: "gbp",
          customer: acc.stripe_customer_id,
          payment_method: acc.dd_payment_method_id,
          payment_method_types: ["bacs_debit"],
          confirm: true,
          off_session: true,
          description: `Tarbiyyah Global Academy fees ${acc.reference}: ${c.invoice_number}`,
          metadata: meta,
        },
        { idempotencyKey: `dd-${c.id}-${c.due_date}-${amount}` },
      );
      if (!res.ok) {
        await raiseAlert(sb, { kind: "payment_failed", urgency: "soon", title: `Direct Debit not started: ${acc.reference}`, detail: `${c.invoice_number}: ${res.error}`, fee_account_id: acc.id, charge_id: c.id, stripe_object_id: `dd-start:${c.id}:${c.due_date}` });
        continue;
      }
      await sb.from("payment_attempts").upsert(
        { id: res.data.id, kind: "direct_debit", fee_account_id: acc.id, allocations: [{ charge_id: c.id, amount_pence: amount }], amount_pence: amount, status: "processing", payment_intent_id: res.data.id, source: "direct_debit", livemode: Boolean(res.data.livemode) },
        { onConflict: "id", ignoreDuplicates: true },
      );
      await sb.from("fee_charges").update({ processing_since: new Date().toISOString() }).eq("id", c.id);
      await sb.rpc("fee_charge_refresh", { p_charge: c.id });
      started++;
    }
  }
  return { directDebits: started };
}

// ── 4. reconciliation ───────────────────────────────────────────────────
async function listAll(key: string, path: string, params: Record<string, any>, max = 1000): Promise<any[] | null> {
  const out: any[] = [];
  let after: string | undefined;
  while (out.length < max) {
    const res = await stripeRequest<{ data: any[]; has_more: boolean }>(key, "GET", path, { ...params, limit: 100, starting_after: after });
    if (!res.ok) return null;
    out.push(...res.data.data);
    if (!res.data.has_more || !res.data.data.length) break;
    after = res.data.data[res.data.data.length - 1].id;
  }
  return out;
}

async function reconcile(key: string, days: number) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const livemode = stripeMode(key) === "live";
  const txns = await listAll(key, "balance_transactions", { created: { gte: since }, expand: ["data.source"] });
  const payouts = await listAll(key, "payouts", { created: { gte: since } }, 200);
  if (!txns || !payouts) {
    await raiseAlert(sb, { kind: "reconcile_error", urgency: "soon", title: "The daily check against Stripe could not run", detail: "Stripe did not answer. It will try again tomorrow; if this repeats, check the Stripe keys.", stripe_object_id: `reconcile:${ukToday()}` });
    await sb.from("payment_reconciliation_runs").insert({ ok: false, livemode, summary: { error: "stripe_unavailable" } });
    return { reconciled: false };
  }
  // Payments in Stripe (charges, and Pay by Bank / Bacs payments) against our rows.
  const paid = txns.filter((t) => t.type === "charge" || t.type === "payment");
  const chargeIds = paid.map((t) => (typeof t.source === "string" ? t.source : t.source?.id)).filter(Boolean);
  const piIds = paid.map((t) => (typeof t.source === "object" ? t.source?.payment_intent : null)).filter(Boolean);
  const { data: ours } = chargeIds.length || piIds.length
    ? await sb.from("fee_payments").select("stripe_charge_id, stripe_payment_intent_id, amount_pence").or(
        [chargeIds.length ? `stripe_charge_id.in.(${chargeIds.filter((x: string) => /^[A-Za-z0-9_]+$/.test(x)).join(",")})` : "", piIds.length ? `stripe_payment_intent_id.in.(${piIds.filter((x: string) => /^[A-Za-z0-9_]+$/.test(x)).join(",")})` : ""].filter(Boolean).join(","),
      )
    : { data: [] };
  const haveCh = new Set(((ours || []) as any[]).map((r) => r.stripe_charge_id).filter(Boolean));
  const havePi = new Map<string, number>();
  for (const r of (ours || []) as any[]) if (r.stripe_payment_intent_id) havePi.set(r.stripe_payment_intent_id, (havePi.get(r.stripe_payment_intent_id) || 0) + r.amount_pence);
  let missingHere = 0;
  let amountDiffs = 0;
  for (const t of paid) {
    const src = typeof t.source === "object" ? t.source : null;
    const ch = typeof t.source === "string" ? t.source : src?.id;
    const pi = src?.payment_intent || null;
    if ((ch && haveCh.has(ch)) || (pi && havePi.has(pi))) {
      if (pi && havePi.has(pi) && havePi.get(pi) !== t.amount) {
        amountDiffs++;
        await raiseAlert(sb, { kind: "amount_mismatch", urgency: "now", title: `Stripe and our records differ for ${pi}`, detail: `Stripe received ${formatPence(t.amount)}; we recorded ${formatPence(havePi.get(pi) || 0)}.`, stripe_object_id: `reconcile:${pi}`, livemode });
      }
      continue;
    }
    missingHere++;
    await raiseAlert(sb, {
      kind: "missing_here",
      urgency: "now",
      title: `Payment in Stripe not in our records: ${formatPence(t.amount)}`,
      detail: `Stripe ${pi || ch} on ${new Date(t.created * 1000).toLocaleDateString("en-GB")}${src?.metadata?.family_reference ? ` (family ${src.metadata.family_reference})` : ""}. Check it and record it on the Payments page, or refund it.`,
      stripe_object_id: pi || ch,
      livemode,
    });
  }
  // Our Stripe payments from the same days that Stripe does not list. Allow two hours for Stripe's balance to catch up.
  const sinceIso = new Date(since * 1000).toISOString();
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data: recent } = await sb.from("fee_payments").select("id, stripe_payment_intent_id, stripe_charge_id, amount_pence, livemode, created_at").not("stripe_payment_intent_id", "is", null).gte("created_at", sinceIso).lte("created_at", cutoff);
  const stripePi = new Set(piIds);
  const stripeCh = new Set(chargeIds);
  let missingInStripe = 0;
  for (const r of (recent || []) as any[]) {
    if (r.livemode !== null && r.livemode !== livemode) continue;
    if (stripePi.has(r.stripe_payment_intent_id) || (r.stripe_charge_id && stripeCh.has(r.stripe_charge_id))) continue;
    missingInStripe++;
    await raiseAlert(sb, { kind: "missing_in_stripe", urgency: "soon", title: `Recorded payment not found in Stripe: ${formatPence(r.amount_pence)}`, detail: `${r.stripe_payment_intent_id}. Look it up in Stripe; if it is not there, remove our record.`, stripe_object_id: `reconcile-ours:${r.id}`, livemode });
  }
  let payoutsFailed = 0;
  for (const p of payouts) {
    if (p.status === "failed" || p.status === "canceled") {
      payoutsFailed++;
      await raiseAlert(sb, { kind: "payout_failed", urgency: "now", title: `Stripe payout ${p.status}: ${formatPence(p.amount)}`, detail: `${p.failure_message || "Check the bank account in Stripe."}`, stripe_object_id: p.id, livemode });
    }
  }
  const summary = {
    days,
    stripePayments: paid.length,
    stripeTotalPence: paid.reduce((s, t) => s + t.amount, 0),
    feesPence: txns.reduce((s, t) => s + (t.fee || 0), 0),
    refundsPence: txns.filter((t) => t.type === "refund" || t.type === "payment_refund").reduce((s, t) => s + t.amount, 0),
    payouts: payouts.map((p) => ({ id: p.id, amount: p.amount, status: p.status, arrival: p.arrival_date })),
    missingHere,
    missingInStripe,
    amountDiffs,
    payoutsFailed,
  };
  await sb.from("payment_reconciliation_runs").insert({ ok: missingHere + missingInStripe + amountDiffs + payoutsFailed === 0, livemode, summary });
  return { reconciled: true, ...summary, payouts: payouts.length };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  if (!(await isServiceRequest(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const days = Math.min(14, Math.max(1, Number(body.days) || 4));
  const today = ukToday();
  const out: Record<string, unknown> = {};
  const { data: refreshed } = await sb.rpc("fee_charges_refresh_open");
  out.refreshed = refreshed;
  try {
    Object.assign(out, await sendReminders(today));
  } catch (e) {
    out.remindersError = String(e).slice(0, 200);
  }
  const key = stripeSecretKey();
  if (!key) return jsonResponse({ ok: true, ...out, stripe: "not_configured" });
  try {
    Object.assign(out, await collectDirectDebits(key, today));
  } catch (e) {
    out.directDebitError = String(e).slice(0, 200);
  }
  try {
    Object.assign(out, await reconcile(key, days));
  } catch (e) {
    out.reconcileError = String(e).slice(0, 200);
  }
  return jsonResponse({ ok: true, ...out });
});
