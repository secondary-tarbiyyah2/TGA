// Run with: node --test --experimental-strip-types src/lib/learn/mushaf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PAGE_COUNT, ayatOfPages, ayatOfPortion, ayatOnPage, chunkFile, pageOf, pageRange, pagesForAyat, wordsOf } from "./mushaf.ts";
import { surahAyat } from "./surahs.ts";
import { portionPages, readMistakes, mistakePoints, practiceFocus } from "./quranMarking.ts";

test("well-known pages", () => {
  assert.equal(pageOf(1, 1), 1);
  assert.equal(pageOf(2, 1), 2);
  assert.equal(pageOf(3, 1), 50);
  assert.equal(pageOf(18, 1), 293);
  assert.equal(pageOf(36, 1), 440);
  assert.equal(pageOf(67, 1), 562);
  assert.equal(pageOf(78, 1), 582);
  assert.equal(pageOf(114, 6), 604);
});

test("every ayah is on exactly one page and pages add up to 6236", () => {
  let n = 0;
  for (let p = 1; p <= PAGE_COUNT; p++) n += ayatOnPage(p);
  assert.equal(n, 6236);
  for (let s = 1; s <= 114; s++) for (let a = 1; a <= surahAyat(s); a++) {
    const p = pageOf(s, a);
    const { from, to } = pageRange(p);
    assert.ok(s * 1000 + a >= from[0] * 1000 + from[1] && s * 1000 + a <= to[0] * 1000 + to[1], `${s}:${a} on ${p}`);
  }
});

test("pages for a portion", () => {
  assert.equal(pagesForAyat(ayatOfPages(50, 50)), 1);
  assert.equal(pagesForAyat(ayatOfPages(582, 583)), 2);
  assert.ok(Math.abs(pagesForAyat(ayatOfPortion(67)) - 2) < 0.6, "al-Mulk is about two pages");
  assert.equal(portionPages(1, 1, 1), 0.5, "never under half a page");
  assert.deepEqual(ayatOfPages(1, 1).length, 7);
});

test("files hold exactly the pages they are named for", () => {
  const dir = new URL("../../../public/mushaf/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const p of [1, 20, 21, 50, 600, 601, 604]) assert.ok(files.includes(chunkFile(p).slice("/mushaf/".length)), `file for page ${p}`);
  const chunk = JSON.parse(readFileSync(new URL(chunkFile(50).slice("/mushaf/".length), dir), "utf8")).pages;
  assert.deepEqual(chunk["50"][0].slice(0, 2), [3, 1]);
  assert.ok(chunk["50"].every((r: [number, number, string]) => wordsOf(r[2]).length > 0));
});

test("marks on the page are read back and skipped ayat cost nothing", () => {
  const ms = readMistakes([
    { kind: "prompt", surah: 78, ayah: 2, word: 1 },
    { kind: "tajweed", surah: 78, ayah: 2, word: 1, gap: true },
    { kind: "skipped", surah: 78, ayah: 40 },
    { kind: "tajweed", gap: true, ayah: 3 },
    { kind: "nonsense", ayah: 1 },
  ]);
  assert.equal(ms.length, 4);
  assert.equal(ms[1].gap, true);
  assert.equal(ms[3].gap, undefined, "a join needs its word");
  assert.equal(mistakePoints(ms, "senior"), 1 + 0.5 + 0 + 0.5);
  const f = practiceFocus([{ surah_from: 78, mistakes: ms }]);
  assert.equal(f.kinds.prompt, 1);
  assert.equal(f.ayat[0].ayah, 2);
});
