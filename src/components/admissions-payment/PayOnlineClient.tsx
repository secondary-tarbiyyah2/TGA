"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";
import { payOnlineHref } from "@/lib/onlinePayment";
import { STORE_APP, STORE_APP_FEES_TEXT } from "@/lib/storeApp";
import { formatPence, formatDueDate } from "@/lib/payments/format";

/**
 * The family's own payment page, from the link in their application
 * confirmation or offer email (T71). Everything shown and charged comes from
 * the server (payments-checkout-public); the page never sends an amount.
 */

type Line = { invoice: string; description: string; amountPence: number; paidPence: number; dueDate: string; status: string; kind: string };
type PlanOption = { plan: "annual" | "termly" | "monthly"; label: string; lines: { amountPence: number; dueDate: string }[] };
type Info = {
  childFirstName: string;
  applicationReference: string;
  familyReference: string | null;
  offered: boolean;
  paymentsReady: boolean;
  charges: Line[];
  plan: string | null;
  planLocked: boolean;
  plans: PlanOption[];
};

const ERRORS: Record<string, string> = {
  invalid_link: "This link is not valid any more. Please use the most recent email from us, or reply to it and we will send a new link.",
  rate_limited: "Too many attempts. Please wait a little while and try again.",
  application_closed: "This application is closed. Please contact the admissions team.",
  choose_plan: "Please choose a payment plan first.",
  plan_locked: "Your payment plan is already under way, so it cannot be changed here. Please contact the admissions team.",
  nothing_to_pay: "There is nothing to pay at the moment. Thank you.",
  payments_not_configured: "Online payment is being set up. Please reply to our email and we will send you a link.",
  no_fee_band: "We could not work out the fees for this year group. Please contact the admissions team.",
  network_error: "We could not reach the server. Check your connection and try again.",
  not_configured: "This page is not connected yet. Please reply to our email instead.",
};

