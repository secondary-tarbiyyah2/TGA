import type { getSupabaseClient } from "@/lib/supabase/client";
import { averageScore, scoreTrend, type ScoreTrend } from "@/lib/learn/quran";

export type Sb = NonNullable<ReturnType<typeof getSupabaseClient>>;

/** `absent` is unauthorised, `excused` authorised; `technical` (counted on its own) is missing from reports saved before Nov 2026. */
export type AttendanceSummary = { attended: number; absent: number; excused: number; technical?: number; total: number; rate: number | null };
export type HomeworkSummary = { done: number; total: number; rate: number | null };
export type AssessmentItem = { title: string; percent: number | null; grade: string | null };
export type AssessmentSummary = { count: number; average_percent: number | null; items: AssessmentItem[] };
export type QuranSummary = {
  entries: number;
  latest: string | null;
  /** Mean of the teacher's 0-10 session scores in the period (optional so older snapshots still render). */
  average_score?: number | null;
  scored_sessions?: number;
  /** Later half of the period against the earlier half. */
  trend?: ScoreTrend | null;
};
/** Merits and demerits only: incident notes are never part of a report. */
export type BehaviourSummary = { merits: number; demerits: number; net_points: number };
export type ClassSummary = {
  class_id: string;
  class_name: string;
  attendance: AttendanceSummary;
  homework: HomeworkSummary;
  assessments: AssessmentSummary;
  quran: QuranSummary;
  /** Optional so snapshots stored before the behaviour module still render. */
  behaviour?: BehaviourSummary;
};
/** A teacher's judgement for one class (subject) on a pupil's report. */
export type SubjectRating = {
  effort?: string | null;
  attainment?: string | null;
  comment?: string | null;
  /** Name of the teacher who wrote it, for the report. */
  by?: string | null;
  updated_at?: string;
};
/** Snapshot stored in term_reports.narrative. Safeguarding data is never part of it. */
export type ReportNarrative = {
  version: 1;
  generated_at: string;
  term_label: string;
  classes: Record<string, ClassSummary>;
  /** Effort / attainment / subject comment per class id (optional: older snapshots have none). */
  ratings?: Record<string, SubjectRating>;
};

export const EFFORT_OPTIONS = ["Excellent", "Good", "Satisfactory", "Needs to improve"] as const;
export const ATTAINMENT_OPTIONS = ["Above expected", "At expected", "Working towards expected", "Below expected"] as const;
export type TermOption = { id: string; name: string; starts_on: string; ends_on: string };
export type DateRange = { start: string | null; end: string | null };

export function termRange(t: TermOption | null): DateRange {
  return t ? { start: t.starts_on, end: t.ends_on } : { start: null, end: null };
}

const PAGE = 1000;

export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    const rows = (res.data as T[] | null) || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

function emptySummary(cls: { id: string; name: string }): ClassSummary {
  return {
    class_id: cls.id,
    class_name: cls.name,
    attendance: { attended: 0, absent: 0, excused: 0, technical: 0, total: 0, rate: null },
    homework: { done: 0, total: 0, rate: null },
    assessments: { count: 0, average_percent: null, items: [] },
    quran: { entries: 0, latest: null, average_score: null, scored_sessions: 0, trend: null },
    behaviour: { merits: 0, demerits: 0, net_points: 0 },
  };
}

type AttRow = { child_id: string; status: string };
type HwRow = { id: string };
type SubRow = { child_id: string; submitted_at: string | null };
type AssRow = { child_id: string; title: string; percent: number | string | null; grade_label: string | null };
type QRow = {
  child_id: string;
  milestone_type: string;
  surah_from: number | null;
  surah_to: number | null;
  topic: string | null;
  standard: string | null;
  score: number | null;
};

type BhRow = { child_id: string; kind: string; points: number };

