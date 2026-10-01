// Qur'an & Hifz progress helpers (supabase/migrations/0072_progress_tracking.sql).
//
// Teachers rate every session as a whole number out of 10 (recitation,
// tajweed and memorisation quality combined). On top of those entries sit
// targets ("N pages / juz / surahs by a date") and milestones. Progress and
// milestones are always COMPUTED from the recorded entries, never stored, so
// they can't drift from the data.

export type QuranStandard = "introduced" | "consolidating" | "secure" | "fluent";

export type QuranEntry = {
  id: string;
  milestone_type: "quran_memorisation" | "islamic_studies";
  surah_from: number | null;
  surah_to: number | null;
  juz: number | null;
  topic: string | null;
  standard: QuranStandard | null;
  note: string | null;
  recorded_at: string;
  score: number | null;
  pages: number | null;
  session_date: string;
};

export const QURAN_ENTRY_COLUMNS = "id, milestone_type, surah_from, surah_to, juz, topic, standard, note, recorded_at, score, pages, session_date";

export type TargetKind = "pages" | "juz" | "surah";

export type QuranTarget = {
  id: string;
  child_id: string;
  class_id: string | null;
  title: string;
  target_kind: TargetKind;
  target_amount: number;
  start_date: string;
  due_date: string;
  note: string | null;
};

export const QURAN_TARGET_COLUMNS = "id, child_id, class_id, title, target_kind, target_amount, start_date, due_date, note";

export const TARGET_KIND_LABEL: Record<TargetKind, { singular: string; plural: string; max: number }> = {
  pages: { singular: "page", plural: "pages", max: 604 },
  juz: { singular: "juz", plural: "juz", max: 30 },
  surah: { singular: "surah", plural: "surahs", max: 114 },
};

const SECURE: ReadonlySet<string> = new Set(["secure", "fluent"]);

