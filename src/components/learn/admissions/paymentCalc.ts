import { FEE_POLICY_DEFAULTS, applyAnnualDiscount, computeFeeSchedule } from "@/lib/fees";
import type { AdmissionsSettings, FeeBandRow, PlanId, StageDetails } from "@/components/learn/admissions/stageTypes";

/** Policy deadline for the 2% annual-payment discount (Fees Policy 2026-27). */
export const ANNUAL_DISCOUNT_DEADLINE = "4 December 2026";

function yearNumber(label: string): number | null {
  if (/reception/i.test(label)) return 0;
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : null;
}

/** Find the fee band whose "Reception – Year 2"-style range contains the year group. */
export function bandForYearGroup(yearGroup: string, bands: FeeBandRow[]): FeeBandRow | null {
  const y = yearNumber(yearGroup);
  if (y === null) return null;
  for (const b of bands) {
    const parts = b.year_group_range.split(/\s*[–-]\s*|\s+to\s+/i);
    const lo = yearNumber(parts[0]);
    const hi = parts.length > 1 ? yearNumber(parts[parts.length - 1]) : lo;
    if (lo !== null && hi !== null && y >= lo && y <= hi) return b;
  }
  return null;
}

export type PlanOption = { id: PlanId; label: string; firstPayment: number; detail: string };

export type FeeSummary = {
  applicationFee: number;
  applicationFeeReceived: boolean;
  registrationFee: number;
  annualFee: number | null;
  /** First-payment options; empty when no annual fee can be determined. */
  plans: PlanOption[];
  /** Minimum first payment (the monthly instalment). */
  minFirstPayment: number | null;
  /** The plan used for "amount due" (staff-chosen, else the family's stated intent, else null). */
  activePlan: PlanId | null;
  activeFirstPayment: number | null;
  /** application fee (if unpaid) + registration fee + first payment of the active plan; null if no plan. */
  dueNowTotal: number | null;
  /** The same, but using the minimum first payment (monthly) when no plan is chosen. */
  dueNowMinimum: number | null;
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function summariseFees(args: {
  yearGroup: string;
  adminFeeAmount: number | null;
  settings: AdmissionsSettings | null;
  bands: FeeBandRow[];
  details: StageDetails | null;
  planIntent?: string | null;
}): FeeSummary {
  const { settings, details } = args;
  const applicationFee = details?.application_fee_amount ?? settings?.application_fee ?? FEE_POLICY_DEFAULTS.applicationFee;
  const registrationFee = args.adminFeeAmount ?? settings?.registration_fee ?? FEE_POLICY_DEFAULTS.registrationFee;
  const applicationFeeReceived = Boolean(details?.application_fee_received);
  const annualFee = details?.annual_fee_override ?? bandForYearGroup(args.yearGroup, args.bands)?.annual_fee ?? null;

  const plans: PlanOption[] = [];
  if (annualFee !== null) {
    const sched = computeFeeSchedule(annualFee, { terms: settings?.fee_terms, instalments: settings?.fee_instalments });
    const disc = applyAnnualDiscount(sched.annual, settings?.annual_discount_percent ?? FEE_POLICY_DEFAULTS.annualDiscountPercent);
    plans.push({
      id: "monthly",
      label: `Monthly (${sched.instalments} instalments)`,
      firstPayment: sched.monthly[0],
      detail: `first instalment ${gbp(sched.monthly[0])} of ${sched.instalments}, ${gbp(sched.annual)} in total`,
    });
    plans.push({
      id: "termly",
      label: `Termly (${sched.terms} payments)`,
      firstPayment: sched.termly[0],
      detail: `first payment ${gbp(sched.termly[0])} of ${sched.terms}, ${gbp(sched.annual)} in total`,
    });
    plans.push({
      id: "annual",
      label: "Annual, paid in full",
      firstPayment: disc.total,
      detail: disc.discount > 0 ? `${gbp(disc.total)} after the ${gbp(disc.discount)} discount if paid in full by ${ANNUAL_DISCOUNT_DEADLINE}` : `${gbp(disc.total)} for the year`,
    });
  }

  const intent = args.planIntent === "annual" || args.planIntent === "termly" || args.planIntent === "monthly" ? args.planIntent : null;
  const activePlan = details?.chosen_plan ?? intent;
  const planAmount = (id: PlanId | null) => plans.find((p) => p.id === id)?.firstPayment ?? null;
  const activeFirstPayment = details?.first_payment_override ?? planAmount(activePlan);
  const base = (applicationFeeReceived ? 0 : applicationFee) + registrationFee;
  const minFirst = details?.first_payment_override ?? planAmount("monthly");

  return {
    applicationFee,
    applicationFeeReceived,
    registrationFee,
    annualFee,
    plans,
    minFirstPayment: minFirst,
    activePlan,
    activeFirstPayment,
    dueNowTotal: activeFirstPayment === null ? null : r2(base + activeFirstPayment),
    dueNowMinimum: minFirst === null ? null : r2(base + minFirst),
  };
}

export { gbp };
