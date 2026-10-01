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
