/**
 * Year group from date of birth, using England's school year (1 September to
 * 31 August). A child born between 1 September and 31 August belongs to one
 * cohort: they start Reception in the September after they turn four, and
 * Year 1 the year after.
 *
 * Owner, Nov 2026 (Tafweed T27): "year group should be derived from DOB", with
 * a way to show a pupil who is working ahead of their age (e.g. GCSE at 12).
 */

/** The calendar year the school year containing `on` started (Sept–Aug). */
export function academicYearStart(on: Date = new Date()): number {
  return on.getMonth() >= 8 ? on.getFullYear() : on.getFullYear() - 1;
}

/** Parses "YYYY-MM-DD" as a local date (no timezone shift). */
function parseDob(dob: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The National Curriculum year for a date of birth: 0 = Reception, 1 = Year 1
 * … 13 = Year 13. Null when the date is missing, invalid, or outside school age.
 */
export function ncYearFromDob(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob) return null;
  const d = parseDob(dob);
  if (!d) return null;
  const cohort = academicYearStart(d); // the school year they were born in
  const year = academicYearStart(on) - cohort - 5;
  return year >= 0 && year <= 13 ? year : null;
}

/** "Reception" or "Year 7". */
export function ncYearLabel(year: number): string {
  return year === 0 ? "Reception" : `Year ${year}`;
}

/** The National Curriculum year a year-group name stands for ("Year 7", "Y7", "Reception"), or null. */
export function ncYearOfName(name: string): number | null {
  if (/reception|^r$/i.test(name.trim())) return 0;
  const m = /(?:year|yr|y)\s*(\d{1,2})\b/i.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 13 ? n : null;
}

/** The school's year group matching a date of birth, if it has one. */
export function suggestYearGroup<T extends { id: string; name: string }>(dob: string | null | undefined, yearGroups: T[], on: Date = new Date()): T | null {
  const y = ncYearFromDob(dob, on);
  if (y === null) return null;
  return yearGroups.find((g) => ncYearOfName(g.name) === y) ?? null;
}

/**
 * How far a chosen year group is ahead of (positive) or behind (negative) the
 * one the date of birth gives. Null when either can't be worked out.
 */
export function yearsAheadOfAge(dob: string | null | undefined, yearGroupName: string | null | undefined, on: Date = new Date()): number | null {
  const age = ncYearFromDob(dob, on);
  const chosen = yearGroupName ? ncYearOfName(yearGroupName) : null;
  if (age === null || chosen === null) return null;
  return chosen - age;
}
