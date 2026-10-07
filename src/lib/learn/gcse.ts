// GCSE (Years 10-11) predicted vs actual grades on the 9-1 scale
// (supabase/migrations/0072_progress_tracking.sql, table gcse_grades).
// The on-track/behind indicator is computed here from the three numbers.

export type GcseRow = {
  id: string;
  child_id: string;
  subject_id: string;
  class_id: string | null;
  target_grade: number | null;
  predicted_grade: number | null;
  actual_grade: number | null;
  actual_assessment_id: string | null;
  comment: string | null;
  updated_at: string;
};

export const GCSE_COLUMNS = "id, child_id, subject_id, class_id, target_grade, predicted_grade, actual_grade, actual_assessment_id, comment, updated_at";

export const GCSE_GRADES = [9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export type GcseStatus = "ahead" | "on_track" | "behind" | "no_data";

export const GCSE_STATUS_META: Record<GcseStatus, { label: string; className: string }> = {
  ahead: { label: "Ahead", className: "bg-green-100 text-green-700" },
  on_track: { label: "On track", className: "bg-teal-100 text-teal-800" },
  behind: { label: "Behind", className: "bg-amber-100 text-amber-800" },
  no_data: { label: "Awaiting actual grade", className: "bg-cream text-ink/60" },
};

/**
 * Actual against the predicted grade (the target grade is used when no
 * prediction has been entered). At or above = on track, below = behind;
 * `gap` is actual minus benchmark. Without both numbers there is nothing to
 * compare yet.
 */
export function gcseStatus(row: Pick<GcseRow, "target_grade" | "predicted_grade" | "actual_grade">): {
  status: GcseStatus;
  gap: number | null;
  benchmark: number | null;
} {
  const benchmark = row.predicted_grade ?? row.target_grade;
  if (benchmark === null || benchmark === undefined || row.actual_grade === null || row.actual_grade === undefined) {
    return { status: "no_data", gap: null, benchmark: benchmark ?? null };
  }
  const gap = row.actual_grade - benchmark;
  return { status: gap > 0 ? "ahead" : gap === 0 ? "on_track" : "behind", gap, benchmark };
}

/** GCSE years are Year 10 and Year 11 (matched on the class's year group name). */
export function isGcseYear(yearGroup: string | null | undefined): boolean {
  return !!yearGroup && /\byear\s*(10|11)\b/i.test(yearGroup);
}

/** Reads a 1-9 grade out of an assessment grade label such as "7", "Grade 6" or "5+". Letter grades give null. */
export function gradeFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.match(/\b([1-9])\b/);
  return m ? Number(m[1]) : null;
}

// ── history (0089 gcse_grade_history) ──────────────────────────────────────

export type GcseHistoryRow = {
  id: string;
  grade_id: string | null;
  child_id: string;
  subject_id: string;
  class_id: string | null;
  kind: "snapshot" | "mock";
  label: string | null;
  target_grade: number | null;
  predicted_grade: number | null;
  actual_grade: number | null;
  mark: number | null;
  out_of: number | null;
  recorded_at: string;
};

export const GCSE_HISTORY_COLUMNS = "id, grade_id, child_id, subject_id, class_id, kind, label, target_grade, predicted_grade, actual_grade, mark, out_of, recorded_at";

/** A single point on a pupil's grade trend line: the grade we know about at a moment in time. */
export type TrendPoint = { at: string; grade: number; kind: "snapshot" | "mock"; label: string | null };

/** The sequence of actual grades (snapshots and mocks) for one pupil+subject, oldest first. Unchanged repeats are dropped. */
export function actualTrend(history: Pick<GcseHistoryRow, "recorded_at" | "actual_grade" | "kind" | "label">[]): TrendPoint[] {
  const out: TrendPoint[] = [];
  const sorted = history.slice().sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  for (const h of sorted) {
    if (h.actual_grade === null) continue;
    const prev = out[out.length - 1];
    if (prev && prev.grade === h.actual_grade && h.kind === "snapshot") continue;
    out.push({ at: h.recorded_at, grade: h.actual_grade, kind: h.kind, label: h.label });
  }
  return out;
}

export type TrendDirection = "up" | "down" | "flat" | "none";

