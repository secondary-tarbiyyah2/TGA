// Registers as a list of sessions, SIMS-style (owner feedback 11 Nov 2026, item 9): every
// lesson with its date, class, period and where its register stands, filtered, and one register
// opened on its own page. Pure functions only, so they can be unit-tested (registers.test.ts).

import { ukWallToDate } from "./ukTime.ts";

/** Where a lesson's register stands. */
export type RegisterState = "upcoming" | "not_taken" | "partial" | "late" | "taken";

export const REGISTER_STATE_LABEL: Record<RegisterState, string> = {
  upcoming: "Not due yet",
  not_taken: "Not taken",
  partial: "Partly taken",
  late: "Taken late",
  taken: "Taken",
};

/** How long after the lesson starts the first mark can be saved and still count as on time. */
export const REGISTER_GRACE_MINUTES = 15;

export type RegisterFacts = {
  /** The lesson's date, "YYYY-MM-DD" (UK). */
  date: string;
  /** Start time, "HH:MM" (UK). */
  start: string;
  /** Pupils with a mark. */
  marked: number;
  /** Pupils enrolled in the class. */
  total: number;
  /** When the first mark was saved (ISO), if any. */
  firstMarkedAt: string | null;
};

/**
 * The state of one register at `now`. A lesson that has not started is "Not due yet" even if
 * someone has marked it early; one with no marks once it has started is "Not taken"; every
 * enrolled pupil marked is "Taken", or "Taken late" when the first mark came more than
 * REGISTER_GRACE_MINUTES after the start.
 */
export function registerState(f: RegisterFacts, now: Date = new Date()): RegisterState {
  const startMs = ukWallToDate(f.date, f.start).getTime();
  if (f.marked === 0) return now.getTime() < startMs ? "upcoming" : "not_taken";
  if (f.total > 0 && f.marked < f.total) return now.getTime() < startMs ? "upcoming" : "partial";
  if (f.firstMarkedAt) {
    const first = Date.parse(f.firstMarkedAt);
    if (Number.isFinite(first) && first > startMs + REGISTER_GRACE_MINUTES * 60_000) return "late";
  }
  return "taken";
}

/** The states that still need someone to act. */
export const needsAction = (s: RegisterState): boolean => s === "not_taken" || s === "partial";

export type RegisterRange = "today" | "this_week" | "last_week" | "last_30";

export const REGISTER_RANGES: { value: RegisterRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_30", label: "Last 30 days" },
];

const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The first and last date of a range, from today's UK date. Weeks start on Monday. */
export function rangeDates(range: RegisterRange, today: string): { from: string; to: string } {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sunday
  const monday = addDays(today, -((weekday + 6) % 7));
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "this_week":
      return { from: monday, to: addDays(monday, 6) };
    case "last_week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "last_30":
      return { from: addDays(today, -29), to: today };
  }
}

/** A period's name for a lesson starting at `start`, from the school day's lesson periods. */
export function periodName(start: string, periods: { name: string; kind: string; start_time: string }[]): string | null {
  const hit = periods.find((p) => p.kind === "lesson" && p.start_time.slice(0, 5) === start.slice(0, 5));
  return hit ? hit.name : null;
}