export function localDateISO(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── scores ─────────────────────────────────────────────────────────────

/** Scores (0-10) oldest first. */
export function chronologicalScores(entries: QuranEntry[]): number[] {
  return entries
    .filter((e) => e.score !== null && e.score !== undefined)
    .slice()
    .sort((a, b) => (a.session_date === b.session_date ? a.recorded_at.localeCompare(b.recorded_at) : a.session_date.localeCompare(b.session_date)))
    .map((e) => Number(e.score));
}

export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

export type ScoreTrend = "improving" | "steady" | "declining";

/**
 * Trend over chronological scores: the average of the later half against the
 * earlier half (a middle session is ignored when the count is odd). A change
 * of half a mark or more counts as improving/declining. Needs two sessions.
 */
export function scoreTrend(scores: number[]): ScoreTrend | null {
  if (scores.length < 2) return null;
  const half = Math.floor(scores.length / 2);
  const early = averageScore(scores.slice(0, half));
  const late = averageScore(scores.slice(scores.length - half));
  if (early === null || late === null) return null;
  const delta = late - early;
  if (delta >= 0.5) return "improving";
  if (delta <= -0.5) return "declining";
  return "steady";
}

export const TREND_LABEL: Record<ScoreTrend, string> = {
  improving: "Improving",
  steady: "Steady",
  declining: "Declining",
};

export type ScoreSummary = { sessions: number; average: number | null; latest: number | null; trend: ScoreTrend | null };

export function summariseScores(entries: QuranEntry[]): ScoreSummary {
  const scores = chronologicalScores(entries);
  return {
    sessions: scores.length,
    average: averageScore(scores),
    latest: scores.length > 0 ? scores[scores.length - 1] : null,
    trend: scoreTrend(scores),
  };
}

// ── targets ────────────────────────────────────────────────────────────

function surahsIn(e: QuranEntry): number[] {
  if (e.surah_from === null || e.surah_from === undefined) return [];
  const to = e.surah_to ?? e.surah_from;
  const lo = Math.max(1, Math.min(e.surah_from, to));
  const hi = Math.min(114, Math.max(e.surah_from, to));
  const out: number[] = [];
  for (let s = lo; s <= hi; s++) out.push(s);
  return out;
}

export type TargetStatus = "achieved" | "on_track" | "behind" | "overdue";

export type TargetProgress = { done: number; total: number; pct: number; status: TargetStatus; daysLeft: number };

export const TARGET_STATUS_META: Record<TargetStatus, { label: string; className: string; bar: string }> = {
  achieved: { label: "Achieved", className: "bg-green-100 text-green-700", bar: "bg-green-600" },
  on_track: { label: "On track", className: "bg-teal-100 text-teal-800", bar: "bg-teal-700" },
  behind: { label: "Behind", className: "bg-amber-100 text-amber-800", bar: "bg-gold-500" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700", bar: "bg-red-600" },
};

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

/**
 * Progress against one target using the Qur'an memorisation entries recorded
 * from the target's start date onwards:
 *   pages  sum of the pages recorded
 *   juz    distinct juz recorded as secure or fluent
 *   surah  distinct surahs covered by entries recorded as secure or fluent
 * "Behind" means the share done is more than 15 points under the share of
 * the time that has passed.
 */
export function targetProgress(target: QuranTarget, entries: QuranEntry[], today: string = localDateISO()): TargetProgress {
  const relevant = entries.filter((e) => e.milestone_type === "quran_memorisation" && e.session_date >= target.start_date);
  let done = 0;
  if (target.target_kind === "pages") {
    done = relevant.reduce((sum, e) => sum + (e.pages ?? 0), 0);
  } else if (target.target_kind === "juz") {
    done = new Set(relevant.filter((e) => e.juz !== null && e.standard !== null && SECURE.has(e.standard)).map((e) => e.juz)).size;
  } else {
    const set = new Set<number>();
    for (const e of relevant) {
      if (e.standard !== null && SECURE.has(e.standard)) for (const s of surahsIn(e)) set.add(s);
    }
    done = set.size;
  }
  const total = target.target_amount;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const daysLeft = dayNumber(target.due_date) - dayNumber(today);
  let status: TargetStatus;
  if (done >= total) status = "achieved";
  else if (daysLeft < 0) status = "overdue";
  else {
    const span = Math.max(1, dayNumber(target.due_date) - dayNumber(target.start_date));
    const elapsed = Math.min(1, Math.max(0, (dayNumber(today) - dayNumber(target.start_date)) / span));
    status = pct / 100 >= elapsed - 0.15 ? "on_track" : "behind";
  }
  return { done, total, pct, status, daysLeft };
}

// ── milestones ─────────────────────────────────────────────────────────

export type Milestone = { id: string; label: string; achieved: boolean };

const PAGE_STEPS = [10, 25, 50, 100, 200];
const JUZ_STEPS = [1, 5, 10, 15, 30];

/** Automatic milestones from the entries, plus every target that has been met. */
export function computeMilestones(entries: QuranEntry[], targets: QuranTarget[]): Milestone[] {
  const memorisation = entries.filter((e) => e.milestone_type === "quran_memorisation");
  const totalPages = memorisation.reduce((sum, e) => sum + (e.pages ?? 0), 0);
  const secureJuz = new Set(memorisation.filter((e) => e.juz !== null && e.standard !== null && SECURE.has(e.standard)).map((e) => e.juz)).size;
  const scores = chronologicalScores(entries);
  const out: Milestone[] = [];
  for (const n of PAGE_STEPS) out.push({ id: `pages-${n}`, label: `${n} pages memorised`, achieved: totalPages >= n });
  for (const n of JUZ_STEPS) out.push({ id: `juz-${n}`, label: n === 1 ? "First juz secure" : `${n} juz secure`, achieved: secureJuz >= n });
  out.push({ id: "score-10", label: "A perfect 10/10 session", achieved: scores.some((s) => s >= 10) });
  out.push({ id: "score-8x5", label: "Five sessions scoring 8 or more", achieved: scores.filter((s) => s >= 8).length >= 5 });
  for (const t of targets) {
    out.push({ id: `target-${t.id}`, label: `Target met: ${t.title}`, achieved: targetProgress(t, entries).status === "achieved" });
  }
  return out;
}
