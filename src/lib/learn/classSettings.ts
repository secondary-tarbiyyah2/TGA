import { getSupabaseClient } from "@/lib/supabase/client";

export type GradeCalculation = "average" | "weighted";

export type ClassSettings = {
  description: string;
  section: string;
  room: string;
  meetingLink: string;
  studentsCanComment: boolean;
  showDeletedToStaff: boolean;
  autoDraftMissing: boolean;
  autoDraftPercent: number;
  showOverallGrade: boolean;
  gradeCalculation: GradeCalculation;
};

/** The safe defaults used until a teacher saves anything: pupils cannot comment, no overall grade shown. */
export const DEFAULT_CLASS_SETTINGS: ClassSettings = {
  description: "",
  section: "",
  room: "",
  meetingLink: "",
  studentsCanComment: false,
  showDeletedToStaff: true,
  autoDraftMissing: false,
  autoDraftPercent: 0,
  showOverallGrade: false,
  gradeCalculation: "average",
};

type Row = {
  description: string | null;
  section: string | null;
  room: string | null;
  meeting_link: string | null;
  students_can_comment: boolean;
  show_deleted_to_staff: boolean;
  auto_draft_missing: boolean;
  auto_draft_percent: number;
  show_overall_grade: boolean;
  grade_calculation: GradeCalculation;
};

export function settingsFromRow(r: Row | null): ClassSettings {
  if (!r) return DEFAULT_CLASS_SETTINGS;
  return {
    description: r.description || "",
    section: r.section || "",
    room: r.room || "",
    meetingLink: r.meeting_link || "",
    studentsCanComment: r.students_can_comment,
    showDeletedToStaff: r.show_deleted_to_staff,
    autoDraftMissing: r.auto_draft_missing,
    autoDraftPercent: r.auto_draft_percent,
    showOverallGrade: r.show_overall_grade,
    gradeCalculation: r.grade_calculation,
  };
}

export async function fetchClassSettings(classId: string): Promise<ClassSettings> {
  const supabase = getSupabaseClient();
  if (!supabase) return DEFAULT_CLASS_SETTINGS;
  const { data } = await supabase.from("class_settings").select("*").eq("class_id", classId).maybeSingle();
  return settingsFromRow((data as unknown as Row | null) || null);
}

export type GradeCategory = { id: string; name: string; weight: number; assessmentTypeId: string | null };

/**
 * Overall grade from a list of percentages (average) or from per-category
 * averages weighted by the category weights (weighted). Weights are
 * re-scaled over the categories that actually have results, so a class that
 * has not yet sat one category is not dragged down. Returns null with no data.
 */
export function overallPercent(
  method: GradeCalculation,
  results: { percent: number; categoryId: string | null }[],
  categories: GradeCategory[],
): number | null {
  if (results.length === 0) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (method === "weighted" && categories.length > 0) {
    let total = 0;
    let weight = 0;
    for (const c of categories) {
      const xs = results.filter((r) => r.categoryId === c.id).map((r) => r.percent);
      if (xs.length === 0 || c.weight <= 0) continue;
      total += avg(xs) * c.weight;
      weight += c.weight;
    }
    if (weight > 0) return Math.round((total / weight) * 10) / 10;
  }
  return Math.round(avg(results.map((r) => r.percent)) * 10) / 10;
}
