// Fee plan maths for the payments functions. Pure: no Deno or Supabase
// imports, so src/lib/payments/feePlan.test.ts checks it against
// src/lib/fees.ts (the website's and portal's single source of truth).
// Everything is in integer pence; the last instalment absorbs rounding.
//
// Schedule 2026-27 (Fees Policy, Tafweed 3, owner 11 Nov 2026):
//   annual   one payment on acceptance (2% off), by 8 January 2027 at the latest
//   termly   two payments: on acceptance (by 8 January 2027) and 28 March 2027
//   monthly  seven payments: on acceptance (by 8 January 2027), then the 28th
//            of each month from January to June 2027
// Sibling discount on tuition: 5% second child, 10% third and later, ranked
// by fee (highest first), never on the first child.

export type Plan = "annual" | "termly" | "monthly";
export const PLANS: Plan[] = ["annual", "termly", "monthly"];
export const PLAN_LABEL: Record<Plan, string> = {
  annual: "Pay in full (2% off)",
  termly: "Two payments",
  monthly: "Seven monthly payments",
};

export const FIRST_PAYMENT_LATEST = "2027-01-08";
export const TERMLY_SECOND = "2027-03-28";
export const MONTHLY_LATER = ["2027-01-28", "2027-02-28", "2027-03-28", "2027-04-28", "2027-05-28", "2027-06-28"];
/** Days a family has to make the first payment after choosing a plan (within the offer's five working days). */
export const FIRST_PAYMENT_DAYS = 7;

export type Band = { yearGroupRange: string; annualFee: number };

function yearNumber(name: string): number | "reception" | null {
  const lower = name.toLowerCase();
  if (/reception|nursery/.test(lower)) return "reception";
  const m = lower.match(/year\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Same rule as src/lib/learn/fees.ts matchFeeBand. */
export function matchBand(yearGroup: string | null | undefined, bands: Band[]): Band | null {
  if (!yearGroup) return null;
  const target = yearNumber(yearGroup);
  if (target === null) return null;
  for (const band of bands) {
    const parts = band.yearGroupRange.split(/[–—-]/).map((p) => yearNumber(p.trim()));
    const nums = parts.filter((p): p is number => typeof p === "number");
    if (target === "reception") {
      if (parts.includes("reception")) return band;
      continue;
    }
    if (nums.length === 1 && target === nums[0]) return band;
    if (nums.length >= 2 && target >= Math.min(...nums) && target <= Math.max(...nums)) return band;
  }
  return null;
}

export const toPence = (pounds: number): number => Math.round(pounds * 100);

/** Split pence into `count` parts; each the rounded share, the last absorbs the remainder (as splitInstalments). */
export function splitPence(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const each = Math.round(total / n);
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) out.push(each);
  out.push(total - each * (n - 1));
  return out;
}

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** When the first payment is due: a week after the plan is chosen, never after 8 January 2027; today if that has passed. */
export function firstDueDate(today: string): string {
  const inAWeek = addDays(today, FIRST_PAYMENT_DAYS);
  if (today >= FIRST_PAYMENT_LATEST) return today;
  return inAWeek < FIRST_PAYMENT_LATEST ? inAWeek : FIRST_PAYMENT_LATEST;
}

export type ChildIn = { key: string; label: string; annualPence: number };
export type PlanLine = { key: string; label: string; plan: Plan; instalmentNo: number; instalmentCount: number; amountPence: number; dueDate: string; kind: "first_payment" | "instalment"; description: string };
export type ChildPlan = { key: string; label: string; grossPence: number; siblingPence: number; annualDiscountPence: number; totalPence: number; lines: PlanLine[] };

export type PlanSettings = { annualDiscountPercent: number; siblingSecondPercent: number; siblingLaterPercent: number };
export const DEFAULT_PLAN_SETTINGS: PlanSettings = { annualDiscountPercent: 2, siblingSecondPercent: 5, siblingLaterPercent: 10 };

const pct = (v: number | null | undefined) => (Number.isFinite(v) && (v as number) > 0 ? Math.min(100, v as number) : 0);

/**
 * Per-child sibling discount in pence, ranked by fee (highest first, stable),
 * as estimateFamilyFees in src/lib/fees.ts.
 */
export function siblingDiscounts(children: ChildIn[], s: PlanSettings): number[] {
  const second = pct(s.siblingSecondPercent);
  const later = second > 0 ? pct(s.siblingLaterPercent || Math.max(second, 10)) : 0;
  const order = children.map((c, i) => ({ i, g: c.annualPence })).sort((a, b) => b.g - a.g || a.i - b.i);
  const rank = new Map(order.map((x, r) => [x.i, r]));
  return children.map((c, i) => {
    const r = rank.get(i) ?? 0;
    const p = r === 0 ? 0 : r === 1 ? second : later;
    return Math.round((c.annualPence * p) / 100);
  });
}

/** The dated payments for every child in the family on one plan. */
export function buildPlan(children: ChildIn[], plan: Plan, today: string, s: PlanSettings = DEFAULT_PLAN_SETTINGS): ChildPlan[] {
  const sib = siblingDiscounts(children, s);
  const first = firstDueDate(today);
  const dates = plan === "annual" ? [first] : plan === "termly" ? [first, TERMLY_SECOND] : [first, ...MONTHLY_LATER];
  // A date already reached when the plan is chosen is due with the first payment.
  const due = dates.map((d, i) => (i === 0 ? d : d < first ? first : d));
  return children.map((c, i) => {
    const afterSibling = c.annualPence - sib[i];
    // As estimateFamilyFees: the annual discount is a share of the full (gross) fee.
    const annualDiscountPence = plan === "annual" ? Math.round((c.annualPence * pct(s.annualDiscountPercent)) / 100) : 0;
    const totalPence = Math.max(0, afterSibling - annualDiscountPence);
    const parts = splitPence(totalPence, due.length);
    const lines: PlanLine[] = parts.map((amountPence, n) => ({
      key: c.key,
      label: c.label,
      plan,
      instalmentNo: n + 1,
      instalmentCount: parts.length,
      amountPence,
      dueDate: due[n],
      kind: n === 0 ? "first_payment" : "instalment",
      description:
        plan === "annual"
          ? `Fees 2026-27, paid in full: ${c.label}`
          : `Fees 2026-27, payment ${n + 1} of ${parts.length}: ${c.label}`,
    }));
    return { key: c.key, label: c.label, grossPence: c.annualPence, siblingPence: sib[i], annualDiscountPence, totalPence, lines };
  });
}

export const formatPence = (p: number): string =>
  `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
