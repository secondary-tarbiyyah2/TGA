import { FALLBACK_PERIODS, AUDIENCES, type PeriodKind, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";
import { hhmm } from "./types";

export const SNAP = 5; // minutes
export const MIN_LESSON = 10; // shortest lesson, minutes
export const DEFAULT_LESSON = 45; // length of a lesson added by clicking outside any lesson period

export const toMin = (t: string) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return h * 60 + m;
};
export const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/**
 * Side-by-side lanes for lessons that overlap (e.g. every class's Lesson 1
 * on one day), so no block hides another. Returns each slot's lane and the
 * lane count of its overlapping group.
 */
export function laneLayout(slots: TimetableSlot[]): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...slots].sort((a, b) => toMin(a.start_time) - toMin(b.start_time) || toMin(a.end_time) - toMin(b.end_time));
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) out.set(g.id, { lane: g.lane, lanes: Math.max(1, laneEnds.length) });
    group = [];
    laneEnds = [];
  };
  for (const s of sorted) {
    const st = toMin(s.start_time);
    const en = toMin(s.end_time);
    const fresh = st >= groupEnd;
    if (fresh) flush();
    let lane = laneEnds.findIndex((end) => end <= st);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(en);
    } else laneEnds[lane] = en;
    group.push({ id: s.id, lane });
    groupEnd = fresh ? en : Math.max(groupEnd, en);
  }
  flush();
  return out;
}

export type GridBreak = { weekday: number; start: string; end: string; name: string };

/** Band shading per period kind: break grey, lunch/prayer amber, enrichment green. */
const BAND_CLASS: Record<Exclude<PeriodKind, "lesson">, string> = {
  break: "bg-cream text-ink/70",
  lunch: "bg-amber-100/80 text-amber-900",
  prayer: "bg-amber-100/80 text-amber-900",
  enrichment: "bg-green-100/80 text-green-900",
};

export type Band = { weekday: number | null; weekdays?: number[]; start: number; end: number; label: string; className: string };

/** Shaded bands: the stored non-lesson periods (or the built-in day's), then protected times. */
export function buildBands(periods: TimetablePeriod[] | undefined, breaks: GridBreak[] | undefined): Band[] {
  const bands: Band[] = [];
  const stored = (periods ?? []).filter((p) => p.active);
  const blocks = (stored.length > 0 ? stored : FALLBACK_PERIODS).filter((p) => p.active && p.kind !== "lesson");
  for (const p of blocks) {
    const who = p.applies_to.includes("all") ? "" : ` (${p.applies_to.map((a) => AUDIENCES.find((x) => x.value === a)?.label ?? a).join(", ")})`;
    const kind = p.kind as Exclude<PeriodKind, "lesson">;
    bands.push({ weekday: null, weekdays: p.weekdays, start: toMin(p.start_time), end: toMin(p.end_time), label: `${p.name}${p.kind === "enrichment" && p.activity ? `: ${p.activity}` : ""}${p.kind === "enrichment" && p.supervisor_name ? ` · ${p.supervisor_name}` : ""}${who}`, className: BAND_CLASS[kind] });
  }
  for (const p of breaks ?? []) bands.push({ weekday: p.weekday, start: toMin(p.start), end: toMin(p.end), label: p.name, className: "bg-orange-100/80 text-orange-900/80" });
  return bands;
}

export const bandOnDay = (b: Band, weekday: number) => (b.weekday === null ? !b.weekdays || b.weekdays.includes(weekday) : b.weekday === weekday);

/** Visible time range: the school day (09:00-15:00), widened to fit any stored period or lesson outside it. */
export function timeRange(periods: TimetablePeriod[] | undefined, slots: TimetableSlot[]): { lo: number; hi: number } {
  let lo = 9 * 60;
  let hi = 15 * 60;
  for (const p of (periods ?? []).filter((x) => x.active)) {
    lo = Math.min(lo, Math.floor(toMin(p.start_time) / 60) * 60);
    hi = Math.max(hi, Math.ceil(toMin(p.end_time) / 60) * 60);
  }
  for (const s of slots) {
    lo = Math.min(lo, Math.floor(toMin(s.start_time) / 60) * 60);
    hi = Math.max(hi, Math.ceil(toMin(s.end_time) / 60) * 60);
  }
  return { lo, hi };
}
