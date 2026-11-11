// Run with: node --test --experimental-strip-types src/lib/learn/attendanceCodes.test.ts
// (CI runs it in the lint job.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTENDANCE_CODES, attendanceLabel, tallyAttendance, technicalRepeats } from "./attendanceCodes.ts";

test("the five codes, in the owner's order and words", () => {
  assert.deepEqual(
    ATTENDANCE_CODES.map((c) => c.label),
    ["Present", "Late", "Authorised absence", "Unauthorised absence", "Technical absence"],
  );
  for (const c of ATTENDANCE_CODES) {
    assert.ok(c.help.length > 0, `${c.label} has help text`);
    assert.ok(!/[–—]/.test(c.help + c.label), `${c.label} has no dashes`);
  }
});

test("database values map to the codes", () => {
  assert.equal(attendanceLabel("excused"), "Authorised absence");
  assert.equal(attendanceLabel("absent"), "Unauthorised absence");
  assert.equal(attendanceLabel("technical"), "Technical absence");
  assert.match(attendanceLabel("not_engaged"), /^Present/);
});

test("technical absences are counted on their own, not against the rate", () => {
  const t = tallyAttendance([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "excused" }, { status: "technical" }, { status: "not_engaged" }]);
  assert.equal(t.attended, 3);
  assert.equal(t.late, 1);
  assert.equal(t.unauthorised, 1);
  assert.equal(t.authorised, 1);
  assert.equal(t.technical, 1);
  assert.equal(t.rate, 75);
  assert.equal(tallyAttendance([{ status: "technical" }]).rate, null);
});

test("a repeat of technical absences is flagged", () => {
  assert.equal(technicalRepeats(["2026-11-02"]), false);
  assert.equal(technicalRepeats(["2026-11-02", "2026-11-02"]), false, "two lessons on one day is one day");
  assert.equal(technicalRepeats(["2026-11-02", "2026-11-20"]), true);
  assert.equal(technicalRepeats(["2026-09-01", "2026-11-20"]), false);
});
