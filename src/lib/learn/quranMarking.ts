// Hearing a recitation and turning what the teacher heard into a mark out of 10
// (owner, 11 Nov 2026, feedback 2 item 13: "the page popping up and mistakes being put on and bands of
// strictness for giving students a number"). The idea follows the owner's Ihsan LMS; the code is TGA's own.
//
// The teacher does not choose a number. They tap what happened as the pupil recites:
//  - Prompt: the teacher had to stop or correct them (always 1 point).
//  - Slip: they went wrong but put it right themselves (worth less, set per level).
//  - Tajweed: a tajweed rule missed on a word (set per level; nothing for beginners by default).
// Each mistake can carry the ayah it was on, so the pupil's history shows which ayat to practise.
// The points are counted per page of the mushaf, so a long portion is not punished for being long,
// and the head teacher's strictness bands for the class's level turn points per page into the mark.
// The mark keeps the meanings already used everywhere in the portal (quranClassroom.ts MARK_BANDS).

import { surahAyat } from "./surahs.ts";

export type MarkingLevel = "beginner" | "junior" | "senior";
export const MARKING_LEVELS: ReadonlyArray<{ value: MarkingLevel; label: string; help: string }> = [
  { value: "beginner", label: "Beginner", help: "Young pupils and those new to reading or memorising: the most allowance." },
  { value: "junior", label: "Junior", help: "Pupils reading and memorising steadily: a middle allowance." },
  { value: "senior", label: "Senior", help: "Older pupils and hifdh: the least allowance." },
];
export const levelLabel = (l: MarkingLevel) => MARKING_LEVELS.find((x) => x.value === l)?.label ?? "Junior";

/** The level a year group marks at unless the head teacher sets one for the class: Reception to Year 2
 *  Beginner, Years 3 to 6 Junior, Year 7 and above Senior. */
export function defaultLevelForYear(year: string | null | undefined): MarkingLevel {
  const s = (year || "").toLowerCase();
  if (/reception|nursery|\br\b/.test(s)) return "beginner";
  const n = Number((s.match(/\d+/) || [])[0]);
  if (!Number.isFinite(n) || n === 0) return "junior";
  return n <= 2 ? "beginner" : n <= 6 ? "junior" : "senior";
}

export type MistakeKind = "prompt" | "slip" | "tajweed";
export const MISTAKE_KINDS: ReadonlyArray<{ value: MistakeKind; label: string; ar: string; help: string; key: string }> = [
  { value: "prompt", label: "Prompt", ar: "تنبيه", help: "You had to stop or correct them.", key: "p" },
  { value: "slip", label: "Slip", ar: "خطأ مصحح", help: "They went wrong but put it right themselves.", key: "s" },
  { value: "tajweed", label: "Tajweed", ar: "تجويد", help: "A tajweed rule missed on a word.", key: "t" },
];
export type Mistake = { kind: MistakeKind; ayah: number | null; note?: string | null };

/** The most points per page each result allows. More than `weak` is below 3. */
export type BandLimits = { strong: number; good: number; pass: number; weak: number };
export const BAND_KEYS: ReadonlyArray<keyof BandLimits> = ["strong", "good", "pass", "weak"];
export const BAND_TITLE: Record<keyof BandLimits, string> = { strong: "9 or 10", good: "7 or 8", pass: "5 or 6", weak: "3 or 4" };
export type LevelPoints = Record<MarkingLevel, number>;
export type MarkingStandard = { limits: Record<MarkingLevel, BandLimits>; slip: LevelPoints; tajweed: LevelPoints };

export const DEFAULT_STANDARD: MarkingStandard = {
  limits: {
    beginner: { strong: 1.5, good: 4.5, pass: 9, weak: 15 },
    junior: { strong: 1, good: 3, pass: 6, weak: 10 },
    senior: { strong: 0.5, good: 1.5, pass: 3, weak: 5 },
  },
  slip: { beginner: 0.25, junior: 0.5, senior: 0.5 },
  tajweed: { beginner: 0, junior: 0.25, senior: 0.5 },
};

const LEVELS: MarkingLevel[] = ["beginner", "junior", "senior"];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Numbers from 0 to 100, each result allowing at least as much as the one above it. */
export function validLimits(l: unknown): l is BandLimits {
  if (!l || typeof l !== "object") return false;
  let prev = 0;
  for (const k of BAND_KEYS) {
    const v = num((l as Record<string, unknown>)[k]);
    if (v === null || v < prev || v > 100) return false;
    prev = v;
  }
  return true;
}

/** The school's standard as stored, with the default wherever a value is missing or makes no sense,
 *  so a bad setting can never stop a teacher marking. */
export function readStandard(raw: unknown): MarkingStandard {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lim = o.limits && typeof o.limits === "object" ? (o.limits as Record<string, unknown>) : {};
  const pts = (key: "slip" | "tajweed"): LevelPoints => {
    const row = o[key] && typeof o[key] === "object" ? (o[key] as Record<string, unknown>) : {};
    const out = {} as LevelPoints;
    for (const l of LEVELS) {
      const v = num(row[l]);
      out[l] = v !== null && v >= 0 && v <= 5 ? v : DEFAULT_STANDARD[key][l];
    }
    return out;
  };
  const limits = {} as Record<MarkingLevel, BandLimits>;
  for (const l of LEVELS) limits[l] = validLimits(lim[l]) ? { ...(lim[l] as BandLimits) } : { ...DEFAULT_STANDARD.limits[l] };
  return { limits, slip: pts("slip"), tajweed: pts("tajweed") };
}

