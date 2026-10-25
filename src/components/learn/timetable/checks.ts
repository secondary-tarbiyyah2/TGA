import { PERIODS, WEEKDAYS, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";
import { isDefaultRow, rowFor, todayIso, type CstRow } from "@/lib/learn/teacherFor";
import { hhmm, type Availability, type ClassOpt, type ClassTeacherLink, type Protected, type Teacher } from "./types";

export type SlotIssue = { slotId: string; level: "hard" | "soft"; text: string };

const dayName = (n: number) => WEEKDAYS.find((w) => w.value === n)?.short || String(n);
const overlap = (a: TimetableSlot, b: TimetableSlot) => a.weekday === b.weekday && hhmm(a.start_time) < hhmm(b.end_time) && hhmm(b.start_time) < hhmm(a.end_time);

/** Client-side warnings for a set of slots (the database already refuses
 * hard clashes; these also catch availability and protected-time problems
 * that it cannot express). */
export function slotIssues(slots: TimetableSlot[], teachers: Teacher[], availability: Availability[], protectedTimes: Protected[], yearId: string, periods: TimetablePeriod[] = []): SlotIssue[] {
  const out: SlotIssue[] = [];
  for (const c of supervisorClashes(slots, periods, teachers)) out.push({ slotId: c.slotId, level: "soft", text: c.text });
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

export type SupervisorClash = { periodId: string; slotId: string; teacherId: string; text: string };

/**
 * Enrichment blocks whose supervisor is also teaching a lesson at the same
 * time (same weekday, overlapping times). A warning, not a hard clash: the
 * head decides whether to move the lesson or pick another supervisor.
 */
export function supervisorClashes(slots: TimetableSlot[], periods: TimetablePeriod[], teachers: Teacher[] = []): SupervisorClash[] {
  const out: SupervisorClash[] = [];
  const tname = (id: string) => teachers.find((t) => t.id === id)?.full_name || "The supervisor";
  for (const p of periods) {
    if (!p.active || p.kind !== "enrichment" || !p.supervisor_user_id) continue;
    for (const s of slots) {
      if (s.teacher_user_id !== p.supervisor_user_id) continue;
      if (!p.weekdays.includes(s.weekday)) continue;
      if (!(hhmm(s.start_time) < hhmm(p.end_time) && hhmm(p.start_time) < hhmm(s.end_time))) continue;
      out.push({
        periodId: p.id,
        slotId: s.id,
        teacherId: s.teacher_user_id,
        text: `${tname(s.teacher_user_id)} supervises "${p.name}" (${hhmm(p.start_time)}-${hhmm(p.end_time)}) on ${dayName(s.weekday)} but is teaching ${s.classes?.name || "a class"}${s.subjects?.name ? ` ${s.subjects.name}` : ""} at ${hhmm(s.start_time)}-${hhmm(s.end_time)}.`,
      });
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

// ── Clash validation (offline, no database needed) ─────────────────────────

export type Clash = { kind: "teacher" | "class" | "session" | "time"; slotIds: string[]; text: string };

/**
 * Validates a FULL timetable for hard clashes: a teacher in two places at once
 * (any classes, any year group), a class with two lessons at once, a virtual
 * session used twice, and nonsense times. Pure function: used before Publish
 * and by `selfTestChecks()`. Times are compared as "HH:MM" strings.
 */
export function findClashes(slots: TimetableSlot[], teachers: Teacher[] = []): Clash[] {
  const out: Clash[] = [];
  const tname = (id: string) => teachers.find((t) => t.id === id)?.full_name || "A teacher";
  const label = (s: TimetableSlot) => `${s.classes?.name || "a class"}${s.subjects?.name ? ` ${s.subjects.name}` : ""}`;
  const when = (s: TimetableSlot) => `${dayName(s.weekday)} ${hhmm(s.start_time)}-${hhmm(s.end_time)}`;
  for (const s of slots) {
    if (hhmm(s.end_time) <= hhmm(s.start_time)) out.push({ kind: "time", slotIds: [s.id], text: `${label(s)} on ${dayName(s.weekday)} ends before it starts (${hhmm(s.start_time)}-${hhmm(s.end_time)}).` });
  }
  // Sort by day + start so each lesson is only compared with the ones that could overlap it.
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.weekday !== a.weekday || hhmm(b.start_time) >= hhmm(a.end_time)) break;
      if (!overlap(a, b)) continue;
      if (a.teacher_user_id === b.teacher_user_id) out.push({ kind: "teacher", slotIds: [a.id, b.id], text: `${tname(a.teacher_user_id)} is in two places on ${when(a)}: ${label(a)} and ${label(b)}.` });
      if (a.class_id === b.class_id) out.push({ kind: "class", slotIds: [a.id, b.id], text: `${a.classes?.name || "A class"} has two lessons at once on ${when(a)}: ${label(a)} and ${label(b)}.` });
      if (a.virtual_session_id && a.virtual_session_id === b.virtual_session_id) out.push({ kind: "session", slotIds: [a.id, b.id], text: `The same virtual session is used twice on ${when(a)}: ${label(a)} and ${label(b)}.` });
    }
  }
  return out;
}

/** Tiny built-in test of findClashes. Returns the names of failed cases (empty = all pass). */
export function selfTestChecks(): string[] {
  const mk = (id: string, cls: string, teacher: string, weekday: number, start: string, end: string): TimetableSlot => ({
    id, run_id: "r", class_id: cls, subject_id: "s", teacher_user_id: teacher, virtual_session_id: null, weekday, start_time: start, end_time: end,
  });
  const failed: string[] = [];
  const expect = (name: string, slots: TimetableSlot[], kinds: string[]) => {
    const got = findClashes(slots).map((c) => c.kind).sort().join(",");
    if (got !== [...kinds].sort().join(",")) failed.push(`${name}: expected [${kinds}] got [${got}]`);
  };
  expect("no clash", [mk("1", "A", "T", 1, "09:10", "10:00"), mk("2", "B", "T", 1, "10:10", "11:00")], []);
  expect("teacher in two classes", [mk("1", "A", "T", 1, "09:00", "10:00"), mk("2", "B", "T", 1, "09:00", "10:00")], ["teacher"]);
  expect("teacher partial overlap", [mk("1", "A", "T", 2, "09:00", "10:00"), mk("2", "B", "T", 2, "09:30", "10:30")], ["teacher"]);
  expect("same time other day", [mk("1", "A", "T", 1, "09:00", "10:00"), mk("2", "B", "T", 2, "09:00", "10:00")], []);
  expect("class double-booked", [mk("1", "A", "T1", 1, "09:00", "10:00"), mk("2", "A", "T2", 1, "09:00", "10:00")], ["class"]);
  expect("both", [mk("1", "A", "T", 1, "09:00", "10:00"), mk("2", "A", "T", 1, "09:00", "10:00")], ["class", "teacher"]);
  expect("bad times", [mk("1", "A", "T", 1, "10:00", "09:00")], ["time"]);
  const block = (supervisor: string | null): TimetablePeriod => ({ id: "p", name: "Enrichment", kind: "enrichment", start_time: "12:15", end_time: "12:45", weekdays: [1, 2], band: "A", applies_to: ["all"], activity: null, sort: 0, active: true, supervisor_user_id: supervisor });
  const supervised = (slots: TimetableSlot[], supervisor: string | null) => supervisorClashes(slots, [block(supervisor)]).length;
  if (supervised([mk("1", "A", "T", 1, "12:30", "13:20")], "T") !== 1) failed.push("supervisor teaching during the block should warn");
  if (supervised([mk("1", "A", "T", 3, "12:30", "13:20")], "T") !== 0) failed.push("supervisor teaching on another day should not warn");
  if (supervised([mk("1", "A", "T", 1, "12:45", "13:35")], "T") !== 0) failed.push("lesson starting when the block ends should not warn");
  if (supervised([mk("1", "A", "U", 1, "12:30", "13:20")], "T") !== 0) failed.push("a different teacher should not warn");
  if (supervised([mk("1", "A", "T", 1, "12:30", "13:20")], null) !== 0) failed.push("a block with no supervisor should not warn");
  return failed;
}

// ── Teacher load vs availability (pre-flight) ──────────────────────────────

export const DEFAULT_MAX_LESSONS_PER_DAY = 6;

export type TeacherLoadStatus = "ok" | "tight" | "over" | "no_availability";
export type TeacherLoadRow = {
  teacherId: string;
  name: string;
  lessons: number; // lessons a week needed across ALL classes
  availablePeriods: number; // grid periods the teacher can work (availability minus protected times)
  capacity: number; // lessons actually placeable given the per-day limit
  status: TeacherLoadStatus;
  contributors: { classId: string; label: string; lessons: number }[];
  advice: string;
};

/**
 * Per teacher: lessons needed (every class and year, via the class/subject ->
 * teacher mapping) against the periods they are available for. Mirrors the
 * solver's maths in scripts/timetable-solver/generate.py (`reconcile`).
 */
export function teacherLoadTable(args: {
  yearId: string;
  classes: ClassOpt[];
  subjects: { id: string; name: string }[];
  subjectTeachers: CstRow[];
  classTeachers: ClassTeacherLink[];
  teachers: Teacher[];
  availability: Availability[];
  protectedTimes: Protected[];
  maxPerDay?: number;
  /** Lesson periods (stored school day); defaults to the built-in PERIODS. */
  periods?: { start: string; end: string; weekdays?: number[] }[];
}): { rows: TeacherLoadRow[]; unassignedLessons: number } {
  const { yearId, subjects, subjectTeachers, classTeachers, teachers } = args;
  const maxPerDay = args.maxPerDay ?? DEFAULT_MAX_LESSONS_PER_DAY;
  const gridPeriods = args.periods && args.periods.length > 0 ? args.periods : PERIODS;
  const today = todayIso();
  const classes = args.classes.filter((c) => c.academic_year_id === yearId);
  const prot = args.protectedTimes.filter((p) => p.academic_year_id === yearId);
  const avail = args.availability.filter((a) => a.academic_year_id === yearId);
  const tname = (id: string) => teachers.find((t) => t.id === id)?.full_name || "A teacher";
  const sname = (id: string) => subjects.find((s) => s.id === id)?.name || "subject";

  const demand = new Map<string, TeacherLoadRow["contributors"]>();
  let unassignedLessons = 0;
  for (const c of classes) {
    const sids = new Set<string>();
    if (c.subject_id) sids.add(c.subject_id);
    for (const r of subjectTeachers) if (r.class_id === c.id) sids.add(r.subject_id);
    for (const sid of sids) {
      const rows = subjectTeachers.filter((r) => r.class_id === c.id && r.subject_id === sid);
      const base = rows.find(isDefaultRow) || rowFor(subjectTeachers, c.id, sid, today);
      const lessons = base?.lessons_per_week || (sid === c.subject_id ? c.weekly_lessons : 0);
      if (!lessons) continue;
      let teacher: string | null = base ? base.teacher_id : null;
      if (!teacher && sid === c.subject_id) {
        const scoped = classTeachers.filter((t) => t.scope_id === c.id);
        if (scoped.length === 1) teacher = scoped[0].user_id;
      }
      if (!teacher) {
        unassignedLessons += lessons;
        continue;
      }
      const list = demand.get(teacher) || [];
      list.push({ classId: c.id, label: `${c.name} ${sname(sid)}`, lessons });
      demand.set(teacher, list);
    }
  }

  const rows: TeacherLoadRow[] = [];
  for (const [teacherId, contributors] of demand) {
    const lessons = contributors.reduce((n, x) => n + x.lessons, 0);
    let availablePeriods = 0;
    let capacity = 0;
    for (const wd of WEEKDAYS) {
      let day = 0;
      for (const p of gridPeriods) {
        if (p.weekdays && !p.weekdays.includes(wd.value)) continue; // e.g. no afternoon lessons on Friday
        const ok = avail.some((a) => a.teacher_user_id === teacherId && a.weekday === wd.value && hhmm(a.start_time) <= p.start && p.end <= hhmm(a.end_time));
        const blocked = prot.some((q) => q.weekday === wd.value && hhmm(q.start_time) < p.end && p.start < hhmm(q.end_time));
        if (ok && !blocked) day++;
      }
      availablePeriods += day;
      capacity += Math.min(day, maxPerDay);
    }
    const status: TeacherLoadStatus = availablePeriods === 0 ? "no_availability" : lessons > capacity ? "over" : lessons >= capacity * 0.85 ? "tight" : "ok";
    const top = [...contributors].sort((a, b) => b.lessons - a.lessons)[0];
    const name = tname(teacherId);
    const advice =
      status === "no_availability"
        ? `${name} has no availability set: ask them to add it, or assign another teacher for ${top.label}.`
        : status === "over"
          ? `${name} teaches ${lessons} lessons/week but is available for ${availablePeriods} periods (room for ${capacity}). Reduce by ${lessons - capacity}, add availability, or assign another teacher for ${top.label} (${top.lessons}/week).`
          : status === "tight"
            ? `Nearly full: little room for the solver to avoid clashes with other classes.`
            : "";
    rows.push({ teacherId, name, lessons, availablePeriods, capacity, status, contributors, advice });
  }
  const rank: Record<TeacherLoadStatus, number> = { no_availability: 0, over: 1, tight: 2, ok: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
  return { rows, unassignedLessons };
}

/** Why a draft must not be published, or null. Used by the Publish button. */
export function publishBlocker(slots: TimetableSlot[], teachers: Teacher[]): string | null {
  const clashes = findClashes(slots, teachers);
  if (clashes.length === 0) return null;
  const shown = clashes.slice(0, 5).map((c) => c.text).join(" ");
  return `Cannot publish: ${clashes.length} clash${clashes.length === 1 ? "" : "es"} found. ${shown}${clashes.length > 5 ? ` …and ${clashes.length - 5} more.` : ""} Fix them in the grid (red outlines), then publish.`;
}
