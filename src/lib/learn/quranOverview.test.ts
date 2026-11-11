// Run with: node --test --experimental-strip-types src/lib/learn/quranOverview.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { heardLabel, memorised, pupilOverview, recitationsOf, surahAverages, type OverviewMark } from "./quranOverview.ts";

let n = 0;
const row = (date: string, surah: number, from: number | null, to: number | null, score: number | null, kind = "memorisation"): OverviewMark => ({
  id: String(++n), child_id: "c", surah_from: surah, ayah_from: from, ayah_to: to, score, session_date: date, recitation_kind: kind, class_id: "k",
});

test("a recitation saved across two surahs counts once", () => {
  const rows = [row("2027-01-12", 112, null, null, 8), row("2027-01-12", 113, null, null, 8), row("2027-01-11", 114, null, null, 6)];
  const recs = recitationsOf(rows);
  assert.equal(recs.length, 2);
  assert.deepEqual(recs[0].parts.map((p) => p.surah), [112, 113]);
  assert.equal(pupilOverview(rows, "2027-01-13").recentAverage, 7);
});

test("memorised counts passed memorisation only, as pages and whole surahs", () => {
  const rows = [row("2027-01-12", 112, null, null, 8), row("2027-01-12", 1, 1, 7, 4), row("2027-01-13", 113, null, null, 9, "revision"), row("2027-01-14", 2, 1, 5, 7)];
  const c = memorised(rows);
  assert.deepEqual(c.surahs, [112]);
  assert.deepEqual(c.partSurahs, [2]);
  assert.ok(c.pages >= 2 && c.pages <= 3, `pages ${c.pages}`);
});

test("not heard this week, labels and last of each kind", () => {
  const rows = [row("2027-01-02", 78, 1, 10, 7), row("2027-01-04", 114, null, null, 9, "revision")];
  const o = pupilOverview(rows, "2027-01-12");
  assert.equal(o.notHeardThisWeek, true);
  assert.equal(o.lastMemorisation?.parts[0].surah, 78);
  assert.equal(o.lastRevision?.parts[0].surah, 114);
  assert.equal(heardLabel("2027-01-12", "2027-01-12"), "Today");
  assert.equal(heardLabel("2027-01-11", "2027-01-12"), "Yesterday");
  assert.equal(heardLabel("2027-01-09", "2027-01-12"), "3 days ago");
  assert.equal(pupilOverview([], "2027-01-12").notHeardThisWeek, true);
});

test("surah averages count each recitation once per surah", () => {
  const rows = [row("2027-01-12", 112, null, null, 8), row("2027-01-12", 112, null, null, 8), row("2027-01-13", 112, null, null, 6)];
  assert.deepEqual(surahAverages(rows), [{ surah: 112, avg: 7, times: 2 }]);
});
