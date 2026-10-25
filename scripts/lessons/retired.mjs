// Lessons retired from the library: content/retired-lessons.json, entries
// { subject_slug, year, lesson_no } (plus an optional title and reason for people reading it).
// Retiring a lesson means: remove it from content/lessons/<subject>/<year>.json AND list it here.
// The list is what lets upload-decks delete the portal row and files that were uploaded before,
// and what stops every other script (decks, revision packs, booklets, coverage, staging merge)
// from bringing the lesson back. Lesson numbers in this list are never reused.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const RETIRED_FILE = path.join(ROOT, "content/retired-lessons.json");

export function retiredList() {
  if (!fs.existsSync(RETIRED_FILE)) return [];
  const { retired = [] } = JSON.parse(fs.readFileSync(RETIRED_FILE, "utf8"));
  return retired;
}

const key = (slug, year, n) => `${slug}/${String(year).toLowerCase()}/${Number(n)}`;

/** Set of "subject/year/n" keys. */
export function retiredKeys() {
  return new Set(retiredList().map((r) => key(r.subject_slug, r.year, r.lesson_no)));
}

/** isRetired(slug, year, n) for quick checks inside loops. */
export function retiredChecker() {
  const keys = retiredKeys();
  return (slug, year, n) => keys.has(key(slug, year, n));
}

/** Highest retired lesson number for a subject and year (0 if none), so new lessons never reuse one. */
export function maxRetiredNo(slug, year) {
  return Math.max(0, ...retiredList().filter((r) => r.subject_slug === slug && String(r.year).toLowerCase() === String(year).toLowerCase()).map((r) => Number(r.lesson_no)));
}

/** Titles of retired lessons for a subject and year (lower case), so a staged copy is not merged back in. */
export function retiredTitles(slug, year) {
  return new Set(
    retiredList()
      .filter((r) => r.subject_slug === slug && String(r.year).toLowerCase() === String(year).toLowerCase() && r.title)
      .map((r) => String(r.title).trim().toLowerCase()),
  );
}
