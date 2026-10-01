// TypeScript mirror of public.teacher_for(class_id, subject_id, on_date)
// (migration 0050). Keep the two in step.
//
// A class_subject_teachers row maps (class, subject) to a teacher. A dated
// row overrides the open-ended default while it is valid; the most specific
// valid row wins: both dates set, then one date set, then the default; ties
// go to the later valid_from, then the newest row.

export type CstRow = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  valid_from: string | null; // yyyy-mm-dd
  valid_to: string | null;
  lessons_per_week: number | null;
  notes: string | null;
  created_at?: string;
};

export const isDefaultRow = (r: Pick<CstRow, "valid_from" | "valid_to">): boolean => !r.valid_from && !r.valid_to;

const specificity = (r: CstRow): number => (r.valid_from && r.valid_to ? 0 : r.valid_from || r.valid_to ? 1 : 2);

export const isValidOn = (r: Pick<CstRow, "valid_from" | "valid_to">, on: string): boolean =>
  (!r.valid_from || r.valid_from <= on) && (!r.valid_to || r.valid_to >= on);

/** The row that decides who teaches (class, subject) on a date, or null. */
export function rowFor(rows: CstRow[], classId: string, subjectId: string, on: string): CstRow | null {
  const hits = rows.filter((r) => r.class_id === classId && r.subject_id === subjectId && isValidOn(r, on));
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const s = specificity(a) - specificity(b);
    if (s !== 0) return s;
    // valid_from desc, nulls last
    if (a.valid_from !== b.valid_from) {
      if (!a.valid_from) return 1;
      if (!b.valid_from) return -1;
      return a.valid_from < b.valid_from ? 1 : -1;
    }
    return (b.created_at || "").localeCompare(a.created_at || "");
  });
  return hits[0];
}

export function teacherFor(rows: CstRow[], classId: string, subjectId: string, on: string): string | null {
  return rowFor(rows, classId, subjectId, on)?.teacher_id ?? null;
}

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Mr X (Arabic), Ms Y (Maths)" for a class on a date. */
export function classTeacherNames(
  rows: CstRow[],
  classId: string,
  subjectIds: string[],
  on: string,
  teacherName: (id: string) => string,
  subjectName: (id: string) => string,
): string {
  const parts: { subject: string; text: string }[] = [];
  for (const sid of subjectIds) {
    const t = teacherFor(rows, classId, sid, on);
    if (t) parts.push({ subject: subjectName(sid), text: `${teacherName(t)} (${subjectName(sid)})` });
  }
  return parts.sort((a, b) => a.subject.localeCompare(b.subject)).map((p) => p.text).join(", ");
}

/** The default (open-ended) lessons per week a teacher carries, counting each
 * (class, subject) once, using the teacher in force on `on`. `lessonsFor`
 * gives the weekly lessons needed for the pair. */
export function teacherLoad(
  pairs: { class_id: string; subject_id: string; lessons: number }[],
  rows: CstRow[],
  on: string,
): Map<string, number> {
  const load = new Map<string, number>();
  for (const p of pairs) {
    const t = teacherFor(rows, p.class_id, p.subject_id, on);
    if (t) load.set(t, (load.get(t) || 0) + p.lessons);
  }
  return load;
}

/** Soft ceiling used for the "too many lessons" warning. 6 periods x 5 days
 * is the grid; a teacher over this is almost certainly unplaceable. */
export const MAX_TEACHER_LESSONS_PER_WEEK = 25;
