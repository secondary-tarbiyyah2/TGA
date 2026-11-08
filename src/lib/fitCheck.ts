/**
 * Logic for the public "Is it right for us?" check (/eligibility): which
 * questions show, the school day in the family's time zone, the honest
 * reasons and verdict, and the family's fees. Pure (no React, no Supabase),
 * so it is easy to reason about. All wording comes from
 * src/content/fitCheck.ts.
 *
 * Verdict: any "talk" reason gives "Let's talk first"; otherwise any "sort"
 * reason gives "A good fit, with a few things to sort out"; otherwise
 * "A strong fit". "good" and "info" reasons never lower the verdict.
 */

import { FIT_CHECK } from "@/content/fitCheck";
import { keyStages, lessonsAWeek, type KeyStage } from "@/content/curriculum";
import type { FeeBand } from "@/content/seed";
import { estimateFamilyFees, FEE_POLICY_DEFAULTS, type FamilyEstimate, type PaymentPlan } from "@/lib/fees";
import { UK_TIME_ZONE } from "@/lib/timezones";

const R = FIT_CHECK.reasons;

export type StepKey = "children" | "location" | "reason" | "priorities" | "setup" | "adult" | "needs" | "start";

export type FitAnswers = {
  /** One year group ("Year 1" to "Year 11") per child; null until chosen. */
  children: (string | null)[];
  timeZone: string;
  /** ISO country code chosen with the time zone (e.g. "AE"), or null if unknown. */
  country?: string | null;
  reason: string | null;
  priorities: string[];
  setup: string | null;
  adult: string | null;
  needs: string | null;
  needsNote: string;
  start: string | null;
};

export const EMPTY_ANSWERS: FitAnswers = {
  children: [null],
  timeZone: UK_TIME_ZONE,
  country: "GB",
  reason: null,
  priorities: [],
  setup: null,
  adult: null,
  needs: null,
  needsNote: "",
  start: null,
};

