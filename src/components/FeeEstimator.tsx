"use client";

import { useMemo, useState } from "react";
import type { FeeBand, Discount } from "@/content/seed";
import { formatGBP } from "@/lib/format";
import { computeFeeSchedule, estimateFamilyFees, FEE_DEFAULTS, FEE_POLICY_DEFAULTS, type PaymentPlan } from "@/lib/fees";

const PLANS: { value: PaymentPlan; label: string }[] = [
  { value: "annual", label: "Annual (pay in full)" },
  { value: "termly", label: "2 payments" },
  { value: "monthly", label: "Monthly" },
];

const MAX_CHILDREN = 6;

/**
 * Pure client-side family fee estimate. Nothing here is submitted anywhere.
 * Every figure comes from props: band annual fees (fee_bands), and the fee
 * settings in site_settings (application fee, annual payment
 * discount, sibling discount, the admin discount catalogue). The maths lives
 * in estimateFamilyFees (src/lib/fees.ts): per-child annual fees, discounts
 * off the annual total, then the total is split into terms / monthly payments
 * so the plan always sums to the estimate.
 */
export function FeeEstimator({
  feeBands,
  siblingDiscountPercent,
  siblingDiscountNote,
  discounts = [],
  annualDiscountPercent = FEE_POLICY_DEFAULTS.annualDiscountPercent,
  applicationFee = FEE_POLICY_DEFAULTS.applicationFee,
  initialBandId,
  compact = false,
}: {
  feeBands: FeeBand[];
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  discounts?: Discount[];
  /** % off when plan = annual and paid in full by the due date (Fees Policy: 2%). */
  annualDiscountPercent?: number;
  /** site_settings.application_fee, charged per child applying. */
  applicationFee?: number;
  initialBandId?: string;
  compact?: boolean;
}) {
  const sortedBands = useMemo(() => [...feeBands].sort((a, b) => a.order - b.order), [feeBands]);
  const firstBand = initialBandId && sortedBands.some((b) => b._id === initialBandId) ? initialBandId : sortedBands[0]?._id ?? "";
  const [bandIds, setBandIds] = useState<string[]>([firstBand]);
  const [plan, setPlan] = useState<PaymentPlan>("annual");
  const [checkedDiscounts, setCheckedDiscounts] = useState<Record<number, boolean>>({});

  const childCount = bandIds.length;
  const hasSiblingDiscount = siblingDiscountPercent != null && siblingDiscountPercent > 0;

  const setChildCount = (n: number) => {
    const count = Math.max(1, Math.min(MAX_CHILDREN, n));
    setBandIds((ids) => Array.from({ length: count }, (_, i) => ids[i] ?? ids[ids.length - 1] ?? firstBand));
  };

  const children = bandIds
    .map((id) => sortedBands.find((b) => b._id === id))
    .filter((b): b is FeeBand => !!b);

  const scheduleSource = children[0] ?? sortedBands[0];
  const schedule = scheduleSource ? scheduleSource.schedule ?? computeFeeSchedule(scheduleSource.annualFee, FEE_DEFAULTS) : null;

  const estimate = useMemo(() => {
    if (!schedule || children.length === 0) return null;
    const extra = discounts
      .filter((d, i) => d.appliesAutomatically || checkedDiscounts[i])
      .map((d) => ({ label: d.label, type: d.type, percent: d.percent, fixedAmount: d.fixedAmount, note: d.note }));
    return estimateFamilyFees({
      children: children.map((b, i) => ({ label: `Child ${i + 1}: ${b.yearGroupRange}`, annual: b.annualFee })),
      plan,
      terms: schedule.terms,
      instalments: schedule.instalments,
      annualDiscountPercent,
      siblingDiscountPercent: hasSiblingDiscount ? siblingDiscountPercent : undefined,
      extraDiscounts: extra,
      applicationFee,
    });
  }, [children, schedule, plan, annualDiscountPercent, hasSiblingDiscount, siblingDiscountPercent, discounts, checkedDiscounts, applicationFee]);

  if (!estimate || !schedule) return null;

  const checkable = discounts.map((d, i) => ({ d, i })).filter(({ d }) => !d.appliesAutomatically);
  const unitLabel = plan === "annual" ? "once, by 1 January 2027" : plan === "termly" ? "per payment" : "per month";
  const evenPayments = estimate.payments.every((p) => p === estimate.payments[0]);
  const sel = "mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm";

  return (
    <div className={`rounded-2xl border border-gold-light/50 bg-white ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="estimator-children" className="text-sm font-medium text-ink">
            Number of children
          </label>
          <select id="estimator-children" value={childCount} onChange={(e) => setChildCount(Number(e.target.value))} className={sel}>
            {Array.from({ length: MAX_CHILDREN }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="estimator-frequency" className="text-sm font-medium text-ink">
            Payment plan
          </label>
          <select id="estimator-frequency" value={plan} onChange={(e) => setPlan(e.target.value as PaymentPlan)} className={sel}>
            {PLANS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
                {f.value === "termly" ? "" : f.value === "monthly" ? ` (${schedule.instalments} payments)` : ""}
              </option>
            ))}
          </select>
        </div>

        {bandIds.map((id, i) => (
          <div key={i}>
            <label htmlFor={`estimator-band-${i}`} className="text-sm font-medium text-ink">
              {childCount === 1 ? "Year group" : `Child ${i + 1}: year group`}
            </label>
            <select
              id={`estimator-band-${i}`}
              value={id}
              onChange={(e) => setBandIds((ids) => ids.map((x, j) => (j === i ? e.target.value : x)))}
              className={sel}
            >
              {sortedBands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.yearGroupRange}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {checkable.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">Other discounts that might apply</p>
          <p className="mt-1 text-xs text-ink/70">
            Estimate only: tick any that you believe apply. Final eligibility is always confirmed by the school.
          </p>
          <div className="mt-3 space-y-2">
            {checkable.map(({ d, i }) => (
              <label key={`${d.label}-${i}`} className="flex items-start gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gold-light/60"
                  checked={!!checkedDiscounts[i]}
                  onChange={(e) => setCheckedDiscounts((prev) => ({ ...prev, [i]: e.target.checked }))}
                />
                <span>
                  <span className="font-medium text-ink">I believe I qualify for: {d.label}</span>
                  {d.eligibilityDescription && <span className="block text-xs text-ink/70">{d.eligibilityDescription}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-cream p-4" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Tuition, January to July 2027</p>
        {estimate.perChild.map((c, i) => (
          <div key={i} className="mt-1 flex items-center justify-between gap-3 text-sm">
            <span className="text-ink/70">{c.label}</span>
            <span className="font-medium text-ink">{formatGBP(c.gross)}</span>
          </div>
        ))}
        {estimate.discounts.map((item, i) => (
          <div key={i} className="mt-1 flex items-start justify-between gap-3 text-sm text-gold-700">
            <span>
              {item.label}
              {item.note && <span className="block text-xs text-ink/70">{item.note}</span>}
            </span>
            <span className="shrink-0">−{formatGBP(item.amountOff)}</span>
          </div>
        ))}
        {hasSiblingDiscount && childCount > 1 && siblingDiscountNote && <p className="mt-1 text-xs text-ink/70">{siblingDiscountNote}</p>}

        <div className="mt-3 flex items-center justify-between border-t border-gold-light/50 pt-3">
          <span className="font-semibold text-ink">Estimated tuition total</span>
          <span className="font-serif text-xl font-bold text-ink">{formatGBP(estimate.total)}</span>
        </div>

        <div className="mt-3 border-t border-gold-light/50 pt-3 text-sm">
          <p className="font-semibold text-ink">
            {formatGBP(estimate.firstPayment)} {unitLabel}
          </p>
          <p className="text-xs text-ink/70">
            {plan === "annual"
              ? "One payment, with the annual payment discount applied."
              : evenPayments
                ? `${estimate.payments.length} payments · Total ${formatGBP(estimate.total)}`
                : `${estimate.payments.length - 1} × ${formatGBP(estimate.payments[0])} + final ${formatGBP(estimate.payments[estimate.payments.length - 1])} · Total ${formatGBP(estimate.total)}`}
          </p>
        </div>

        <div className="mt-3 border-t border-gold-light/50 pt-3 text-sm">
          <p className="font-semibold text-ink">What you pay to secure a place</p>
          <ul className="mt-1 space-y-1 text-ink/80">
            <li className="flex justify-between gap-3">
              <span>Application and assessment fee{childCount > 1 ? ` (${childCount} × ${formatGBP(applicationFee)})` : ""}<span className="block text-xs text-ink/70">Non-refundable. We email the payment details after you apply, and it must be paid before a place is confirmed.</span></span>
              <span className="shrink-0">{formatGBP(estimate.applicationFeeTotal)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>First {plan === "annual" ? "payment (the full year)" : plan === "termly" ? "of two payments" : "month"}</span>
              <span className="shrink-0">{formatGBP(estimate.firstPayment)}</span>
            </li>
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-gold-light/50 pt-2">
            <span className="font-semibold text-ink">Due when you accept an offer</span>
            <span className="font-serif text-lg font-bold text-ink">{formatGBP(estimate.dueOnAcceptance)}</span>
          </div>
          <p className="mt-1 text-xs text-ink/70">Your first payment{estimate.applicationFeeTotal > 0 ? `, plus the application fee (${formatGBP(estimate.applicationFeeTotal)}) if you have not already paid it` : ""}.</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink/70">
        Estimate only, not a binding quote. All fees are inclusive of VAT and cover the shortened January to July 2027 period; examination fees are extra. Final fees, discounts and eligibility are confirmed by the school in your offer.
      </p>
    </div>
  );
}
