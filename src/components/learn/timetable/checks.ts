import { WEEKDAYS, type TimetableSlot } from "@/lib/learn/timetable";
import { hhmm, type Availability, type ClassOpt, type Protected, type Teacher } from "./types";

export type SlotIssue = { slotId: string; level: "hard" | "soft"; text: string };

const dayName = (n: number) => WEEKDAYS.find((w) => w.value === n)?.short || String(n);
const overlap = (a: TimetableSlot, b: TimetableSlot) => a.weekday === b.weekday && hhmm(a.start_time) < hhmm(b.end_time) && hhmm(b.start_time) < hhmm(a.end_time);

/** Client-side warnings for a set of slots (the database already refuses
 * hard clashes; these also catch availability and protected-time problems
 * that it cannot express). */
export function slotIssues(slots: TimetableSlot[], teachers: Teacher[], availability: Availability[], protectedTimes: Protected[], yearId: string): SlotIssue[] {
  const out: SlotIssue[] = [];
  const tname = (id: string) => teachers.find((t) => t.id === id)?.full_name || "Teacher";
  const avail = availability.filter((a) => a.academic_year_id === yearId);
  const prot = protectedTimes.filter((p) => p.academic_year_id === yearId);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const label = `${s.classes?.name || "Class"} ${dayName(s.weekday)} ${hhmm(s.start_time)}`;
    for (let j = i + 1; j < slots.length; j++) {
      const o = slots[j];
      if (!overlap(s, o)) continue;
      if (s.teacher_user_id === o.teacher_user_id) out.push({ slotId: s.id, level: "hard", text: `${tname(s.teacher_user_id)} is double-booked: ${label} overlaps ${o.classes?.name || "another class"}.` });
      else if (s.class_id === o.class_id) out.push({ slotId: s.id, level: "hard", text: `${s.classes?.name || "A class"} has two lessons at once on ${dayName(s.weekday)} ${hhmm(s.start_time)}.` });
    }
    const mine = avail.filter((a) => a.teacher_user_id === s.teacher_user_id);
    if (mine.length > 0 && !mine.some((a) => a.weekday === s.weekday && hhmm(a.start_time) <= hhmm(s.start_time) && hhmm(a.end_time) >= hhmm(s.end_time))) {
      out.push({ slotId: s.id, level: "soft", text: `${tname(s.teacher_user_id)} is not marked available for ${label}.` });
    }
    for (const p of prot) {
      if (p.weekday === s.weekday && hhmm(p.start_time) < hhmm(s.end_time) && hhmm(s.start_time) < hhmm(p.end_time)) out.push({ slotId: s.id, level: "soft", text: `${label} overlaps a protected time (${p.name}).` });
    }
  }
  return out;
}

/** Classes whose placed lessons differ from the lessons needed per week. */
export function coverageGaps(slots: TimetableSlot[], classes: ClassOpt[]): { cls: ClassOpt; placed: number }[] {
  const placed = new Map<string, number>();
  for (const s of slots) placed.set(s.class_id, (placed.get(s.class_id) || 0) + 1);
  return classes.map((cls) => ({ cls, placed: placed.get(cls.id) || 0 })).filter((x) => x.placed !== x.cls.weekly_lessons);
}
