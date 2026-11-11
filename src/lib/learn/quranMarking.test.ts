// Run with: node --test --experimental-strip-types src/lib/learn/quranMarking.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STANDARD, MIN_PAGES, adjustScore, defaultLevelForYear, markFromMistakes, mistakePoints, portionPages, practiceFocus, readMistakes, readStandard, validLimits, type Mistake } from "./quranMarking.ts";

const m = (kind: Mistake["kind"], n: number, ayah: number | null = null): Mistake[] => Array.from({ length: n }, () => ({ kind, ayah }));

test("no mistakes is 10; could not recite is 0", () => {
  assert.equal(markFromMistakes({ mistakes: [], level: "junior", pages: 1 }).score, 10);
  assert.equal(markFromMistakes({ mistakes: m("prompt", 1), level: "junior", pages: 1, couldNotRecite: true }).score, 0);
});

test("the level decides how strict the mark is", () => {
  const two = m("prompt", 2);
  const b = markFromMistakes({ mistakes: two, level: "beginner", pages: 1 }).score;
  const j = markFromMistakes({ mistakes: two, level: "junior", pages: 1 }).score;
  const s = markFromMistakes({ mistakes: two, level: "senior", pages: 1 }).score;
  assert.ok(b >= j && j >= s, `${b} >= ${j} >= ${s}`);
  assert.equal(s, 6);
});

test("slips and tajweed count less than prompts, and tajweed is free for beginners by default", () => {
  assert.equal(mistakePoints([...m("prompt", 1), ...m("slip", 2), ...m("tajweed", 4)], "junior"), 1 + 1 + 1);
  assert.equal(mistakePoints(m("tajweed", 4), "beginner"), 0);
});

test("points are per page, so a longer portion gets more allowance", () => {
  const six = m("prompt", 6);
  assert.ok(markFromMistakes({ mistakes: six, level: "junior", pages: 3 }).score > markFromMistakes({ mistakes: six, level: "junior", pages: 1 }).score);
});

test("a few ayat count as half a page", () => {
  assert.equal(portionPages(112, 1, 4), MIN_PAGES);
  assert.ok(portionPages(2, 1, 286) > 40);
  assert.ok(portionPages(67) >= 2 && portionPages(67) <= 3);
});

test("a teacher can move a result one step either way", () => {
  assert.equal(adjustScore(6, 1), 7);
  assert.equal(adjustScore(6, -1), 4);
  assert.equal(adjustScore(10, 1), 10);
  assert.equal(adjustScore(1, -1), 1);
});

test("a bad stored standard falls back to the default", () => {
  assert.deepEqual(readStandard(null), DEFAULT_STANDARD);
  const s = readStandard({ limits: { junior: { strong: 5, good: 1, pass: 2, weak: 3 } }, slip: { senior: 9 } });
  assert.deepEqual(s.limits.junior, DEFAULT_STANDARD.limits.junior);
  assert.equal(s.slip.senior, DEFAULT_STANDARD.slip.senior);
  assert.ok(validLimits({ strong: 0, good: 0, pass: 1, weak: 1 }));
  assert.ok(!validLimits({ strong: 1, good: 0.5, pass: 2, weak: 3 }));
});

test("year groups get a sensible level", () => {
  assert.equal(defaultLevelForYear("Reception"), "beginner");
  assert.equal(defaultLevelForYear("Year 2"), "beginner");
  assert.equal(defaultLevelForYear("Year 5"), "junior");
  assert.equal(defaultLevelForYear("Year 9"), "senior");
});

test("practice focus finds the ayat marked most often", () => {
  const f = practiceFocus([
    { surah_from: 67, mistakes: [{ kind: "prompt", ayah: 3 }, { kind: "slip", ayah: 3 }, { kind: "tajweed", ayah: 5 }] },
    { surah_from: 67, mistakes: [{ kind: "prompt", ayah: 3 }] },
    { surah_from: 67, mistakes: [] },
  ]);
  assert.equal(f.heard, 2);
  assert.deepEqual(f.kinds, { prompt: 2, slip: 1, tajweed: 1 });
  assert.deepEqual(f.ayat[0], { surah: 67, ayah: 3, marks: 3, sessions: 2 });
  assert.deepEqual(readMistakes([{ kind: "nope" }, { kind: "slip", ayah: "x" }]), [{ kind: "slip", ayah: null }]);
});
