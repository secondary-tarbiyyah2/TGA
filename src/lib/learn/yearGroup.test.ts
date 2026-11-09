// Run with: node --test --experimental-strip-types src/lib/learn/yearGroup.test.ts
// (CI runs it in the lint job.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { academicYearLabel, academicYearStart, findYearGroup, yearLabel, yearNumberForDob, yearNumberFromName, yearsAboveAge } from "./yearGroup.ts";

test("the school year starts on 1 September", () => {
  assert.equal(academicYearStart(new Date(2026, 7, 31)), 2025); // 31 Aug 2026
  assert.equal(academicYearStart(new Date(2026, 8, 1)), 2026); // 1 Sept 2026
  assert.equal(academicYearStart(new Date(2027, 0, 11)), 2026); // 11 Jan 2027
  assert.equal(academicYearLabel(2026), "2026 to 2027");
});

test("31 August is the youngest in the year, 1 September the oldest in the year below", () => {
  // In 2026 to 2027, Year 6 is born 1 Sept 2015 to 31 Aug 2016.
  assert.equal(yearNumberForDob("2016-08-31", 2026), 6);
  assert.equal(yearNumberForDob("2015-09-01", 2026), 6);
  assert.equal(yearNumberForDob("2016-09-01", 2026), 5);
  assert.equal(yearNumberForDob("2015-08-31", 2026), 7);
});

test("Reception to Year 11 in 2026 to 2027", () => {
  assert.equal(yearNumberForDob("2021-09-01", 2026), 0); // Reception: turns 5
  assert.equal(yearNumberForDob("2022-08-31", 2026), 0);
  assert.equal(yearNumberForDob("2020-12-25", 2026), 1); // Year 1: turns 6
  assert.equal(yearNumberForDob("2014-10-10", 2026), 7); // Year 7: turns 12
  assert.equal(yearNumberForDob("2011-03-15", 2026), 11); // Year 11: turns 16
  assert.equal(yearNumberForDob("2010-09-01", 2026), 11);
  assert.equal(yearNumberForDob("2010-08-31", 2026), 12);
});

test("leap-day birthdays and the following school year", () => {
  assert.equal(yearNumberForDob("2016-02-29", 2026), 6);
  assert.equal(yearNumberForDob("2016-02-29", 2027), 7);
});

test("Date objects and bad input", () => {
  assert.equal(yearNumberForDob(new Date(2016, 7, 31), 2026), 6);
  assert.equal(yearNumberForDob(new Date(2016, 8, 1), 2026), 5);
  assert.equal(yearNumberForDob("", 2026), null);
  assert.equal(yearNumberForDob("31/08/2016", 2026), null);
  assert.equal(yearNumberForDob(new Date("nope"), 2026), null);
});

test("year group names", () => {
  assert.equal(yearNumberFromName("Year 7"), 7);
  assert.equal(yearNumberFromName("Y10"), 10);
  assert.equal(yearNumberFromName("Reception"), 0);
  assert.equal(yearNumberFromName("Mixed"), null);
  assert.equal(yearLabel(0), "Reception");
  assert.equal(yearLabel(9), "Year 9");
  const groups = [
    { id: "a", name: "Year 6" },
    { id: "b", name: "Year 7" },
  ];
  assert.equal(findYearGroup(groups, 7)?.id, "b");
  assert.equal(findYearGroup(groups, 8), null);
});

test("working above year group", () => {
  assert.equal(yearsAboveAge(10, 7), 3);
  assert.equal(yearsAboveAge(7, 7), 0);
  assert.equal(yearsAboveAge(null, 7), null);
});
