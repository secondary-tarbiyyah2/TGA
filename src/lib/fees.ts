/**
 * Single source of truth for fee schedules.
 *
 * Only ONE number per band is ever stored: the annual fee. Termly and monthly
 * figures are always derived here from that annual fee plus two global
 * settings (number of terms, number of monthly instalments), so the
 * instalments can never disagree with the annual fee.
 *
 * All arithmetic is done in integer pence. Each instalment except the last is
 * the exact share rounded to the nearest penny; the LAST instalment absorbs
 * the rounding remainder, so the instalments always sum to exactly the
 * annual fee.
 *
 * Pure module: no imports from content/seed (type-only structural generics),
 * safe to use from server, client and `bun` scripts.
 */

export type FeeSettings = { terms: number; instalments: number };

/** Fees Policy 2026-27: shortened Dec 2026-Jul 2027 period = 2 termly payments, 8 monthly payments. */
export const FEE_DEFAULTS: FeeSettings = { terms: 2, instalments: 8 };
/** Instalment counts the admin UI offers (any whole number 1-12 is accepted by the maths). */
export const INSTALMENT_CHOICES = [8, 10, 12] as const;

export const DEFAULT_PAYMENT_SCHEDULE_TEXT =
  "Termly payments are due on 4 December 2026 and 28 March 2027. The first monthly payment is due on 4 December 2026, then payments are taken on the 28th of each month from 28 December 2026 to 28 June 2027. The registration fee is due on acceptance and no later than 4 December 2026.";

/** Non-schedule fee defaults from the Fees Policy PDF (all editable in the admin Fees editor). */
export const FEE_POLICY_DEFAULTS = {
  applicationFee: 50,
  registrationFee: 250,
  /** % off the annual total when the annual option is paid in full by the due date (4 Dec 2026). */
  annualDiscountPercent: 2,
  paymentScheduleText: DEFAULT_PAYMENT_SCHEDULE_TEXT,
} as const;

/** Annual fee after the annual-payment discount, rounded to the penny. */
export function applyAnnualDiscount(annual: number, percent: number): { discount: number; total: number } {
  const pct = Number.isFinite(percent) && percent > 0 ? Math.min(100, percent) : 0;
  const discountPence = Math.round((toPence(annual) * pct) / 100);
  return { discount: toPounds(discountPence), total: toPounds(toPence(annual) - discountPence) };
}

/**
 * If the derived monthly plan is uneven, return a note comparing it with the
 * rounded regular figure a PDF policy would print (regular x count), so admins
 * can see why the last instalment differs. Null when the plan is even.
 */
export function roundingNote(monthly: number[]): string | null {
  const n = monthly.length;
  if (n < 2) return null;
  const first = monthly[0];
  const last = monthly[n - 1];
  if (first === last) return null;
  const printedTotal = toPounds(toPence(first) * n);
  return `Policy-style rounded figure ${gbp(first)} x ${n} = ${gbp(printedTotal)}; the site charges ${n - 1} x ${gbp(first)} + final ${gbp(last)} so the total is exactly ${gbp(sumPounds(monthly))}.`;
}
export const MAX_TERMS = 6;
export const MAX_INSTALMENTS = 12;

export type FeeSchedule = {
  annual: number;
  terms: number;
  instalments: number;
  /** One entry per term; sums exactly to `annual`. */
  termly: number[];
  /** One entry per monthly instalment; sums exactly to `annual`. */
  monthly: number[];
  /** The regular (first) per-term / per-month amount. */
  termlyAmount: number;
  monthlyAmount: number;
  termlyEven: boolean;
  monthlyEven: boolean;
};

const toPence = (pounds: number): number => Math.round(pounds * 100);
const toPounds = (pence: number): number => pence / 100;

