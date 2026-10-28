// Calendar helpers for the absence parser. Dates are plain "YYYY-MM-DD" keys
// in the school's zone (Europe/London), so arithmetic is done on UTC
// midnights and is never affected by the server's zone or by clock changes.

const DAY_MS = 86_400_000;
const UK = "Europe/London";

export function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Builds a key from parts, or null if the date doesn't exist (e.g. 31/02). */
export function makeKey(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return utcToKey(t.getTime());
}

export function isValidKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  return makeKey(y, m, d) === key;
}

export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * DAY_MS);
}

/** b minus a, in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(key: string): number {
  return new Date(keyToUtc(key)).getUTCDay();
}

/** Lessons run Monday to Friday. */
export function isSchoolDay(key: string): boolean {
  const w = weekdayOf(key);
  return w >= 1 && w <= 5;
}

export function nextSchoolDay(key: string): string {
  let k = addDays(key, 1);
  while (!isSchoolDay(k)) k = addDays(k, 1);
  return k;
}

export function prevSchoolDay(key: string): string {
  let k = addDays(key, -1);
  while (!isSchoolDay(k)) k = addDays(k, -1);
  return k;
}

/** The school day `key` (or the next one, if it falls on a weekend) plus n-1 further school days. */
export function schoolDaysFrom(key: string, n: number): { from: string; to: string } {
  const from = isSchoolDay(key) ? key : nextSchoolDay(key);
  let to = from;
  for (let i = 1; i < n; i++) to = nextSchoolDay(to);
  return { from, to };
}

/** Monday of the (Monday to Sunday) week containing key. */
export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export function fridayOf(key: string): string {
  return addDays(mondayOf(key), 4);
}

/** The school's "now": UK date, hour and minute. */
export function ukNow(now: Date): { today: string; hour: number; minute: number } {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)) {
    out[p.type] = p.value;
  }
  return { today: `${out.year}-${out.month}-${out.day}`, hour: Number(out.hour), minute: Number(out.minute) };
}

/** "Thu 29 Oct 2026" */
export function formatKey(key: string): string {
  return new Date(keyToUtc(key) + 12 * 3_600_000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Thu 29 Oct 2026" or "Mon 2 Nov to Wed 4 Nov 2026". */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatKey(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const a = new Date(keyToUtc(from) + 12 * 3_600_000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
  return `${a} to ${formatKey(to)}`;
}
