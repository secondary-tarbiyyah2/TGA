// The Qur'an class overview and pupil summary (owner, 11 Nov 2026: "revamp the Qur'an system,
// use Ihsan LMS to improve it"). Pure functions over quran_progress rows, so the class table,
// the pupil panel and the family view all count the same way:
//  - a recitation saved across several surahs is stored as one row per surah with the same
//    date, kind and mark: it is counted ONCE in averages ("recitations"), not once per row;
//  - memorised = ayat passed (5 or more) in a memorisation recitation, as mushaf pages out of
//    604 and whole surahs out of 114;
//  - "not heard this week" after 7 days without a recitation.

// Relative imports with extensions so `node --test` can run quranOverview.test.ts directly.
import { pageOf, PAGE_COUNT } from "./mushaf.ts";
import { surahAyat } from "./surahs.ts";

const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
};
const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);
const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type OverviewMark = {
  id: string;
  child_id: string;
  surah_from: number | null;
  ayah_from: number | null;
  ayah_to: number | null;
  score: number | null;
  session_date: string;
  setting?: string | null;
  recitation_kind?: string | null;
  class_id?: string | null;
};

export type RecitationKindName = "memorisation" | "revision" | "reading";
export const KIND_LABEL: Record<RecitationKindName, string> = { memorisation: "Memorisation", revision: "Revision", reading: "Reading" };
/** The kind a row was heard as: the recitation workspace's own kind, else from the older "setting". */
export function kindOf(m: Pick<OverviewMark, "recitation_kind" | "setting">): RecitationKindName {
  if (m.recitation_kind === "memorisation" || m.recitation_kind === "revision" || m.recitation_kind === "reading") return m.recitation_kind;
  return m.setting === "revision" ? "revision" : "memorisation";
}

export const NOT_HEARD_AFTER_DAYS = 7;

export type Recitation = {
  date: string;
  kind: RecitationKindName;
  score: number | null;
  parts: { surah: number; from: number; to: number }[];
  rows: OverviewMark[];
};

/** Rows grouped into recitations, newest first (rows must be one pupil's). */
export function recitationsOf(rows: OverviewMark[]): Recitation[] {
  const sorted = rows.filter((m) => m.surah_from !== null).slice().sort((a, b) => b.session_date.localeCompare(a.session_date));
  const out: Recitation[] = [];
  const index = new Map<string, Recitation>();
  for (const m of sorted) {
    const kind = kindOf(m);
    const key = `${m.session_date}|${kind}|${m.score ?? "x"}|${m.class_id ?? ""}`;
    let r = index.get(key);
    if (!r) {
      r = { date: m.session_date, kind, score: m.score, parts: [], rows: [] };
      index.set(key, r);
      out.push(r);
    }
    const surah = m.surah_from as number;
    r.parts.push({ surah, from: m.ayah_from || 1, to: m.ayah_to || surahAyat(surah) });
    r.rows.push(m);
  }
  for (const r of out) r.parts.sort((a, b) => a.surah - b.surah || a.from - b.from);
  return out;
}

export type Coverage = { pages: number; pagePercent: number; surahs: number[]; partSurahs: number[] };

/** What a pupil has memorised: ayat passed (5+) in memorisation recitations. */
export function memorised(rows: OverviewMark[]): Coverage {
  const ayat = new Map<number, Set<number>>();
  for (const m of rows) {
    if (m.surah_from === null || m.score === null || m.score < 5 || kindOf(m) !== "memorisation") continue;
    const s = m.surah_from;
    const total = surahAyat(s);
    const from = Math.max(1, m.ayah_from || 1);
    const to = Math.min(total, m.ayah_to || total);
    let set = ayat.get(s);
    if (!set) ayat.set(s, (set = new Set()));
    for (let a = from; a <= to; a++) set.add(a);
  }
  const pages = new Set<number>();
  const surahs: number[] = [];
  const partSurahs: number[] = [];
  for (const [s, set] of ayat) {
    for (const a of set) pages.add(pageOf(s, a));
    (set.size >= surahAyat(s) ? surahs : partSurahs).push(s);
  }
  surahs.sort((a, b) => a - b);
  partSurahs.sort((a, b) => a - b);
  return { pages: pages.size, pagePercent: Math.round((pages.size / PAGE_COUNT) * 1000) / 10, surahs, partSurahs };
}

export type PupilOverview = {
  lastHeard: string | null;
  daysSince: number | null;
  notHeardThisWeek: boolean;
  lastMemorisation: Recitation | null;
  lastRevision: Recitation | null;
  /** Average of the last five recitations (each counted once). */
  recentAverage: number | null;
  trend: "up" | "down" | "steady" | null;
  coverage: Coverage;
  count: number;
};

export function pupilOverview(rows: OverviewMark[], today = todayISO()): PupilOverview {
  const recs = recitationsOf(rows);
  const scored = recs.filter((r) => r.score !== null);
  const lastHeard = recs[0]?.date ?? null;
  const daysSince = lastHeard ? daysBetween(lastHeard, today) : null;
  const recent = scored.slice(0, 5).map((r) => r.score as number);
  const before = scored.slice(5, 10).map((r) => r.score as number);
  const a = avg(recent);
  const b = avg(before);
  return {
    lastHeard,
    daysSince,
    notHeardThisWeek: daysSince === null || daysSince >= NOT_HEARD_AFTER_DAYS,
    lastMemorisation: recs.find((r) => r.kind === "memorisation") || null,
    lastRevision: recs.find((r) => r.kind === "revision") || null,
    recentAverage: a,
    trend: a === null || b === null ? null : a - b >= 0.5 ? "up" : b - a >= 0.5 ? "down" : "steady",
    coverage: memorised(rows),
    count: recs.length,
  };
}

/** "Today", "Yesterday", "3 days ago", or the date for anything older than a fortnight. */
export function heardLabel(iso: string | null, today = todayISO()): string {
  if (!iso) return "Not heard yet";
  const d = daysBetween(iso, today);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Average mark per surah over recitations (a multi-surah recitation counts for each surah once). */
export function surahAverages(rows: OverviewMark[]): { surah: number; avg: number; times: number }[] {
  const by = new Map<number, number[]>();
  for (const r of recitationsOf(rows)) {
    if (r.score === null) continue;
    for (const s of new Set(r.parts.map((p) => p.surah))) by.set(s, [...(by.get(s) || []), r.score]);
  }
  return [...by.entries()].map(([surah, xs]) => ({ surah, avg: avg(xs) as number, times: xs.length })).sort((a, b) => a.surah - b.surah);
}