function toWhole(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamp untrusted/DB values to sane whole numbers, falling back to the defaults. */
export function sanitiseFeeSettings(input?: { terms?: unknown; instalments?: unknown } | null): FeeSettings {
  return {
    terms: toWhole(input?.terms, FEE_DEFAULTS.terms, 1, MAX_TERMS),
    instalments: toWhole(input?.instalments, FEE_DEFAULTS.instalments, 1, MAX_INSTALMENTS),
  };
}

/** Split `total` (pounds) into `count` instalments that sum exactly to `total`; remainder goes on the last. */
export function splitInstalments(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const totalPence = toPence(total);
  const each = Math.round(totalPence / n);
  const out: number[] = [];
  let running = 0;
  for (let i = 0; i < n - 1; i++) {
    out.push(each);
    running += each;
  }
  out.push(totalPence - running);
  return out.map(toPounds);
}

/** Exact sum of a list of pound amounts, computed in pence (no float drift). */
export function sumPounds(amounts: number[]): number {
  return toPounds(amounts.reduce((s, a) => s + toPence(a), 0));
}

export function computeFeeSchedule(annual: number, settings?: { terms?: unknown; instalments?: unknown } | null): FeeSchedule {
  const s = sanitiseFeeSettings(settings);
  const annualR = toPounds(toPence(annual));
  const termly = splitInstalments(annualR, s.terms);
  const monthly = splitInstalments(annualR, s.instalments);
  return {
    annual: annualR,
    terms: s.terms,
    instalments: s.instalments,
    termly,
    monthly,
    termlyAmount: termly[0],
    monthlyAmount: monthly[0],
    termlyEven: termly.every((a) => a === termly[0]),
    monthlyEven: monthly.every((a) => a === monthly[0]),
  };
}

/**
 * Attach derived termly/monthly (plus the full schedule) to a band. The
 * stored termlyFee/monthlyFee on old rows are IGNORED and overwritten.
 */
export function withDerivedFees<T extends { annualFee: number }>(
  band: T,
  settings?: { terms?: unknown; instalments?: unknown } | null
): T & { termlyFee: number; monthlyFee: number; schedule: FeeSchedule } {
  const schedule = computeFeeSchedule(band.annualFee, settings);
  return { ...band, termlyFee: schedule.termlyAmount, monthlyFee: schedule.monthlyAmount, schedule };
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Human description of a plan, e.g. { headline: "£532.00 / term", detail: "3 terms · Total £1,596.00" }. */
export function describePlan(amounts: number[], unit: "term" | "month"): { headline: string; detail: string; total: number } {
  const total = sumPounds(amounts);
  const n = amounts.length;
  const noun = unit === "term" ? (n === 1 ? "term" : "terms") : n === 1 ? "payment" : "monthly payments";
  const even = amounts.every((a) => a === amounts[0]);
  const headline = `${gbp(amounts[0])} / ${unit}`;
  const detail = even
    ? `${n} ${noun} · Total ${gbp(total)}`
    : `${n - 1} × ${gbp(amounts[0])} + final ${gbp(amounts[n - 1])} · Total ${gbp(total)}`;
  return { headline, detail, total };
}

/** Replace {{applicationFee}}, {{registrationFee}}, {{terms}}, {{instalments}}, {{annualDiscount}} tokens in editable copy (e.g. FAQ answers). */
export function applyFeeTokens(
  text: string,
  v: { applicationFee?: number; registrationFee?: number; terms?: number; instalments?: number; annualDiscountPercent?: number }
): string {
  const fmt = (n?: number) => (n == null ? null : Number.isInteger(n) ? `£${n}` : gbp(n));
  const map: Record<string, string | null> = {
    applicationFee: fmt(v.applicationFee),
    registrationFee: fmt(v.registrationFee),
    terms: v.terms != null ? String(v.terms) : null,
    instalments: v.instalments != null ? String(v.instalments) : null,
    annualDiscount: v.annualDiscountPercent != null ? `${v.annualDiscountPercent}%` : null,
  };
  return text.replace(/\{\{(applicationFee|registrationFee|terms|instalments|annualDiscount)\}\}/g, (m, k: string) => map[k] ?? m);
}

export type PaymentPlan = "annual" | "termly" | "monthly";

export type EstimateDiscountInput = { label: string; type: "percent" | "fixedAmount"; percent?: number; fixedAmount?: number; note?: string };

export type FamilyEstimateInput = {
  /** One entry per child: the band label and its ANNUAL fee (from fee_bands). */
  children: { label: string; annual: number }[];
  plan: PaymentPlan;
  terms: number;
  instalments: number;
  /** % off total tuition when the annual plan is chosen (Fees Policy: 2). */
  annualDiscountPercent: number;
  /** % off each child after the first (site_settings.sibling_discount_percent). */
  siblingDiscountPercent?: number;
  /** Catalogue discounts that apply (automatic ones plus any the family ticked). */
  extraDiscounts?: EstimateDiscountInput[];
  applicationFee: number;
  registrationFee: number;
};

export type FamilyEstimate = {
  perChild: { label: string; gross: number; siblingDiscount: number; net: number }[];
  gross: number;
  discounts: { label: string; note?: string; amountOff: number }[];
  totalDiscount: number;
  /** Tuition after discounts. */
  total: number;
  payments: number[];
  paymentUnit: "year" | "term" | "month";
  firstPayment: number;
  applicationFeeTotal: number;
  registrationFeeTotal: number;
  /** Registration fee(s) + first tuition payment: what is due once an offer is accepted. */
  dueOnAcceptance: number;
};

/**
 * Pure family fee estimate in integer pence. Sibling discount applies to each
 * child after the first (in the order entered); the annual-payment discount and
 * percentage catalogue discounts come off the combined gross; fixed-amount
 * catalogue discounts come off once per family. Discounts can never take the
 * total below zero. The discounted total is then split with splitInstalments
 * so the plan sums exactly to the total.
 */
export function estimateFamilyFees(input: FamilyEstimateInput): FamilyEstimate {
  const n = input.children.length;
  const pct = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? Math.min(100, v as number) : 0);
  const perChildP = input.children.map((c, i) => {
    const gross = toPence(c.annual);
    const sib = i > 0 ? Math.round((gross * pct(input.siblingDiscountPercent)) / 100) : 0;
    return { label: c.label, gross, sib };
  });
  const grossP = perChildP.reduce((s, c) => s + c.gross, 0);
  const discountsP: { label: string; note?: string; amountOff: number }[] = [];
  const sibTotal = perChildP.reduce((s, c) => s + c.sib, 0);
  if (sibTotal > 0) discountsP.push({ label: `Sibling discount (${pct(input.siblingDiscountPercent)}% off child 2${n > 2 ? " onwards" : ""})`, amountOff: sibTotal });
  for (const d of input.extraDiscounts ?? []) {
    const off = d.type === "percent" ? Math.round((grossP * pct(d.percent)) / 100) : toPence(d.fixedAmount ?? 0);
    if (off > 0) discountsP.push({ label: d.label, note: d.note, amountOff: off });
  }
  if (input.plan === "annual" && pct(input.annualDiscountPercent) > 0) {
    discountsP.push({
      label: `Annual payment discount (${pct(input.annualDiscountPercent)}%)`,
      note: "If paid in full by 4 December 2026.",
      amountOff: Math.round((grossP * pct(input.annualDiscountPercent)) / 100),
    });
  }
  let remaining = grossP;
  const discounts = discountsP.map((d) => {
    const off = Math.min(d.amountOff, remaining);
    remaining -= off;
    return { ...d, amountOff: toPounds(off) };
  });
  const totalP = remaining;
  const count = input.plan === "termly" ? Math.max(1, input.terms) : input.plan === "monthly" ? Math.max(1, input.instalments) : 1;
  const payments = splitInstalments(toPounds(totalP), count);
  const appTotal = toPence(input.applicationFee) * n;
  const regTotal = toPence(input.registrationFee) * n;
  return {
    perChild: perChildP.map((c) => ({ label: c.label, gross: toPounds(c.gross), siblingDiscount: toPounds(c.sib), net: toPounds(c.gross - c.sib) })),
    gross: toPounds(grossP),
    discounts,
    totalDiscount: toPounds(grossP - totalP),
    total: toPounds(totalP),
    payments,
    paymentUnit: input.plan === "annual" ? "year" : input.plan === "termly" ? "term" : "month",
    firstPayment: payments[0],
    applicationFeeTotal: toPounds(appTotal),
    registrationFeeTotal: toPounds(regTotal),
    dueOnAcceptance: toPounds(regTotal + toPence(payments[0])),
  };
}

export const FEES_POLICY_REMINDER = "Check the Fees Policy PDF states the same schedule.";

/**
 * Self-check: throws if any invariant is broken. Runs at module load outside
 * production, and can be run by hand: `bun -e 'import("./src/lib/fees.ts").then(m=>m.runFeeSelfCheck())'`.
 */
export function runFeeSelfCheck(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`fees self-check failed: ${msg}`);
  };
  const annuals = [1710, 2282, 2996, 3214, 1000, 999.99, 0.01, 1234.56, 3333.33];
  for (const annual of annuals) {
    for (const terms of [1, 2, 3, 4]) {
      for (const instalments of [1, 7, 8, 10, 12]) {
        const s = computeFeeSchedule(annual, { terms, instalments });
        assert(s.termly.length === terms, `term count ${annual}/${terms}`);
        assert(s.monthly.length === instalments, `instalment count ${annual}/${instalments}`);
        assert(toPence(sumPounds(s.termly)) === toPence(annual), `termly sum ${annual}/${terms}`);
        assert(toPence(sumPounds(s.monthly)) === toPence(annual), `monthly sum ${annual}/${instalments}`);
        assert(s.termly.every((a) => toPence(a) === Math.round(toPence(a))), "pence precision");
      }
    }
  }
  const d = computeFeeSchedule(1710, FEE_DEFAULTS);
  assert(d.termlyAmount === 855 && d.monthlyAmount === 213.75, "published Y1-Y2 defaults");
  const y36 = computeFeeSchedule(2282, FEE_DEFAULTS);
  assert(y36.termlyAmount === 1141 && y36.monthlyAmount === 285.25 && y36.monthly[7] === 285.25, "Y3-6 policy figures");
  assert(computeFeeSchedule(2996, FEE_DEFAULTS).monthlyAmount === 374.5, "Y7-9 monthly");
  assert(computeFeeSchedule(3214, FEE_DEFAULTS).monthlyAmount === 401.75, "Y10-11 monthly");
  assert(applyAnnualDiscount(1710, 2).total === 1675.8, "2% annual discount");
  const est = estimateFamilyFees({ children: [{ label: "a", annual: 1710 }, { label: "b", annual: 2282 }], plan: "annual", terms: 2, instalments: 8, annualDiscountPercent: 2, siblingDiscountPercent: 10, applicationFee: 50, registrationFee: 150 });
  assert(toPence(est.total) === toPence(est.gross) - toPence(est.totalDiscount), "estimate total = gross - discounts");
  assert(est.registrationFeeTotal === 300 && est.dueOnAcceptance === est.total + 300, "estimate due on acceptance");
  const m = estimateFamilyFees({ children: [{ label: "a", annual: 2282 }], plan: "monthly", terms: 2, instalments: 8, annualDiscountPercent: 2, applicationFee: 50, registrationFee: 150 });
  assert(m.total === 2282 && m.payments.length === 8 && m.firstPayment === 285.25 && toPence(sumPounds(m.payments)) === 228200, "monthly estimate, no annual discount");
  const odd = splitInstalments(100, 3);
  assert(odd[0] === 33.33 && odd[1] === 33.33 && odd[2] === 33.34, "remainder on last instalment");
  assert(sanitiseFeeSettings({ terms: "x", instalments: 99 }).terms === FEE_DEFAULTS.terms, "sanitise fallback");
  assert(sanitiseFeeSettings({ instalments: 99 }).instalments === MAX_INSTALMENTS, "sanitise clamp");
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") runFeeSelfCheck();