// Where each surah starts in the standard 604-page Madinah mushaf, used only to estimate how many pages
// a portion is (by its share of the surah's ayat), so the allowance grows with the length recited.
const START_PAGE = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418, 428,
  434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560,
  562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598,
  599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604,
];
/** A portion counts as at least half a page, so a few ayat do not get a whole page's allowance. */
export const MIN_PAGES = 0.5;

/** About how many mushaf pages a portion is (surah and ayah range), never less than MIN_PAGES. */
export function portionPages(surah: number, from?: number | null, to?: number | null): number {
  const total = surahAyat(surah);
  if (!total) return MIN_PAGES;
  const start = START_PAGE[surah - 1];
  const end = surah < 114 ? START_PAGE[surah] : 605;
  const span = Math.max(end - start, 0.34);
  const a = Math.max(1, Math.min(from ?? 1, total));
  const b = Math.max(a, Math.min(to ?? total, total));
  const pages = (span * (b - a + 1)) / total;
  return Math.max(MIN_PAGES, Math.round(pages * 100) / 100);
}

export function mistakePoints(mistakes: readonly Mistake[], level: MarkingLevel, standard: MarkingStandard = DEFAULT_STANDARD): number {
  let p = 0;
  for (const m of mistakes) p += m.kind === "prompt" ? 1 : m.kind === "slip" ? standard.slip[level] : standard.tajweed[level];
  return Math.round(p * 100) / 100;
}

export type MarkResult = { score: number; points: number; perPage: number; pages: number; step: keyof BandLimits | "below" };

/**
 * The mark out of 10 for what was heard. Within a result, the higher number when the mistakes sit in its
 * better half: no mistakes at all is 10. Could not recite at all is 0.
 */
export function markFromMistakes(input: { mistakes: readonly Mistake[]; level: MarkingLevel; pages: number; standard?: MarkingStandard; couldNotRecite?: boolean }): MarkResult {
  const standard = input.standard ?? DEFAULT_STANDARD;
  const l = standard.limits[input.level];
  const pages = Number.isFinite(input.pages) && input.pages > MIN_PAGES ? input.pages : MIN_PAGES;
  const points = mistakePoints(input.mistakes, input.level, standard);
  const perPage = Math.round((points / pages) * 100) / 100;
  const r = (score: number, step: MarkResult["step"]): MarkResult => ({ score, points, perPage, pages, step });
  if (input.couldNotRecite) return r(0, "below");
  const better = (lo: number, hi: number) => perPage <= (lo + hi) / 2;
  if (perPage <= l.strong) return r(points === 0 ? 10 : 9, "strong");
  if (perPage <= l.good) return r(better(l.strong, l.good) ? 8 : 7, "good");
  if (perPage <= l.pass) return r(better(l.good, l.pass) ? 6 : 5, "pass");
  if (perPage <= l.weak) return r(better(l.pass, l.weak) ? 4 : 3, "weak");
  return r(perPage <= l.weak * 1.5 ? 2 : 1, "below");
}

const STEP_LOW = [0, 3, 5, 7, 9];
const STEP_HIGH = [2, 4, 6, 8, 10];
const stepOf = (score: number) => (score >= 9 ? 4 : score >= 7 ? 3 : score >= 5 ? 2 : score >= 3 ? 1 : 0);
/** The teacher may move a result one step, with a reason: up lands on the bottom of the step above,
 *  down on the top of the step below. */
export function adjustScore(score: number, delta: -1 | 0 | 1): number {
  if (delta === 0) return score;
  const s = stepOf(score) + delta;
  if (s < 0 || s > 4) return score;
  return delta > 0 ? STEP_LOW[s] : STEP_HIGH[s];
}

/** Mistakes as stored (jsonb), tolerating anything odd. */
export function readMistakes(raw: unknown): Mistake[] {
  if (!Array.isArray(raw)) return [];
  const out: Mistake[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const k = (m as Record<string, unknown>).kind;
    if (k !== "prompt" && k !== "slip" && k !== "tajweed") continue;
    const a = num((m as Record<string, unknown>).ayah);
    out.push({ kind: k, ayah: a !== null && a >= 1 ? Math.floor(a) : null });
  }
  return out;
}

export type FocusEntry = { surah_from: number | null; mistakes?: unknown };
/** What to practise, from the mistakes logged over the pupil's recent recitations: how many of each kind,
 *  and the ayat marked most often (surah and ayah). */
export function practiceFocus(entries: readonly FocusEntry[], limit = 5) {
  const kinds: Record<MistakeKind, number> = { prompt: 0, slip: 0, tajweed: 0 };
  const ayat = new Map<string, { surah: number; ayah: number; marks: number; sessions: number }>();
  let heard = 0;
  for (const e of entries) {
    const ms = readMistakes(e.mistakes);
    if (ms.length === 0) continue;
    heard++;
    const seen = new Set<string>();
    for (const m of ms) {
      kinds[m.kind]++;
      if (m.ayah && e.surah_from) {
        const key = `${e.surah_from}:${m.ayah}`;
        const x = ayat.get(key) || { surah: e.surah_from, ayah: m.ayah, marks: 0, sessions: 0 };
        x.marks++;
        if (!seen.has(key)) {
          x.sessions++;
          seen.add(key);
        }
        ayat.set(key, x);
      }
    }
  }
  const top = [...ayat.values()].sort((a, b) => b.sessions - a.sessions || b.marks - a.marks || a.surah - b.surah || a.ayah - b.ayah).slice(0, limit);
  return { heard, kinds, ayat: top };
}
