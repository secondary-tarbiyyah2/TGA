import type { TimetableSlot } from "@/lib/learn/timetable";

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

/**
 * Hard clash check for moving `slot` to weekday/start/end (same rules as
 * SlotEditor: teacher, class and virtual session can't overlap). Returns a
 * plain-English problem, or null when the move is fine.
 */
export function moveProblem(slot: TimetableSlot, weekday: number, start: string, end: string, all: TimetableSlot[]): string | null {
  const overlaps = (s: TimetableSlot): boolean => s.id !== slot.id && s.weekday === weekday && hhmm(s.start_time) < end && start < hhmm(s.end_time);
  const hit = all.filter(overlaps);
  if (hit.some((s) => s.teacher_user_id === slot.teacher_user_id)) return "That teacher already has a lesson at this time.";
  if (hit.some((s) => s.class_id === slot.class_id)) return "That class already has a lesson at this time.";
  if (slot.virtual_session_id && hit.some((s) => s.virtual_session_id === slot.virtual_session_id)) return "That virtual session is already in use at this time.";
  return null;
}

export type SubjectOpt = { id: string; name: string };
export type SessionOpt = { id: string; name: string };
export type Colour = { bg: string; border: string; text: string };

/** Distinct colour per subject: hues are spread evenly over the subjects in
 * name order, so two subjects never look alike. Unknown ids get grey. */
export function subjectColours(subjects: SubjectOpt[]): (subjectId: string | null | undefined) => Colour {
  const ids = [...subjects].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.id);
  return (id) => {
    const i = id ? ids.indexOf(id) : -1;
    if (i < 0) return { bg: "hsl(0 0% 94%)", border: "hsl(0 0% 55%)", text: "hsl(0 0% 20%)" };
    const h = Math.round((i * 137.508) % 360);
    return { bg: `hsl(${h} 70% 91%)`, border: `hsl(${h} 50% 48%)`, text: `hsl(${h} 60% 20%)` };
  };
}