/** Direction of the last two points on the trend (needs at least two). */
export function trendDirection(points: TrendPoint[]): TrendDirection {
  if (points.length < 2) return "none";
  const d = points[points.length - 1].grade - points[points.length - 2].grade;
  return d > 0 ? "up" : d < 0 ? "down" : "flat";
}

export const TREND_META: Record<TrendDirection, { symbol: string; label: string; className: string }> = {
  up: { symbol: "▲", label: "Improving", className: "text-green-700" },
  down: { symbol: "▼", label: "Slipping", className: "text-red-700" },
  flat: { symbol: "●", label: "Steady", className: "text-ink/50" },
  none: { symbol: "–", label: "No trend yet", className: "text-ink/40" },
};

// ── grade chips and attention ──────────────────────────────────────────────

/** Tailwind classes for a 1-9 grade chip, darker for higher grades. */
export function gradeChipClass(grade: number | null | undefined): string {
  if (grade === null || grade === undefined) return "bg-cream text-ink/40";
  if (grade >= 7) return "bg-green-100 text-green-800";
  if (grade >= 4) return "bg-teal-50 text-teal-800";
  return "bg-amber-100 text-amber-900";
}

/** Row background hint for the status. */
export const GCSE_ROW_TINT: Record<GcseStatus, string> = {
  ahead: "bg-green-50/50",
  on_track: "",
  behind: "bg-amber-50/70",
  no_data: "",
};

export type AttentionReason = "behind" | "behind_by_two" | "prediction_below_target" | "slipping" | "no_prediction";

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  behind: "Below prediction",
  behind_by_two: "Two or more grades below prediction",
  prediction_below_target: "Predicted below target",
  slipping: "Latest grade dropped",
  no_prediction: "No predicted grade set",
};

/** Why a pupil+subject needs a teacher's attention (empty = fine). */
export function attentionReasons(
  row: Pick<GcseRow, "target_grade" | "predicted_grade" | "actual_grade">,
  trend: TrendPoint[] = []
): AttentionReason[] {
  const out: AttentionReason[] = [];
  const { status, gap } = gcseStatus(row);
  if (status === "behind") out.push(gap !== null && gap <= -2 ? "behind_by_two" : "behind");
  if (row.target_grade !== null && row.predicted_grade !== null && row.predicted_grade < row.target_grade) out.push("prediction_below_target");
  if (trendDirection(trend) === "down" && status !== "behind") out.push("slipping");
  if (row.predicted_grade === null && row.target_grade !== null) out.push("no_prediction");
  return out;
}

/** Sort weight: bigger = more urgent. */
export function attentionScore(reasons: AttentionReason[], gap: number | null): number {
  return reasons.length * 10 + (gap !== null && gap < 0 ? Math.abs(gap) * 5 : 0);
}

// ── plain-English explanation for pupils and parents ───────────────────────

export type GapExplanation = { headline: string; detail: string; nextSteps: string[] };

/** Explains where a pupil stands in one subject, and what usually helps. */
export function explainGap(row: Pick<GcseRow, "target_grade" | "predicted_grade" | "actual_grade">, trend: TrendPoint[] = []): GapExplanation {
  const { status, gap, benchmark } = gcseStatus(row);
  const dir = trendDirection(trend);
  if (status === "no_data") {
    return {
      headline: "Waiting for a current grade",
      detail:
        benchmark !== null
          ? `The goal for now is grade ${benchmark}. There is no current grade yet, so we cannot say whether this is on track.`
          : "Targets and predictions have not been set for this subject yet.",
      nextSteps: ["Your teacher will add a grade after the next assessment or mock exam.", "Ask your teacher what the target grade is and what it will take to reach it."],
    };
  }
  const base = row.predicted_grade !== null ? "predicted grade" : "target grade";
  if (status === "behind" && gap !== null) {
    const n = Math.abs(gap);
    return {
      headline: `${n} ${n === 1 ? "grade" : "grades"} below ${base}`,
      detail: `The current grade is ${row.actual_grade}, and the ${base} is ${benchmark}. That is a gap of ${n}. A gap is a signal about where to put effort, not a final result: grades move a lot between now and the exam.`,
      nextSteps: [
        "Ask the teacher which two or three topics lost the most marks, and rework those first.",
        "Redo past exam questions on those topics under timed conditions and mark them against the mark scheme.",
        "Agree a short weekly routine (for example three 30-minute sessions) and review it in two to three weeks.",
        ...(dir === "down" ? ["The last result dropped, so talk to the teacher soon rather than waiting for the next report."] : []),
      ],
    };
  }
  if (status === "ahead" && gap !== null) {
    return {
      headline: `${gap} ${gap === 1 ? "grade" : "grades"} above ${base}`,
      detail: `The current grade is ${row.actual_grade} against a ${base} of ${benchmark}. That is a strong position: keep the habits that got here.`,
      nextSteps: ["Ask the teacher whether the target can be raised.", "Stretch with harder past-paper questions so the grade holds up under exam pressure."],
    };
  }
  return {
    headline: "On track",
    detail: `The current grade (${row.actual_grade}) matches the ${base} (${benchmark}).${dir === "up" ? " The trend is upwards." : dir === "down" ? " The last result dipped, so keep an eye on it." : ""}`,
    nextSteps: ["Keep up regular practice and revision.", "Look at mock exam feedback to find the next easiest grade-boundary gains."],
  };
}

