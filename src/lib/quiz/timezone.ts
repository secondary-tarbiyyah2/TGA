/**
 * DST-aware timezone helpers, lifted from the original
 * src/components/eligibility/EligibilityQuiz.tsx (now superseded by
 * YourChildsWeekQuiz) rather than reinvented — this logic was already
 * correct (uses Intl's own offset resolution, so DST is handled by the
 * platform, not a hand-maintained table) and both the quiz and the admin
 * "preview as a parent" tool need the exact same behaviour.
 */

export const TIMEZONE_OPTIONS: { group: string; zones: { value: string; label: string }[] }[] = [
  { group: "UK & Europe", zones: [
    { value: "Europe/London", label: "United Kingdom" },
    { value: "Europe/Paris", label: "Western Europe (Paris, Berlin, Madrid)" },
  ]},
  { group: "Africa", zones: [
    { value: "Africa/Lagos", label: "West Africa (Lagos, Accra)" },
    { value: "Africa/Casablanca", label: "North-West Africa (Casablanca)" },
    { value: "Africa/Nairobi", label: "East Africa (Nairobi)" },
    { value: "Africa/Johannesburg", label: "Southern Africa (Johannesburg)" },
  ]},
  { group: "Middle East & South Asia", zones: [
    { value: "Asia/Dubai", label: "UAE (Dubai, Abu Dhabi)" },
    { value: "Asia/Riyadh", label: "Saudi Arabia" },
    { value: "Asia/Karachi", label: "Pakistan" },
    { value: "Asia/Kolkata", label: "India" },
    { value: "Asia/Dhaka", label: "Bangladesh" },
  ]},
  { group: "East & South-East Asia", zones: [
    { value: "Asia/Kuala_Lumpur", label: "Malaysia / Singapore" },
    { value: "Asia/Jakarta", label: "Indonesia (Jakarta)" },
  ]},
  { group: "Americas", zones: [
    { value: "America/New_York", label: "US East Coast / Canada East" },
    { value: "America/Chicago", label: "US Central" },
    { value: "America/Los_Angeles", label: "US West Coast" },
  ]},
  { group: "Oceania", zones: [
    { value: "Australia/Sydney", label: "Australia East" },
  ]},
];

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Europe/London";
  }
}

/** Current UTC offset in hours for a zone (handles DST correctly via Intl, not a hardcoded table). */
export function utcOffsetHours(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
    const match = raw.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) / 60 : 0;
    return hours + (hours < 0 ? -minutes : minutes);
  } catch {
    return 0;
  }
}

export function formatLocalHour(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Converts a slot stored in the base timezone (Europe/London, per the
 * timetabling schema) into the family's local weekday + time, including
 * correctly rolling the weekday over when the offset difference pushes a
 * slot past midnight either way.
 */
export function convertSlotToLocal(
  weekday: number, // 0 = Sunday .. 6 = Saturday, matching timetable_slots.weekday
  startTime: string, // "HH:MM:SS" or "HH:MM"
  endTime: string,
  familyTimezone: string
): { weekday: number; weekdayName: string; startLabel: string; endLabel: string; crossesMidnight: boolean } {
  const ukOffset = utcOffsetHours("Europe/London");
  const localOffset = utcOffsetHours(familyTimezone);
  const diff = localOffset - ukOffset;

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const startTotalMinutes = sh * 60 + sm + diff * 60;
  const endTotalMinutes = eh * 60 + em + diff * 60;

  const dayShift = Math.floor(startTotalMinutes / (24 * 60));
  const localWeekday = ((weekday + dayShift) % 7 + 7) % 7;
  const localStartHour = ((startTotalMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60;
  const localEndHour = ((endTotalMinutes % (24 * 60)) + 24 * 60) % (24 * 60) / 60;

  return {
    weekday: localWeekday,
    weekdayName: WEEKDAY_NAMES[localWeekday],
    startLabel: formatLocalHour(localStartHour),
    endLabel: formatLocalHour(localEndHour),
    crossesMidnight: endTotalMinutes - startTotalMinutes !== (eh * 60 + em) - (sh * 60 + sm),
  };
}

/**
 * The representative UK live-lesson window (9am-3pm UK, this site's actual
 * school day per the Curriculum page) mapped to a family's local time, and
 * whether any part of it falls outside a workable local window (before 7am
 * or after 9pm). Used both for the quiz's own flag and reused by the admin
 * "preview as a parent" tool so the two can never disagree.
 */
export function schoolDayTimeInfo(familyTimezone: string) {
  const ukOffset = utcOffsetHours("Europe/London");
  const localOffset = utcOffsetHours(familyTimezone);
  const diff = localOffset - ukOffset;
  const localStart = 9 + diff;
  const localEnd = 15 + diff;
  const concern = localStart < 7 || localEnd > 21;
  return { diff, localStart, localEnd, concern };
}
