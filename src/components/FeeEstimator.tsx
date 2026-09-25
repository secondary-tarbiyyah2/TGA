"use client";

import { useMemo, useState } from "react";
import type { FeeBand, Discount } from "@/content/seed";
import { formatGBP } from "@/lib/format";

type Frequency = "annual" | "termly" | "monthly";

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "annual", label: "Annual (Jan–Jul 2027)" },
  { value: "termly", label: "Termly" },
  { value: "monthly", label: "Monthly" },
];

function frequencyFee(band: FeeBand, frequency: Frequency): number {
  if (frequency === "termly") return band.termlyFee;
  if (frequency === "monthly") return band.monthlyFee;
  return band.annualFee;
}

type LineItem = { label: string; note?: string; amountOff: number };

/**
 * Pure client-side estimate — nothing here is submitted anywhere (UK GDPR:
 * no data collection). All discount figures come from Sanity site settings
 * (or its build-time fallback); nothing is invented here. If no discounts
 * are configured at all, this degrades to a plain band → frequency → price
 * lookup with no discount section rendered (hide-when-empty, matching the
 * pattern on /fees).
 */
export function FeeEstimator({
  feeBands,
  siblingDiscountPercent,
  siblingDiscountNote,
  discounts = [],
  initialBandId,
  compact = false,
}: {
  feeBands: FeeBand[];
  siblingDiscountPercent?: number;
  siblingDiscountNote?: string;
  discounts?: Discount[];
  initialBandId?: string;
  compact?: boolean;
}) {
  const sortedBands = useMemo(() => [...feeBands].sort((a, b) => a.order - b.order), [feeBands]);
  const [bandId, setBandId] = useState(initialBandId && sortedBands.some((b) => b._id === initialBandId) ? initialBandId : sortedBands[0]?._id ?? "");
  const [frequency, setFrequency] = useState<Frequency>("annual");
  const [siblings, setSiblings] = useState(0);
  const [checkedDiscounts, setCheckedDiscounts] = useState<Record<number, boolean>>({});

  const band = sortedBands.find((b) => b._id === bandId) ?? null;

  const hasSiblingDiscount = siblingDiscountPercent != null && siblingDiscountPercent > 0;
  const autoDiscounts = discounts.filter((d) => d.appliesAutomatically);
  const checkableDiscounts = discounts.filter((d) => !d.appliesAutomatically);
  const hasAnyDiscounts = hasSiblingDiscount || discounts.length > 0;

  const baseFee = band ? frequencyFee(band, frequency) : 0;

  const lineItems: LineItem[] = useMemo(() => {
    if (!band) return [];
    const items: LineItem[] = [];

    if (hasSiblingDiscount && siblings >= 1) {
      items.push({
        label: "Sibling discount",
        note: siblingDiscountNote,
        amountOff: (baseFee * (siblingDiscountPercent as number)) / 100,
      });
    }

    for (const d of autoDiscounts) {
      const amountOff = d.type === "percent" ? (baseFee * (d.percent ?? 0)) / 100 : d.fixedAmount ?? 0;
      if (amountOff > 0) items.push({ label: d.label, note: d.note, amountOff });
    }

    discounts.forEach((d, i) => {
      if (d.appliesAutomatically) return;
      if (!checkedDiscounts[i]) return;
      const amountOff = d.type === "percent" ? (baseFee * (d.percent ?? 0)) / 100 : d.fixedAmount ?? 0;
      if (amountOff > 0) items.push({ label: d.label, note: d.note, amountOff });
    });

    return items;
  }, [band, baseFee, hasSiblingDiscount, siblings, siblingDiscountPercent, siblingDiscountNote, autoDiscounts, discounts, checkedDiscounts]);

  const totalDiscount = lineItems.reduce((sum, item) => sum + item.amountOff, 0);
  const estimatedTotal = Math.max(0, baseFee - totalDiscount);

  if (!band) return null;

  return (
    <div className={`rounded-2xl border border-gold-light/50 bg-white ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="estimator-band" className="text-sm font-medium text-ink">
            Year group
          </label>
          <select
            id="estimator-band"
            value={bandId}
            onChange={(e) => setBandId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          >
            {sortedBands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.yearGroupRange}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="estimator-frequency" className="text-sm font-medium text-ink">
            Payment frequency
          </label>
          <select
            id="estimator-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
            className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {hasSiblingDiscount && (
          <div>
            <label htmlFor="estimator-siblings" className="text-sm font-medium text-ink">
              Siblings also enrolling
            </label>
            <input
              id="estimator-siblings"
              type="number"
              min={0}
              max={10}
              value={siblings}
              onChange={(e) => setSiblings(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-ink/50">Not counting this child — used to apply the sibling discount.</p>
          </div>
        )}
      </div>

      {checkableDiscounts.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">Other discounts that might apply</p>
          <p className="mt-1 text-xs text-ink/50">
            Estimate only — tick any that you believe apply. Final eligibility is always confirmed during application.
          </p>
          <div className="mt-3 space-y-2">
            {discounts.map((d, i) => {
              if (d.appliesAutomatically) return null;
              return (
                <label key={`${d.label}-${i}`} className="flex items-start gap-2 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gold-light/60"
                    checked={!!checkedDiscounts[i]}
                    onChange={(e) => setCheckedDiscounts((prev) => ({ ...prev, [i]: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium text-ink">I believe I qualify for: {d.label}</span>
                    {d.eligibilityDescription && <span className="block text-xs text-ink/60">{d.eligibilityDescription}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-cream p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink/70">Base fee ({FREQUENCIES.find((f) => f.value === frequency)?.label})</span>
          <span className="font-medium text-ink">{formatGBP(baseFee)}</span>
        </div>

        {hasAnyDiscounts &&
          lineItems.map((item, i) => (
            <div key={i} className="mt-1 flex items-center justify-between text-sm text-gold-700">
              <span>{item.label}</span>
              <span>−{formatGBP(item.amountOff)}</span>
            </div>
          ))}

        <div className="mt-3 flex items-center justify-between border-t border-gold-light/50 pt-3">
          <span className="font-semibold text-ink">Estimated total</span>
          <span className="font-serif text-xl font-bold text-ink">{formatGBP(estimatedTotal)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink/50">
        This is an estimate for planning purposes only, not a binding quote — final fees and eligibility are confirmed during
        application.
      </p>
    </div>
  );
}
