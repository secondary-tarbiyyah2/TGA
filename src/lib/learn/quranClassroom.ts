// Qur'an classroom maths (supabase/migrations/0103_quran_classroom.sql).
// Everything pupils and teachers see is COMPUTED here from the marks, so it can't drift from the data:
//  - covered  = a surah assessed at least once
//  - secure   = a covered surah whose average mark is 8 or more
//  - revision = a covered surah comes due again 3 days after a fail, 7 after a developing mark, 14 after a good one, 30 after an excellent one

import { JUZ_AMMA_FIRST, surahAyat } from "@/lib/learn/surahs";

export type QuranMark = {
  id: string;
  child_id: string;
  surah_from: number | null;
  ayah_from: number | null;
  ayah_to: number | null;
  score: number | null;
  session_date: string;
  setting: "homework" | "one_to_one" | "class" | "revision";
  focus: string[] | null;
  homework_id: string | null;
};

export const MARK_COLUMNS = "id, child_id, surah_from, ayah_from, ayah_to, score, session_date, setting, focus, homework_id";

export type Level = { id: string; track: "qaidah" | "quran"; name: string; sort: number; meets: string | null };
export type Homework = { id: string; level_id: string; kind: "recitation" | "memorisation" | "revision" | "tajweed"; surah: number | null; ayah_from: number | null; ayah_to: number | null; note: string | null; due_date: string };
export type Session = { id: string; child_id: string; teacher_name: string | null; session_date: string; session_time: string; done: boolean };

export const HW_KINDS: Record<Homework["kind"], string> = { recitation: "Recitation", memorisation: "Memorisation", revision: "Revision", tajweed: "Tajweed rule" };
export const SETTING_LABEL: Record<QuranMark["setting"], string> = { homework: "Homework", one_to_one: "One to one", class: "In class", revision: "Revision" };

export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
};
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);
export const addDaysISO = (iso: string, n: number) => {
  const d = new Date(dayNum(iso) * 86_400_000 + n * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export type SurahStat = { surah: number; avg: number; times: number; last: string };
export type RevisionRow = SurahStat & { interval: number; gap: number; overdue: number; next: string; status: "due" | "soon" | "ok" };

export const revisionInterval = (a: number) => (a >= 9 ? 30 : a >= 7 ? 14 : a >= 5 ? 7 : 3);

/**
 * What each mark out of 10 means, so every teacher marks the same way.
 * Fail is 0 to 4, pass is 5 or more, secure is 8 or more.
 */
export type MarkBand = { min: number; max: number; label: string; result: "Fail" | "Pass" | "Secure"; tone: "bad" | "warn" | "info" | "good"; means: string; next: string };
export const MARK_BANDS: MarkBand[] = [
  { min: 0, max: 0, label: "Not heard", result: "Fail", tone: "bad", means: "Absent, or no recitation was attempted.", next: "Set it again; speak to the pupil or parent if it keeps happening." },
  { min: 1, max: 2, label: "Very weak", result: "Fail", tone: "bad", means: "Cannot recite without constant prompting, or most words are wrong.", next: "Reteach from the start with the teacher; revise again in 3 days." },
  { min: 3, max: 4, label: "Weak", result: "Fail", tone: "bad", means: "Many errors in letters, makharij or tajweed, or long hesitations. Below the expected standard.", next: "Reteach the weak parts; revise again in 3 days." },
  { min: 5, max: 6, label: "Developing", result: "Pass", tone: "warn", means: "Meets the basics with several errors. Needs support to be secure.", next: "Repeat with a focus area; revise again in 7 days." },
  { min: 7, max: 7, label: "Good", result: "Pass", tone: "info", means: "Mostly accurate with a few errors. Ready to move on with a focus area.", next: "Move on; revise again in 14 days." },
  { min: 8, max: 9, label: "Very good", result: "Secure", tone: "good", means: "Accurate and fluent with only slips. Secure.", next: "Move on; revise again in 14 to 30 days." },
  { min: 10, max: 10, label: "Excellent", result: "Secure", tone: "good", means: "Flawless, fluent, and the tajweed rules applied throughout.", next: "Move on; revise again in 30 days." },
];
export const bandFor = (score: number | null | undefined): MarkBand | null => (score === null || score === undefined ? null : MARK_BANDS.find((b) => score >= b.min && score <= b.max) || null);

export type PupilStats = {
  marks: QuranMark[];
  overall: number | null;
  count: number;
  surahs: SurahStat[];
  covered: number;
  secure: number;
  juzAmma: number;
  focus: [string, number][];
  trend: "improving" | "steady" | "needs a push" | null;
};

export function pupilStats(all: QuranMark[]): PupilStats {
  const marks = all.filter((m) => m.score !== null && m.surah_from !== null).slice().sort((a, b) => a.session_date.localeCompare(b.session_date));
  const by = new Map<number, QuranMark[]>();
  for (const m of marks) by.set(m.surah_from as number, [...(by.get(m.surah_from as number) || []), m]);
  const surahs: SurahStat[] = [...by.entries()]
    .map(([surah, l]) => ({ surah, avg: avg(l.map((x) => Number(x.score))) as number, times: l.length, last: l[l.length - 1].session_date }))
    .sort((a, b) => a.surah - b.surah);
  const focus = new Map<string, number>();
  for (const m of marks.slice(-12)) for (const f of m.focus || []) focus.set(f, (focus.get(f) || 0) + 1);
  const sc = marks.map((m) => Number(m.score));
  const half = Math.floor(sc.length / 2);
  const delta = sc.length >= 4 ? (avg(sc.slice(-half)) as number) - (avg(sc.slice(0, half)) as number) : null;
  return {
    marks,
    overall: avg(sc),
    count: marks.length,
    surahs,
    covered: surahs.length,
    secure: surahs.filter((s) => s.avg >= 8).length,
    juzAmma: surahs.filter((s) => s.surah >= JUZ_AMMA_FIRST).length,
    focus: [...focus.entries()].sort((a, b) => b[1] - a[1]),
    trend: delta === null ? null : delta >= 0.5 ? "improving" : delta <= -0.5 ? "needs a push" : "steady",
  };
}

export function revisionRows(stats: PupilStats, today = todayISO()): RevisionRow[] {
  return stats.surahs
    .map((s) => {
      const interval = revisionInterval(s.avg);
      const gap = daysBetween(s.last, today);
      const overdue = gap - interval;
      return { ...s, interval, gap, overdue, next: addDaysISO(s.last, interval), status: (overdue >= 0 ? "due" : overdue >= -3 ? "soon" : "ok") as RevisionRow["status"] };
    })
    .sort((a, b) => b.overdue - a.overdue);
}

export const nextSession = (sessions: Session[], today = todayISO()) =>
  sessions.filter((s) => !s.done && s.session_date >= today).sort((a, b) => (a.session_date + a.session_time).localeCompare(b.session_date + b.session_time))[0] || null;

export const hhmm = (t: string) => t.slice(0, 5);
export const ayatLabel = (s: number | null, a: number | null, b: number | null) => (s === null ? "" : a && b ? `${a}-${b}` : `1-${surahAyat(s)}`);
export const shortLevel = (name: string) => name.split(":")[0];