function quranLabel(r: QRow): string {
  const what =
    r.milestone_type === "quran_memorisation"
      ? `Surah ${r.surah_from ?? "?"}${r.surah_to && r.surah_to !== r.surah_from ? `–${r.surah_to}` : ""}`
      : r.topic || "Islamic Studies";
  return r.standard ? `${what} (${r.standard})` : what;
}

/**
 * Builds the auto-summary for every child of one class from data already
 * recorded (RLS-scoped to the caller). Only attendance, homework,
 * assessments, Qur'an progress and behaviour merits/demerits are read:
 * safeguarding tables and behaviour incident rows are never queried.
 */
export async function buildClassSummaries(
  supabase: Sb,
  cls: { id: string; name: string },
  childIds: string[],
  range: DateRange
): Promise<Record<string, ClassSummary>> {
  const result: Record<string, ClassSummary> = {};
  for (const id of childIds) result[id] = emptySummary(cls);
  if (childIds.length === 0) return result;

  const endTs = range.end ? `${range.end}T23:59:59` : null;

  const [att, hw, subs, ass, qp, bh] = await Promise.all([
    fetchAll<AttRow>((f, t) => {
      let q = supabase
        .from("attendance_records")
        .select("child_id, status, lesson_instances!inner(date, timetable_slots!inner(class_id))")
        .eq("lesson_instances.timetable_slots.class_id", cls.id)
        .in("child_id", childIds);
      if (range.start) q = q.gte("lesson_instances.date", range.start);
      if (range.end) q = q.lte("lesson_instances.date", range.end);
      return q.range(f, t);
    }),
    fetchAll<HwRow>((f, t) => {
      let q = supabase.from("homework").select("id").eq("class_id", cls.id);
      if (range.start) q = q.gte("due_at", range.start);
      if (endTs) q = q.lte("due_at", endTs);
      return q.range(f, t);
    }),
    fetchAll<SubRow>((f, t) => {
      let q = supabase
        .from("homework_submissions")
        .select("child_id, submitted_at, homework!inner(class_id, due_at)")
        .eq("homework.class_id", cls.id)
        .in("child_id", childIds);
      if (range.start) q = q.gte("homework.due_at", range.start);
      if (endTs) q = q.lte("homework.due_at", endTs);
      return q.range(f, t);
    }),
    fetchAll<AssRow>((f, t) => {
      let q = supabase.from("assessments").select("child_id, title, percent, grade_label").eq("class_id", cls.id).in("child_id", childIds);
      if (range.start) q = q.gte("date", range.start);
      if (range.end) q = q.lte("date", range.end);
      return q.order("date", { ascending: false }).range(f, t);
    }),
    fetchAll<QRow>((f, t) => {
      let q = supabase
        .from("quran_progress")
        .select("child_id, milestone_type, surah_from, surah_to, topic, standard, score")
        .eq("class_id", cls.id)
        .in("child_id", childIds);
      // session_date (0072) is the day the session happened; backfilled from recorded_at for older rows.
      if (range.start) q = q.gte("session_date", range.start);
      if (range.end) q = q.lte("session_date", range.end);
      return q.order("session_date", { ascending: false }).order("recorded_at", { ascending: false }).range(f, t);
    }),
    fetchAll<BhRow>((f, t) => {
      let q = supabase
        .from("behaviour_records")
        .select("child_id, kind, points")
        .eq("class_id", cls.id)
        .in("child_id", childIds)
        .in("kind", ["merit", "demerit"])
        .is("voided_at", null);
      if (range.start) q = q.gte("occurred_on", range.start);
      if (range.end) q = q.lte("occurred_on", range.end);
      return q.range(f, t);
    }),
  ]);

  for (const r of att) {
    const s = result[r.child_id];
    if (!s) continue;
    // The school's codes (attendanceCodes.ts): present and late (and the older "not engaged") attend;
    // a technical absence is counted on its own and, like an authorised absence, not held against the rate.
    if (r.status === "present" || r.status === "late" || r.status === "not_engaged") s.attendance.attended += 1;
    else if (r.status === "absent") s.attendance.absent += 1;
    else if (r.status === "excused") s.attendance.excused += 1;
    else if (r.status === "technical") s.attendance.technical = (s.attendance.technical || 0) + 1;
  }
  for (const id of childIds) {
    const a = result[id].attendance;
    a.total = a.attended + a.absent + a.excused + (a.technical || 0);
    // Authorised (excused) absences don't count against the rate.
    a.rate = pct(a.attended, a.attended + a.absent);
    result[id].homework.total = hw.length;
  }
  for (const r of subs) {
    const s = result[r.child_id];
    if (s && r.submitted_at) s.homework.done += 1;
  }
  for (const id of childIds) {
    const h = result[id].homework;
    h.rate = pct(h.done, h.total);
  }
  for (const r of ass) {
    const s = result[r.child_id];
    if (!s) continue;
    const p = r.percent === null || r.percent === undefined ? null : Number(r.percent);
    s.assessments.count += 1;
    if (s.assessments.items.length < 6) s.assessments.items.push({ title: r.title, percent: p, grade: r.grade_label });
  }
  const sums: Record<string, { sum: number; n: number }> = {};
  for (const r of ass) {
    if (r.percent === null || r.percent === undefined) continue;
    const e = (sums[r.child_id] ||= { sum: 0, n: 0 });
    e.sum += Number(r.percent);
    e.n += 1;
  }
  for (const id of Object.keys(sums)) {
    if (result[id] && sums[id].n > 0) result[id].assessments.average_percent = Math.round((sums[id].sum / sums[id].n) * 10) / 10;
  }
  // Rows arrive newest first; collect each child's scores oldest first for the trend.
  const scoresByChild: Record<string, number[]> = {};
  for (const r of qp) {
    const s = result[r.child_id];
    if (!s) continue;
    s.quran.entries += 1;
    if (!s.quran.latest) s.quran.latest = quranLabel(r);
    if (r.score !== null && r.score !== undefined) (scoresByChild[r.child_id] ||= []).unshift(Number(r.score));
  }
  for (const id of Object.keys(scoresByChild)) {
    const scores = scoresByChild[id];
    const q = result[id]?.quran;
    if (!q) continue;
    q.scored_sessions = scores.length;
    q.average_score = averageScore(scores);
    q.trend = scoreTrend(scores);
  }
  for (const r of bh) {
    const b = result[r.child_id]?.behaviour;
    if (!b) continue;
    if (r.kind === "merit") b.merits += 1;
    else if (r.kind === "demerit") b.demerits += 1;
    b.net_points += r.points;
  }
  return result;
}

/** Stored classes (other classes' snapshots) plus this class's fresh summary. */
export function mergeNarrative(existing: ReportNarrative | null, summary: ClassSummary, termLabel: string): ReportNarrative {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    term_label: termLabel,
    classes: { ...(existing?.classes || {}), [summary.class_id]: summary },
    ...(existing?.ratings ? { ratings: existing.ratings } : {}),
  };
}

/** The narrative with one class's rating replaced (or removed when empty). */
export function withRating(n: ReportNarrative, classId: string, rating: SubjectRating | null): ReportNarrative {
  const ratings = { ...(n.ratings || {}) };
  const empty = !rating || (!rating.effort && !rating.attainment && !(rating.comment || "").trim());
  if (empty) delete ratings[classId];
  else ratings[classId] = { ...rating, comment: (rating.comment || "").trim() || null, updated_at: new Date().toISOString() };
  return { ...n, ratings };
}

export function asNarrative(v: unknown): ReportNarrative | null {
  if (!v || typeof v !== "object") return null;
  const n = v as Partial<ReportNarrative>;
  if (!n.classes || typeof n.classes !== "object") return null;
  return n as ReportNarrative;
}
