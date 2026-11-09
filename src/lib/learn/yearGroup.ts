// Year group from date of birth, using England's rule.
//
// The school year runs from 1 September to 31 August. A pupil's year group is
// set by the age they turn during that year: Reception children turn 5,
// Year 1 children turn 6, ... Year 11 children turn 16. So a child born on
// 31 August is the youngest in their year, and one born on 1 September is the
// oldest in the year below.
//
// Pure functions with no imports, so they run in the browser and in
// `node --test` (see yearGroup.test.ts).

/** Year 0 = Reception, -1 = Nursery; 1 to 13 as usual. */
export type YearNumber = number;

function parseDate(dob: string | Date): { y: number; m: number; d: number } | null {
  if (dob instanceof Date) {
    if (Number.isNaN(dob.getTime())) return null;
    return { y: dob.getFullYear(), m: dob.getMonth() + 1, d: dob.getDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** The calendar year in which the school year containing `on` began (2026 for any day from 1 Sept 2026 to 31 Aug 2027). */
export function academicYearStart(on: Date = new Date()): number {
  return on.getMonth() >= 8 ? on.getFullYear() : on.getFullYear() - 1;
}

/** "2026 to 2027" for the school year starting in 2026. */
export function academicYearLabel(start: number): string {
  return `${start} to ${start + 1}`;
}

/**
 * The year group a child born on `dob` belongs in during the school year that
 * starts in September of `startYear` (Reception = 0). Null for an invalid date.
 */
export function yearNumberForDob(dob: string | Date, startYear: number = academicYearStart()): YearNumber | null {
  const p = parseDate(dob);
  if (!p) return null;
  // The age they turn between 1 Sept startYear and 31 Aug startYear+1.
  const ageTurned = p.m >= 9 ? startYear - p.y : startYear + 1 - p.y;
  return ageTurned - 5;
}

/** "Reception", "Nursery" or "Year 7". */
export function yearLabel(n: YearNumber): string {
  if (n === 0) return "Reception";
  if (n === -1) return "Nursery";
  return `Year ${n}`;
}

/** The year number a year group's name stands for ("Year 7" or "Y7" = 7, "Reception" = 0), or null if it doesn't say. */
export function yearNumberFromName(name: string | null | undefined): YearNumber | null {
  if (!name) return null;
  const s = name.toLowerCase();
  if (/\breception\b|\brec\b|\bfs2\b/.test(s)) return 0;
  if (/\bnursery\b|\bfs1\b/.test(s)) return -1;
  const m = /\b(?:year|yr|y)\s*(\d{1,2})\b/.exec(s);
  return m ? Number(m[1]) : null;
}

/** The year group (from the school's own list) that matches a year number, if there is one. */
export function findYearGroup<G extends { id: string; name: string }>(groups: G[], n: YearNumber | null): G | null {
  if (n === null) return null;
  return groups.find((g) => yearNumberFromName(g.name) === n) || null;
}

/**
 * How a chosen year group compares with the one the date of birth suggests:
 * positive = placed above their age (for example GCSE work at 12), negative =
 * below, 0 = as expected, null = can't tell.
 */
export function yearsAboveAge(chosen: YearNumber | null, suggested: YearNumber | null): number | null {
  if (chosen === null || suggested === null) return null;
  return chosen - suggested;
}
