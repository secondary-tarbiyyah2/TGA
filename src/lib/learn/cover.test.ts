// Run with: node --test --experimental-strip-types src/lib/learn/cover.test.ts
// (CI runs it in the lint job.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedLessons, awayFor, coverReport, rankCover, type CoverSlot, type CoverStaff, type StaffAbsence } from "./cover.ts";

// Monday 16 Nov 2026 to Wednesday 18 Nov 2026.
const MON = "2026-11-16";
const TUE = "2026-11-17";
const WED = "2026-11-18";

const slot = (id: string, teacher: string, weekday: number, start: string, end: string, subject = "maths", cls = "7a"): CoverSlot => ({
  id,
  class_id: cls,
  subject_id: subject,
  teacher_user_id: teacher,
  weekday,
  start_time: start,
  end_time: end,
  subjects: { name: subject === "maths" ? "Maths" : "English" },
  classes: { name: cls },
});

const absence = (over: Partial<StaffAbsence> = {}): StaffAbsence => ({ id: "a1", teacher_user_id: "amina", starts_on: MON, ends_on: WED, start_time: null, end_time: null, reason: null, ...over });

test("part days: away from a time on the first day, back at a time on the last day", () => {
  const a = absence({ start_time: "13:00", end_time: "11:00" });
  assert.equal(awayFor(a, MON, "09:00", "10:00"), false, "morning lesson on the first day is still taught");
  assert.equal(awayFor(a, MON, "13:00", "14:00"), true);
  assert.equal(awayFor(a, TUE, "09:00", "10:00"), true, "whole day in the middle");
  assert.equal(awayFor(a, WED, "10:00", "11:00"), true);
  assert.equal(awayFor(a, WED, "11:00", "12:00"), false, "back for the 11:00 lesson");
  assert.equal(awayFor(a, "2026-11-19", "09:00", "10:00"), false);
});

test("affected lessons follow the timetable, skip weekends and show existing cover", () => {
  const slots = [slot("s-mon", "amina", 1, "09:00", "10:00"), slot("s-tue", "amina", 2, "09:00", "10:00"), slot("s-other", "bilal", 1, "09:00", "10:00")];
  const lessons = affectedLessons(absence({ ends_on: "2026-11-22" }), slots, [{ id: "c1", slot_id: "s-tue", cover_date: TUE, covering_teacher_user_id: "bilal" }]);
  assert.deepEqual(
    lessons.map((l) => [l.slot.id, l.date, l.cover?.id ?? null]),
    [
      ["s-mon", MON, null],
      ["s-tue", TUE, "c1"],
    ],
  );
});

test("cover is ranked by subject, then free periods, then recent cover load", () => {
  const staff: CoverStaff[] = [
    { id: "amina", name: "Amina", isCoverStaff: false },
    { id: "bilal", name: "Bilal", isCoverStaff: false }, // teaches maths, busy that day
    { id: "dawud", name: "Dawud", isCoverStaff: false }, // teaches maths, free that day
    { id: "faisal", name: "Faisal", isCoverStaff: false }, // teaches maths, free, but covered a lot recently
    { id: "hamza", name: "Hamza", isCoverStaff: true }, // cover staff
    { id: "idris", name: "Idris", isCoverStaff: false }, // English teacher, teaching at the same time
    { id: "yusuf", name: "Yusuf", isCoverStaff: false }, // English, free
  ];
  const slots = [
    slot("need", "amina", 1, "10:00", "11:00"),
    slot("b1", "bilal", 1, "09:00", "10:00", "maths", "8a"),
    slot("b2", "bilal", 1, "11:00", "12:00", "maths", "8b"),
    slot("d1", "dawud", 3, "09:00", "10:00", "maths", "9a"),
    slot("f1", "faisal", 4, "09:00", "10:00", "maths", "9b"),
    slot("i1", "idris", 1, "10:30", "11:30", "english", "7b"),
    slot("y1", "yusuf", 4, "09:00", "10:00", "english", "7c"),
  ];
  const covers = [
    { id: "x1", slot_id: "d1", cover_date: "2026-11-04", covering_teacher_user_id: "faisal" },
    { id: "x2", slot_id: "d1", cover_date: "2026-11-11", covering_teacher_user_id: "faisal" },
  ];
  const ranked = rankCover({ lesson: { slot: slots[0], date: MON }, staff, slots, covers, absences: [absence({ ends_on: MON })], subjectLinks: [], today: "2026-11-14" });
  assert.deepEqual(
    ranked.map((c) => c.staff.id),
    ["dawud", "faisal", "bilal", "hamza", "yusuf"],
  );
  assert.ok(!ranked.some((c) => c.staff.id === "idris"), "someone teaching at the same time is never suggested");
  assert.ok(ranked[0].reasons.includes("Teaches Maths"));
  assert.ok(ranked[0].reasons.includes("No other lessons that day"));
  assert.ok(ranked[1].reasons.includes("Covered 2 lessons in the last 4 weeks"));
  assert.ok(ranked[2].reasons.includes("2 other lessons that day"));
});

test("someone away at the time is not suggested", () => {
  const staff: CoverStaff[] = [{ id: "dawud", name: "Dawud", isCoverStaff: true }];
  const need = slot("need", "amina", 1, "10:00", "11:00");
  const away = { ...absence({ id: "a2", teacher_user_id: "dawud", ends_on: MON }) };
  assert.equal(rankCover({ lesson: { slot: need, date: MON }, staff, slots: [need], covers: [], absences: [away], subjectLinks: [], today: MON }).length, 0);
  const backAt10 = { ...away, end_time: "10:00" };
  assert.equal(rankCover({ lesson: { slot: need, date: MON }, staff, slots: [need], covers: [], absences: [backAt10], subjectLinks: [], today: MON }).length, 1);
});

test("the cover report counts lessons covered and lessons covered for", () => {
  const rows = coverReport(
    [
      { id: "1", slot_id: "s", cover_date: MON, covering_teacher_user_id: "dawud", original_teacher_user_id: "amina" },
      { id: "2", slot_id: "s", cover_date: TUE, covering_teacher_user_id: "dawud", original_teacher_user_id: "amina" },
      { id: "3", slot_id: "s", cover_date: "2026-12-01", covering_teacher_user_id: "bilal", original_teacher_user_id: "amina" },
    ],
    [
      { id: "amina", name: "Amina" },
      { id: "dawud", name: "Dawud" },
    ],
    MON,
    WED,
  );
  assert.deepEqual(rows, [
    { id: "dawud", name: "Dawud", given: 2, received: 0 },
    { id: "amina", name: "Amina", given: 0, received: 2 },
  ]);
});
