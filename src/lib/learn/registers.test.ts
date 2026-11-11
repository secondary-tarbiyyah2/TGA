// Run with: node --test --experimental-strip-types src/lib/learn/registers.test.ts
// (CI runs it in the lint job.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsAction, periodName, rangeDates, registerState } from "./registers.ts";

// Wednesday 11 November 2026 (GMT, so UK time is UTC).
const NOW = new Date("2026-11-11T10:00:00Z");

test("a lesson not started yet is not due", () => {
  assert.equal(registerState({ date: "2026-11-11", start: "11:00", marked: 0, total: 5, firstMarkedAt: null }, NOW), "upcoming");
  assert.equal(registerState({ date: "2026-11-12", start: "09:00", marked: 0, total: 5, firstMarkedAt: null }, NOW), "upcoming");
});

test("a lesson that has started with no marks is not taken", () => {
  assert.equal(registerState({ date: "2026-11-11", start: "09:00", marked: 0, total: 5, firstMarkedAt: null }, NOW), "not_taken");
  assert.equal(registerState({ date: "2026-11-02", start: "12:15", marked: 0, total: 5, firstMarkedAt: null }, NOW), "not_taken");
});

test("some pupils marked is partly taken", () => {
  assert.equal(registerState({ date: "2026-11-11", start: "09:00", marked: 3, total: 5, firstMarkedAt: "2026-11-11T09:02:00Z" }, NOW), "partial");
  assert.ok(needsAction("partial") && needsAction("not_taken") && !needsAction("taken") && !needsAction("late"));
});

test("everyone marked is taken, or taken late after the grace time", () => {
  assert.equal(registerState({ date: "2026-11-11", start: "09:00", marked: 5, total: 5, firstMarkedAt: "2026-11-11T09:10:00Z" }, NOW), "taken");
  assert.equal(registerState({ date: "2026-11-11", start: "09:00", marked: 5, total: 5, firstMarkedAt: "2026-11-11T09:15:00Z" }, NOW), "taken");
  assert.equal(registerState({ date: "2026-11-11", start: "09:00", marked: 5, total: 5, firstMarkedAt: "2026-11-11T09:16:00Z" }, NOW), "late");
});

test("British summer time is respected", () => {
  // 09:00 BST is 08:00 UTC; a first mark at 08:05 UTC is on time.
  const summer = new Date("2026-06-10T12:00:00Z");
  assert.equal(registerState({ date: "2026-06-10", start: "09:00", marked: 4, total: 4, firstMarkedAt: "2026-06-10T08:05:00Z" }, summer), "taken");
  assert.equal(registerState({ date: "2026-06-10", start: "09:00", marked: 4, total: 4, firstMarkedAt: "2026-06-10T08:30:00Z" }, summer), "late");
});

test("ranges start weeks on Monday", () => {
  assert.deepEqual(rangeDates("today", "2026-11-11"), { from: "2026-11-11", to: "2026-11-11" });
  assert.deepEqual(rangeDates("this_week", "2026-11-11"), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(rangeDates("last_week", "2026-11-11"), { from: "2026-11-02", to: "2026-11-08" });
  assert.deepEqual(rangeDates("this_week", "2026-11-15"), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(rangeDates("last_30", "2026-11-11"), { from: "2026-10-13", to: "2026-11-11" });
});

test("period names come from the school day's lesson periods", () => {
  const periods = [
    { name: "Break", kind: "break", start_time: "10:00" },
    { name: "Period 1", kind: "lesson", start_time: "09:00:00" },
  ];
  assert.equal(periodName("09:00", periods), "Period 1");
  assert.equal(periodName("10:00", periods), null);
});