// ── mock exam grade boundaries (indicative) ─────────────────────────────────

/** Minimum percentage of the paper needed for each grade. */
export type Boundaries = Record<number, number>;

/**
 * Indicative only: real boundaries are set by the exam board for each paper
 * and series. These defaults suit a school mock and can be edited per paper.
 */
export const DEFAULT_BOUNDARIES: Boundaries = { 9: 85, 8: 76, 7: 67, 6: 58, 5: 49, 4: 40, 3: 30, 2: 20, 1: 10 };

export function gradeFromPercent(pct: number, boundaries: Boundaries = DEFAULT_BOUNDARIES): number | null {
  if (!Number.isFinite(pct)) return null;
  for (const g of GCSE_GRADES) if (pct >= boundaries[g]) return g;
  return null;
}

/** Marks still needed for the next grade up, or null at the top. */
export function marksToNextGrade(mark: number, outOf: number, boundaries: Boundaries = DEFAULT_BOUNDARIES): { grade: number; marks: number } | null {
  if (!(outOf > 0)) return null;
  const pct = (mark / outOf) * 100;
  const current = gradeFromPercent(pct, boundaries) ?? 0;
  if (current >= 9) return null;
  const next = current + 1;
  const need = Math.ceil((boundaries[next] / 100) * outOf - 1e-9) - mark;
  return { grade: next, marks: Math.max(0, Math.round(need * 10) / 10) };
}

/** True when each higher grade needs a higher percentage than the one below, all within 0-100. */
export function boundariesValid(b: Boundaries): boolean {
  let prev = -1;
  for (let g = 1; g <= 9; g++) {
    const v = b[g];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100 || v <= prev) return false;
    prev = v;
  }
  return true;
}

// ── bulk entry (paste) and CSV ──────────────────────────────────────────────

export type PastedGradeRow = { name: string; target: number | null; predicted: number | null; actual: number | null };

function gradeCell(raw: string | undefined): number | null | "bad" {
  const s = (raw ?? "").trim();
  if (s === "" || s === "-" || s === "–") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : "bad";
}

/**
 * Parses pasted spreadsheet rows: name, target, predicted, actual (tab, comma or
 * semicolon separated). A header row is skipped. Returns the good rows and
 * a line-numbered list of problems.
 */
export function parsePastedGrades(text: string): { rows: PastedGradeRow[]; errors: string[] } {
  const rows: PastedGradeRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.includes("\t") ? line.split("\t") : line.split(/[;,]/);
    const name = (parts[0] || "").trim();
    if (i === 0 && /^(pupil|name|student)/i.test(name)) return;
    if (!name) {
      errors.push(`Line ${i + 1}: no name.`);
      return;
    }
    const t = gradeCell(parts[1]);
    const p = gradeCell(parts[2]);
    const a = gradeCell(parts[3]);
    if (t === "bad" || p === "bad" || a === "bad") {
      errors.push(`Line ${i + 1} (${name}): grades must be whole numbers 1-9 or blank.`);
      return;
    }
    rows.push({ name, target: t, predicted: p, actual: a });
  });
  return { rows, errors };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Guard against spreadsheet formula injection from pupil/subject text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
