// Cover for absent staff (Tafweed T30, migration 0187). Pure functions only,
// so they can be unit-tested (cover.test.ts) and used by the admin page.
//
// An absence runs from `starts_on` to `ends_on`. A part day is written as a
// time on the first day ("away from 13:00") and/or on the last day ("back at
// 11:00"); every day in between is a whole day. Lessons on weekdays in that
// time, from the published timetable, are the affected lessons.

export type CoverStaff = { id: string; name: string; isCoverStaff: boolean };
export type CoverSlot = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_user_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  classes?: { name: string; year_group?: string | null } | null;
  subjects?: { name: string } | null;
};
export type StaffAbsence = {
  id: string;
  teacher_user_id: string;
  starts_on: string;
  ends_on: string;
  start_time: string | null;
  end_time: string | null;
  category?: string | null;
  reason: string | null;
};
export type CoverRow = {
  id: string;
  slot_id: string;
  cover_date: string;
  covering_teacher_user_id: string;
  original_teacher_user_id?: string;
};
export type SubjectLink = { teacher_id: string; subject_id: string; class_id?: string | null };
export type EnrichmentBlock = { active: boolean; kind: string; supervisor_user_id?: string | null; weekdays: number[]; start_time: string; end_time: string };

export type AffectedLesson = { key: string; slot: CoverSlot; date: string; cover: CoverRow | null };
export type Candidate = { staff: CoverStaff; score: number; reasons: string[]; sameSubject: boolean };

export const MAX_ABSENCE_DAYS = 62;
export const RECENT_DAYS = 28;

export const ABSENCE_CATEGORY: Record<string, string> = {
  sickness: "Sickness",
  medical: "Medical appointment",
  training: "Training",
  school_business: "School business",
  leave: "Leave",
  other: "Other",
};

const hm = (t: string | null | undefined): string => (t || "").slice(0, 5);
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean => hm(aStart) < hm(bEnd) && hm(bStart) < hm(aEnd);

