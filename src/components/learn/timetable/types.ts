export type Run = { id: string; label: string; status: string; academic_year_id: string; created_at: string; solver_stats: Record<string, unknown> | null };
export type Conflict = { id: string; severity: "hard" | "soft"; message: string; resolved: boolean };
export type Teacher = { id: string; full_name: string };
export type YearOpt = { id: string; label: string; starts_on: string; ends_on: string };
export type TermOpt = { id: string; name: string; academic_year_id: string };
export type ClassOpt = { id: string; name: string; subject_id: string | null; academic_year_id: string | null; weekly_lessons: number };
export type ClassTeacherLink = { user_id: string; scope_id: string };
export type Availability = { teacher_user_id: string; academic_year_id: string; weekday: number; start_time: string; end_time: string };
export type Protected = { name: string; academic_year_id: string; weekday: number; start_time: string; end_time: string };

export const hhmm = (t: string): string => t.slice(0, 5);

/** Stable colour per class so the same class always looks the same. */
export function classColour(classId: string): { bg: string; border: string; text: string } {
  let h = 0;
  for (let i = 0; i < classId.length; i++) h = (h * 31 + classId.charCodeAt(i)) % 360;
  return { bg: `hsl(${h} 70% 92%)`, border: `hsl(${h} 45% 55%)`, text: `hsl(${h} 55% 22%)` };
}