export function yearNumber(year: string | null): number {
  const n = Number((year ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const isPrimary = (n: number) => n >= 1 && n <= 6;

export function chosenYears(a: FitAnswers): string[] {
  return a.children.filter((c): c is string => !!c);
}

export function hasPrimaryChild(a: FitAnswers): boolean {
  return chosenYears(a).some((y) => isPrimary(yearNumber(y)));
}

/** The questions this family sees, in order (the adult question only when a child is in Years 1 to 6). */
export function visibleSteps(a: FitAnswers): StepKey[] {
  const steps: StepKey[] = ["children", "location", "reason", "priorities", "setup"];
  if (hasPrimaryChild(a)) steps.push("adult");
  steps.push("needs", "start");
  return steps;
}

export function stepComplete(step: StepKey, a: FitAnswers): boolean {
  switch (step) {
    case "children":
      return a.children.length > 0 && a.children.every((c) => !!c);
    case "location":
      return !!a.timeZone;
    case "priorities":
      return a.priorities.length > 0;
    case "reason":
    case "setup":
    case "adult":
    case "needs":
    case "start":
      return !!a[step];
  }
}

// ── the school day in the family's time zone ────────────────────────────

/** Representative term dates: a winter week (UK on GMT) and a summer week (UK on BST). */
const WINTER = { y: 2027, m: 1, d: 11 };
const SUMMER = { y: 2027, m: 6, d: 7 };
/** Live day on UK time, from SCHOOL_WEEK_NOTE in src/content/curriculum.ts. */
export const UK_DAY = { start: [9, 0], end: [15, 0], fridayEnd: [12, 0] } as const;
const COMFORT_START = 7 * 60;
const COMFORT_END = 21 * 60;
const EDGE_START = 8 * 60;
const EDGE_END = 18 * 60;

function wallClock(at: Date, tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** The instant at which the UK wall clock shows the given date and time. */
function ukInstant(day: { y: number; m: number; d: number }, h: number, min: number): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d, h, min);
  const wall = wallClock(new Date(guess), UK_TIME_ZONE);
  const offset = wall.minutes - (h * 60 + min);
  // Same calendar day in every case we use (UK is GMT or GMT+1).
  return new Date(guess - offset * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export type LocalTime = { label: string; minutes: number; dayShift: number };
export type LocalDay = { start: LocalTime; end: LocalTime; fridayEnd: LocalTime };

function toLocal(at: Date, tz: string): LocalTime {
  const local = wallClock(at, tz);
  const uk = wallClock(at, UK_TIME_ZONE);
  const dayShift = Math.round((Date.parse(local.date) - Date.parse(uk.date)) / 86_400_000);
  return { label: hhmm(local.minutes), minutes: local.minutes, dayShift };
}

function localDay(tz: string, day: { y: number; m: number; d: number }): LocalDay {
  return {
    start: toLocal(ukInstant(day, UK_DAY.start[0], UK_DAY.start[1]), tz),
    end: toLocal(ukInstant(day, UK_DAY.end[0], UK_DAY.end[1]), tz),
    fridayEnd: toLocal(ukInstant(day, UK_DAY.fridayEnd[0], UK_DAY.fridayEnd[1]), tz),
  };
}

export type TimingTone = "good" | "edge" | "late";

function toneFor(tz: string, day: { y: number; m: number; d: number }): TimingTone {
  let tone: TimingTone = "good";
  const startAt = ukInstant(day, UK_DAY.start[0], UK_DAY.start[1]).getTime();
  const endAt = ukInstant(day, UK_DAY.end[0], UK_DAY.end[1]).getTime();
  for (let t = startAt; t <= endAt; t += 15 * 60_000) {
    const m = wallClock(new Date(t), tz).minutes;
    if (m < COMFORT_START || m > COMFORT_END) return "late";
    if (m < EDGE_START || m > EDGE_END) tone = "edge";
  }
  return tone;
}

export type Timing = {
  winter: LocalDay;
  summer: LocalDay;
  /** True when the family's times move against the UK's when the clocks change. */
  changesInSummer: boolean;
  /** The less favourable of the winter and summer weeks, and that week's times. */
  tone: TimingTone;
  worst: LocalDay;
  ukStart: string;
  ukEnd: string;
  ukFridayEnd: string;
};

export function assessTiming(tz: string): Timing {
  const winter = localDay(tz, WINTER);
  const summer = localDay(tz, SUMMER);
  const rank: Record<TimingTone, number> = { good: 0, edge: 1, late: 2 };
  const winterTone = toneFor(tz, WINTER);
  const summerTone = toneFor(tz, SUMMER);
  const tone = rank[summerTone] > rank[winterTone] ? summerTone : winterTone;
  return {
    winter,
    summer,
    worst: rank[summerTone] > rank[winterTone] ? summer : winter,
    changesInSummer: winter.start.label !== summer.start.label,
    tone,
    ukStart: hhmm(UK_DAY.start[0] * 60 + UK_DAY.start[1]),
    ukEnd: hhmm(UK_DAY.end[0] * 60 + UK_DAY.end[1]),
    ukFridayEnd: hhmm(UK_DAY.fridayEnd[0] * 60 + UK_DAY.fridayEnd[1]),
  };
}

// ── key stage and fees ──────────────────────────────────────────────────

/** Index into keyStages and the fee bands (both ordered Year 1-2, 3-6, 7-9, 10-11). */
function bandIndex(n: number): number {
  if (n <= 2) return 0;
  if (n <= 6) return 1;
  if (n <= 9) return 2;
  return 3;
}

export function keyStageFor(year: string): KeyStage | null {
  return keyStages[bandIndex(yearNumber(year))] ?? null;
}

export function lessonsLine(year: string): string {
  const ks = keyStageFor(year);
  return ks ? lessonsAWeek(ks) : "";
}

/** The fee band whose range ("Year 3 – Year 6") contains the year, falling back to the band order. */
export function feeBandFor(year: string, bands: FeeBand[]): FeeBand | null {
  const n = yearNumber(year);
  const byRange = bands.find((b) => {
    const nums = (b.yearGroupRange.match(/\d+/g) ?? []).map(Number);
    if (nums.length === 0) return false;
    return n >= Math.min(...nums) && n <= Math.max(...nums);
  });
  return byRange ?? bands[bandIndex(n)] ?? null;
}

export type FeeSettingsInput = {
  terms: number;
  instalments: number;
  annualDiscountPercent: number;
  siblingDiscountPercent?: number;
  applicationFee?: number;
};

export type FamilyFees = {
  children: { year: string; band: string; annual: number }[];
  plans: Record<PaymentPlan, FamilyEstimate>;
  applicationFee: number;
  siblingPercent: number | null;
};

export function familyFees(years: string[], bands: FeeBand[], s: FeeSettingsInput): FamilyFees | null {
  const children = years.map((year) => {
    const band = feeBandFor(year, bands);
    return band ? { year, band: band.yearGroupRange, annual: band.annualFee } : null;
  });
  if (children.length === 0 || children.some((c) => !c)) return null;
  const list = children as { year: string; band: string; annual: number }[];
  const applicationFee = s.applicationFee ?? FEE_POLICY_DEFAULTS.applicationFee;
  const sibling = s.siblingDiscountPercent != null && s.siblingDiscountPercent > 0 ? s.siblingDiscountPercent : null;
  const estimate = (plan: PaymentPlan) =>
    estimateFamilyFees({
      children: list.map((c) => ({ label: c.year, annual: c.annual })),
      plan,
      terms: s.terms,
      instalments: s.instalments,
      annualDiscountPercent: s.annualDiscountPercent,
      siblingDiscountPercent: sibling ?? undefined,
      applicationFee,
    });
  return { children: list, plans: { annual: estimate("annual"), termly: estimate("termly"), monthly: estimate("monthly") }, applicationFee, siblingPercent: sibling };
}

// ── reasons and verdict ─────────────────────────────────────────────────

export type ReasonTone = "good" | "info" | "sort" | "talk";
export type Reason = { tone: ReasonTone; text: string };
export type Verdict = "strong" | "sort" | "talk";

const optionLabel = (options: readonly { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;

export function buildReasons(a: FitAnswers, timing: Timing): Reason[] {
  const out: Reason[] = [];
  const { start, end } = timing.worst;
  const window = [start.label, end.label] as const;

  if (timing.tone === "late") out.push({ tone: "talk", text: R.timezoneLate(...window) });
  else if (timing.tone === "edge") out.push({ tone: "sort", text: R.timezoneEdge(...window) });
  else out.push({ tone: "good", text: R.timezoneGood(...window) });

  if (a.setup === "yes") out.push({ tone: "good", text: R.setupReady });
  else if (a.setup === "arrange") out.push({ tone: "info", text: R.arrangeDevice });
  else if (a.setup === "no") out.push({ tone: "sort", text: R.noDevice });

  if (hasPrimaryChild(a)) {
    if (a.adult === "usually") out.push({ tone: "good", text: R.primaryAdult });
    else if (a.adult === "sometimes") out.push({ tone: "sort", text: R.primarySometimesAdult });
    else if (a.adult === "rarely") out.push({ tone: "talk", text: R.primaryNoAdult });
  }

  if (a.needs === "significant") out.push({ tone: "talk", text: R.significantNeeds });
  else if (a.needs === "some") out.push({ tone: "info", text: R.someNeeds });

  if (a.start === "january" && chosenYears(a).some((y) => yearNumber(y) === 11)) out.push({ tone: "talk", text: R.year11January });

  if (a.priorities.length > 0) {
    const labels = a.priorities.map((p) => optionLabel(FIT_CHECK.questions.priorities.options, p)).join(", ");
    out.push({ tone: "good", text: R.priorities(labels) });
  }

  if (a.start === "later") out.push({ tone: "info", text: R.laterStart });
  else if (a.start === "exploring") out.push({ tone: "info", text: R.exploring });

  // Concerns first, then things to know, then the reasons it fits.
  const order: Record<ReasonTone, number> = { talk: 0, sort: 1, info: 2, good: 3 };
  return out.sort((x, y) => order[x.tone] - order[y.tone]);
}

export function verdictFor(reasons: Reason[]): Verdict {
  if (reasons.some((r) => r.tone === "talk")) return "talk";
  if (reasons.some((r) => r.tone === "sort")) return "sort";
  return "strong";
}

export type NextStepKey = keyof typeof FIT_CHECK.sections.next.steps;

export function nextStepFor(verdict: Verdict, start: string | null): NextStepKey {
  if (verdict === "talk") return "talk";
  if (start === "later") return "later";
  if (start === "exploring") return "exploring";
  return verdict === "strong" ? "strongJanuary" : "sortJanuary";
}

// ── checklist ───────────────────────────────────────────────────────────

export type NeedStatus = "ready" | "arrange" | "missing" | "check";
export type NeedItem = { key: keyof typeof FIT_CHECK.sections.need.items; status: NeedStatus };

export function buildNeeds(a: FitAnswers): NeedItem[] {
  const years = chosenYears(a).map(yearNumber);
  const setupStatus: NeedStatus = a.setup === "yes" ? "ready" : a.setup === "arrange" ? "arrange" : "missing";
  const items: NeedItem[] = [
    { key: "device", status: setupStatus },
    { key: "space", status: setupStatus },
  ];
  if (years.some(isPrimary)) items.push({ key: "adult", status: a.adult === "usually" ? "ready" : a.adult === "sometimes" ? "arrange" : "missing" });
  if (years.some((n) => n <= 2)) items.push({ key: "ks1Parent", status: "check" });
  if (years.some((n) => n >= 10)) items.push({ key: "exams", status: "check" });
  if (a.needs === "some" || a.needs === "significant") items.push({ key: "support", status: "check" });
  return items;
}

/** A random id for a row the browser may insert but never read back (quiz_leads has no anon SELECT policy). Event handlers only. */
export function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