/** "2026-11-09" plus n days, by the calendar (no time zone drift). */
export function addDaysKey(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
/** 0 Sunday to 6 Saturday, like timetable_slots.weekday. */
export function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Is the member of staff away for a lesson on this date at this time? */
export function awayFor(a: Pick<StaffAbsence, "starts_on" | "ends_on" | "start_time" | "end_time">, date: string, start: string, end: string): boolean {
  if (date < a.starts_on || date > a.ends_on) return false;
  // First day: away from start_time, so a lesson ending by then is still taught.
  if (date === a.starts_on && a.start_time && hm(end) <= hm(a.start_time)) return false;
  // Last day: back at end_time, so a lesson starting then or later is taught.
  if (date === a.ends_on && a.end_time && hm(start) >= hm(a.end_time)) return false;
  return true;
}

/** "Mon 9 Nov, from 13:00 to Wed 11 Nov" in plain words. */
export function absenceLabel(a: StaffAbsence, dateLabel: (k: string) => string): string {
  const first = `${dateLabel(a.starts_on)}${a.start_time ? `, from ${hm(a.start_time)}` : ""}`;
  if (a.starts_on === a.ends_on) {
    if (a.start_time && a.end_time) return `${dateLabel(a.starts_on)}, ${hm(a.start_time)} to ${hm(a.end_time)}`;
    if (a.end_time) return `${dateLabel(a.starts_on)}, until ${hm(a.end_time)}`;
    return a.start_time ? first : `${dateLabel(a.starts_on)}, all day`;
  }
  return `${first} to ${dateLabel(a.ends_on)}${a.end_time ? `, back at ${hm(a.end_time)}` : ""}`;
}

/** Every lesson the absence affects (weekdays, published timetable), with its cover if assigned. */
export function affectedLessons(absence: StaffAbsence, slots: CoverSlot[], covers: CoverRow[], from?: string): AffectedLesson[] {
  const out: AffectedLesson[] = [];
  let day = from && from > absence.starts_on ? from : absence.starts_on;
  for (let i = 0; i < MAX_ABSENCE_DAYS && day <= absence.ends_on; i++, day = addDaysKey(day, 1)) {
    const wd = weekdayOfKey(day);
    if (wd < 1 || wd > 5) continue;
    for (const s of slots) {
      if (s.teacher_user_id !== absence.teacher_user_id || s.weekday !== wd) continue;
      if (!awayFor(absence, day, s.start_time, s.end_time)) continue;
      const cover = covers.find((c) => c.slot_id === s.id && c.cover_date === day) || null;
      out.push({ key: `${s.id}|${day}`, slot: s, date: day, cover });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || hm(a.slot.start_time).localeCompare(hm(b.slot.start_time)));
}

/**
 * Everyone free to cover one lesson, best first, with the reasons shown to
 * the person choosing. Free = not away then, no lesson of their own then,
 * not already covering then and not supervising an enrichment block then.
 * Ranked by:
 *   1. subject match: teaches this subject (timetable or class mapping), or
 *      already teaches this class, or is cover staff;
 *   2. free periods: fewer lessons and covers of their own that day first;
 *   3. recent cover load: fewer covers in the last four weeks (and already
 *      booked ahead) first, so the same person isn't always asked.
 */
export function rankCover(args: {
  lesson: { slot: CoverSlot; date: string };
  staff: CoverStaff[];
  slots: CoverSlot[];
  covers: CoverRow[];
  absences: StaffAbsence[];
  subjectLinks: SubjectLink[];
  enrichment?: EnrichmentBlock[];
  today: string;
}): Candidate[] {
  const { lesson, staff, slots, covers, absences, subjectLinks, enrichment = [], today } = args;
  const { slot, date } = lesson;
  const wd = slot.weekday;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const subjectName = slot.subjects?.name || "this subject";
  const recentFrom = addDaysKey(today, -RECENT_DAYS);
  const out: Candidate[] = [];

  for (const person of staff) {
    if (person.id === slot.teacher_user_id) continue;
    if (absences.some((a) => a.teacher_user_id === person.id && awayFor(a, date, slot.start_time, slot.end_time))) continue;
    const ownThatDay = slots.filter((s) => s.teacher_user_id === person.id && s.weekday === wd);
    if (ownThatDay.some((s) => overlaps(s.start_time, s.end_time, slot.start_time, slot.end_time))) continue;
    const coversThatDay = covers.filter((c) => c.covering_teacher_user_id === person.id && c.cover_date === date);
    if (
      coversThatDay.some((c) => {
        const other = slotById.get(c.slot_id);
        return Boolean(other && overlaps(other.start_time, other.end_time, slot.start_time, slot.end_time));
      })
    )
      continue;
    if (enrichment.some((p) => p.active && p.kind === "enrichment" && p.supervisor_user_id === person.id && p.weekdays.includes(wd) && overlaps(p.start_time, p.end_time, slot.start_time, slot.end_time))) continue;

    const reasons: string[] = [];
    let score = 0;
    const sameSubject = slots.some((s) => s.teacher_user_id === person.id && s.subject_id === slot.subject_id) || subjectLinks.some((l) => l.teacher_id === person.id && l.subject_id === slot.subject_id);
    const knowsClass = slots.some((s) => s.teacher_user_id === person.id && s.class_id === slot.class_id) || subjectLinks.some((l) => l.teacher_id === person.id && l.class_id === slot.class_id);
    if (sameSubject) {
      score += 50;
      reasons.push(`Teaches ${subjectName}`);
    }
    if (knowsClass) {
      score += 15;
      reasons.push("Already teaches this class");
    }
    if (person.isCoverStaff) {
      score += sameSubject ? 5 : 25;
      reasons.push("Cover staff");
    }
    if (!sameSubject && !knowsClass && !person.isCoverStaff) reasons.push(`Free, but doesn't teach ${subjectName}`);

    const busy = ownThatDay.length + coversThatDay.length;
    score -= busy * 8;
    reasons.push(busy === 0 ? "No other lessons that day" : `${busy} other lesson${busy === 1 ? "" : "s"} that day`);

    const recent = covers.filter((c) => c.covering_teacher_user_id === person.id && c.cover_date >= recentFrom && c.cover_date < today).length;
    const ahead = covers.filter((c) => c.covering_teacher_user_id === person.id && c.cover_date >= today).length;
    score -= recent * 5 + ahead * 3;
    reasons.push(recent === 0 ? "No cover in the last 4 weeks" : `Covered ${recent} lesson${recent === 1 ? "" : "s"} in the last 4 weeks`);
    if (ahead > 0) reasons.push(`${ahead} cover${ahead === 1 ? "" : "s"} already booked`);

    out.push({ staff: person, score, reasons, sameSubject });
  }
  return out.sort((a, b) => b.score - a.score || a.staff.name.localeCompare(b.staff.name));
}

export type CoverReportRow = { id: string; name: string; given: number; received: number };

/** Lessons each member of staff covered, and had covered for them, between two dates (inclusive). */
export function coverReport(covers: CoverRow[], staff: { id: string; name: string }[], from: string, to: string): CoverReportRow[] {
  const rows = new Map<string, CoverReportRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { id, name: staff.find((s) => s.id === id)?.name || "Former member of staff", given: 0, received: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const c of covers) {
    if (c.cover_date < from || c.cover_date > to) continue;
    row(c.covering_teacher_user_id).given++;
    if (c.original_teacher_user_id) row(c.original_teacher_user_id).received++;
  }
  return [...rows.values()].sort((a, b) => b.given - a.given || b.received - a.received || a.name.localeCompare(b.name));
}
