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

export const FEE_DEFAULTS: FeeSettings = { terms: 3, instalments: 12 };
/** Instalment counts the admin UI offers (any whole number 1-12 is accepted by the maths). */
export const INSTALMENT_CHOICES = [10, 12] as const;
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

/** Replace {{applicationFee}}, {{registrationFee}}, {{terms}}, {{instalments}} tokens in editable copy (e.g. FAQ answers). */
export function applyFeeTokens(
  text: string,
  v: { applicationFee?: number; registrationFee?: number; terms?: number; instalments?: number }
): string {
  const fmt = (n?: number) => (n == null ? null : Number.isInteger(n) ? `£${n}` : gbp(n));
  const map: Record<string, string | null> = {
    applicationFee: fmt(v.applicationFee),
    registrationFee: fmt(v.registrationFee),
    terms: v.terms != null ? String(v.terms) : null,
    instalments: v.instalments != null ? String(v.instalments) : null,
  };
  return text.replace(/\{\{(applicationFee|registrationFee|terms|instalments)\}\}/g, (m, k: string) => map[k] ?? m);
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
  const annuals = [1596, 2130, 2796, 3000, 1000, 999.99, 0.01, 1234.56, 3333.33];
  for (const annual of annuals) {
    for (const terms of [1, 2, 3, 4]) {
      for (const instalments of [1, 7, 10, 12]) {
        const s = computeFeeSchedule(annual, { terms, instalments });
        assert(s.termly.length === terms, `term count ${annual}/${terms}`);
        assert(s.monthly.length === instalments, `instalment count ${annual}/${instalments}`);
        assert(toPence(sumPounds(s.termly)) === toPence(annual), `termly sum ${annual}/${terms}`);
        assert(toPence(sumPounds(s.monthly)) === toPence(annual), `monthly sum ${annual}/${instalments}`);
        assert(s.termly.every((a) => toPence(a) === Math.round(toPence(a))), "pence precision");
      }
    }
  }
  const d = computeFeeSchedule(1596, FEE_DEFAULTS);
  assert(d.termlyAmount === 532 && d.monthlyAmount === 133, "published Reception-Y2 defaults");
  assert(computeFeeSchedule(2130, FEE_DEFAULTS).monthlyAmount === 177.5, "Y3-6 monthly");
  const odd = splitInstalments(100, 3);
  assert(odd[0] === 33.33 && odd[1] === 33.33 && odd[2] === 33.34, "remainder on last instalment");
  assert(sanitiseFeeSettings({ terms: "x", instalments: 99 }).terms === 3, "sanitise fallback");
  assert(sanitiseFeeSettings({ instalments: 99 }).instalments === MAX_INSTALMENTS, "sanitise clamp");
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") runFeeSelfCheck();