const PAYABLE = ["due", "overdue", "part_paid", "failed"];
const STATUS_WORD: Record<string, string> = { due: "Due", overdue: "Overdue", processing: "Processing", paid: "Paid", part_paid: "Part paid", failed: "Payment failed", refunded: "Refunded", waived: "Waived" };

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const url = getEdgeFunctionUrl("payments-checkout-public");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(url, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
    return data && typeof data === "object" ? data : { ok: false, error: "network_error" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export function PayOnlineClient() {
  const params = useSearchParams();
  const reference = params.get("ref") || "";
  const token = params.get("token") || "";
  const returned = params.get("paid");
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!reference || !token) {
      setLoadError(ERRORS.invalid_link);
      return;
    }
    const r = await call({ action: "info", reference, token });
    if (!r.ok) {
      setLoadError(ERRORS[r.error || ""] || ERRORS.network_error);
      return;
    }
    const i = r as unknown as Info;
    setInfo(i);
    if (i.plan) setPlan(i.plan);
  }, [reference, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  // Until Stripe is connected, the school's shared payment link (0214) is the fallback.
  useEffect(() => {
    if (!info || info.paymentsReady) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("site_settings")
      .select("online_payment_url")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setFallback(payOnlineHref((data as { online_payment_url?: string | null } | null)?.online_payment_url, { reference: info.applicationReference })));
  }, [info]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const r = await call({ action: "checkout", reference, token, plan: info?.offered && !info.planLocked ? plan : undefined });
    if (r.ok && typeof r.url === "string") {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    setError(ERRORS[r.error || ""] || "We could not start the payment. Please try again in a moment.");
  };

  if (loadError) return <p className="rounded-xl border border-gold-light bg-white p-5 text-ink/80" role="alert">{loadError}</p>;
  if (!info) return <p className="text-ink/65">Loading…</p>;

  const appFees = info.charges.filter((c) => c.kind === "application_fee");
  const planLines = info.charges.filter((c) => c.kind !== "application_fee");
  const dueAppFee = appFees.filter((c) => PAYABLE.includes(c.status)).reduce((s, c) => s + c.amountPence - c.paidPence, 0);
  const chosen = info.plans.find((p) => p.plan === plan);
  const firstNow = info.offered
    ? planLines.length && info.planLocked
      ? planLines.filter((c) => c.kind === "first_payment" && PAYABLE.includes(c.status)).reduce((s, c) => s + c.amountPence - c.paidPence, 0)
      : chosen?.lines[0]?.amountPence || 0
    : 0;
  const totalNow = dueAppFee + firstNow;
  const needPlan = info.offered && !info.planLocked && !plan;

  return (
    <div className="space-y-6">
      {returned === "1" && (
        <p role="status" className="rounded-xl border border-gold-500 bg-white p-4 text-ink">
          Thank you. Your payment has been made. It shows below as paid within a few minutes (a bank payment can take a little longer). Stripe will email you a receipt.
        </p>
      )}
      {returned === "0" && <p className="rounded-xl border border-gold-light bg-white p-4 text-ink/80">The payment was not completed. You can try again below.</p>}

      <div className="rounded-xl border border-gold-light bg-white p-5">
        <p className="text-ink">
          Fees for <strong>{info.childFirstName}</strong>
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-ink/75">
          <dt>Application reference</dt>
          <dd className="font-medium text-ink">{info.applicationReference}</dd>
          {info.familyReference && (
            <>
              <dt>Family payment reference</dt>
              <dd className="font-medium text-ink">{info.familyReference}</dd>
            </>
          )}
        </dl>
      </div>

      {info.offered && !info.planLocked && info.plans.length > 0 && (
        <fieldset className="rounded-xl border border-gold-light bg-white p-5">
          <legend className="px-1 font-semibold text-ink">Choose your payment plan</legend>
          <div className="mt-2 space-y-3">
            {info.plans.map((p) => {
              const total = p.lines.reduce((s, l) => s + l.amountPence, 0);
              return (
                <label key={p.plan} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 ${plan === p.plan ? "border-gold-500 bg-cream" : "border-gold-light"}`}>
                  <input type="radio" name="plan" value={p.plan} checked={plan === p.plan} onChange={() => setPlan(p.plan)} className="mt-1 h-4 w-4 accent-gold-700" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{p.label}</span>
                    <span className="block text-sm text-ink/70">
                      {p.lines.length === 1
                        ? `${formatPence(total)}, due ${formatDueDate(p.lines[0].dueDate)}`
                        : `${formatPence(p.lines[0].amountPence)} now, then ${p.lines.length - 1} more payment${p.lines.length > 2 ? "s" : ""} (${formatPence(total)} in total)`}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {info.charges.length > 0 && (
        <div className="rounded-xl border border-gold-light bg-white p-5">
          <h2 className="font-semibold text-ink">Your charges</h2>
          <ul className="mt-2 divide-y divide-gold-light/60">
            {info.charges.map((c) => (
              <li key={c.invoice} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-ink">{c.description}</span>
                  <span className="block text-ink/65">
                    {c.invoice} · due {formatDueDate(c.dueDate)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-medium tabular-nums text-ink">{formatPence(c.amountPence)}</span>
                  <span className="block text-ink/65">{STATUS_WORD[c.status] || c.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {STORE_APP ? (
        <p className="rounded-xl border border-gold-light bg-white p-5 text-ink">{STORE_APP_FEES_TEXT}.</p>
      ) : info.paymentsReady ? (
        totalNow > 0 || needPlan ? (
          <div className="rounded-xl border border-gold-light bg-white p-5">
            <p className="text-ink">
              {needPlan ? "Choose a plan above to see what to pay now." : <>To pay now: <strong className="tabular-nums">{formatPence(totalNow)}</strong></>}
            </p>
            <p className="mt-1 text-sm text-ink/70">You pay on Stripe&apos;s secure page: straight from your bank app (Pay by Bank), or by debit or credit card.</p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-800">
                {error}
              </p>
            )}
            <button type="button" onClick={pay} disabled={busy || needPlan} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:brightness-95 focus-visible:brightness-95 disabled:opacity-50">
              {busy ? "Opening the payment page…" : "Pay now"}
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-gold-light bg-white p-5 text-ink">Nothing is due at the moment. Thank you.</p>
        )
      ) : fallback ? (
        <div className="rounded-xl border border-gold-light bg-white p-5">
          <p className="text-ink">Pay on our secure payment page, and give {info.applicationReference} as the reference.</p>
          <a href={fallback} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold tracking-wide text-ink-900 transition-all duration-150 hover:brightness-95 focus-visible:brightness-95">
            Pay online<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      ) : (
        <p className="rounded-xl border border-gold-light bg-white p-5 text-ink/80">{ERRORS.payments_not_configured}</p>
      )}
    </div>
  );
}
