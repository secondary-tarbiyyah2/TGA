import type { TimetableSlot } from "@/lib/learn/timetable";

export type Run = { id: string; label: string; status: string; academic_year_id: string; created_at: string; solver_stats: Record<string, unknown> | null };
export type Conflict = { id: string; severity: "hard" | "soft"; message: string; resolved: boolean; kind?: string | null; details?: Record<string, unknown> | null };
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

/** A slot as loaded by the timetable page; `locked` exists once migration 0056 is applied. */
export type LockableSlot = TimetableSlot & { locked?: boolean };

const slotLabel = (s: TimetableSlot): string => `${s.classes?.name || "another class"}${s.subjects?.name ? ` ${s.subjects.name}` : ""}`;

/**
 * Hard clash check for putting `slot` (optionally with another teacher) at
 * weekday/start/end. `all` must be EVERY slot in the run, across all classes
 * and year groups: a teacher can only be in one place at a time, so another
 * class's lesson with the same teacher blocks the move. Same rules as
 * SlotEditor and the database EXCLUDE constraints (migration 0008). Returns a
 * plain-English problem, or null when the move is fine.
 */
export function moveProblem(slot: TimetableSlot, weekday: number, start: string, end: string, all: TimetableSlot[], teacherId: string = slot.teacher_user_id): string | null {
  const overlaps = (s: TimetableSlot): boolean => s.id !== slot.id && s.weekday === weekday && hhmm(s.start_time) < end && start < hhmm(s.end_time);
  const hit = all.filter(overlaps);
  const theirs = hit.find((s) => s.teacher_user_id === teacherId);
  if (theirs) return `That teacher is already teaching ${slotLabel(theirs)} at this time (${hhmm(theirs.start_time)}-${hhmm(theirs.end_time)}).`;
  const sameClass = hit.find((s) => s.class_id === slot.class_id);
  if (sameClass) return `That class already has ${sameClass.subjects?.name || "a lesson"} at this time.`;
  if (slot.virtual_session_id && hit.some((s) => s.virtual_session_id === slot.virtual_session_id)) return "That virtual session is already in use at this time.";
  return null;
}

const MAX_PER_DAY_WARN = 6;

/** Non-blocking warnings for a move: availability, protected time, teacher day load. */
export function moveWarnings(
  slot: TimetableSlot,
  weekday: number,
  start: string,
  end: string,
  all: TimetableSlot[],
  availability: Availability[],
  protectedTimes: Protected[],
  yearId: string,
  teacherId: string = slot.teacher_user_id,
): string[] {
  const out: string[] = [];
  const mine = availability.filter((a) => a.teacher_user_id === teacherId && a.academic_year_id === yearId);
  if (!mine.some((a) => a.weekday === weekday && hhmm(a.start_time) <= start && hhmm(a.end_time) >= end)) out.push("The teacher has not marked themselves available at this time.");
  if (protectedTimes.some((p) => p.academic_year_id === yearId && p.weekday === weekday && hhmm(p.start_time) < end && start < hhmm(p.end_time))) out.push("This time overlaps a protected time.");
  const sameDay = all.filter((s) => s.id !== slot.id && s.teacher_user_id === teacherId && s.weekday === weekday).length + 1;
  if (sameDay > MAX_PER_DAY_WARN) out.push(`The teacher would have ${sameDay} lessons that day.`);
  return out;
}

export type SubjectOpt = { id: string; name: string };
export type SessionOpt = { id: string; name: string; meeting_url?: string | null; capacity?: number | null };
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
