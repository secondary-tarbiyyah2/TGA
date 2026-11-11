// The register codes the school uses (owner, 11 Nov 2026, "Tafweed 3", T43), in one place.
// Registers, the family "Report an absence" page, absences follow-up and every attendance
// figure read their names, meanings and counting rules from here.
//
// The database values (attendance_records.status) are unchanged: "excused" is an authorised
// absence and "absent" an unauthorised one. "not_engaged" is an older mark that is no longer
// offered; marks already saved with it still show and count as present.

export type AttendanceStatus = "present" | "late" | "excused" | "absent" | "technical" | "not_engaged";

export type AttendanceCode = {
  value: Exclude<AttendanceStatus, "not_engaged">;
  /** One or two letters for tight tables. */
  short: string;
  label: string;
  /** What the code means, shown as help text wherever the code is chosen. */
  help: string;
};

/** The five codes, in the order they are offered. */
export const ATTENDANCE_CODES: readonly AttendanceCode[] = [
  { value: "present", short: "P", label: "Present", help: "Attended and engaged." },
  { value: "late", short: "L", label: "Late", help: "Joined after registration." },
  {
    value: "excused",
    short: "AA",
    label: "Authorised absence",
    help: "Illness, a medical appointment that could not be arranged outside lessons, religious observance (for example Eid), or exceptional circumstances approved by the Headteacher.",
  },
  {
    value: "absent",
    short: "UA",
    label: "Unauthorised absence",
    help: "No reason given, or a reason that was not accepted, including holidays in term time.",
  },
  {
    value: "technical",
    short: "T",
    label: "Technical absence",
    help: "Unable to connect despite reasonable efforts. Recorded separately and reviewed for a pattern.",
  },
];

const LEGACY_LABEL: Record<"not_engaged", string> = { not_engaged: "Present (older mark: not engaged)" };

export function attendanceLabel(status: string | null | undefined): string {
  if (!status) return "";
  const c = ATTENDANCE_CODES.find((x) => x.value === status);
  if (c) return c.label;
  return (LEGACY_LABEL as Record<string, string>)[status] || status;
}

export function attendanceShort(status: string | null | undefined): string {
  if (status === "not_engaged") return "P";
  return ATTENDANCE_CODES.find((x) => x.value === status)?.short || "";
}

export function attendanceHelp(status: string | null | undefined): string {
  return ATTENDANCE_CODES.find((x) => x.value === status)?.help || "";
}

/** Present and late (and the older "not engaged" mark) count as attending. */
export function countsAsAttended(status: string | null | undefined): boolean {
  return status === "present" || status === "late" || status === "not_engaged";
}

/** Authorised and unauthorised absences: the pupil missed the lesson. */
export function isAbsence(status: string | null | undefined): boolean {
  return status === "absent" || status === "excused";
}

export type AttendanceTally = {
  /** Every lesson marked. */
  lessons: number;
  /** Present, late and older "not engaged" marks. */
  attended: number;
  late: number;
  authorised: number;
  unauthorised: number;
  technical: number;
  /**
   * Attendance rate: attended out of attended plus unauthorised absences, as a whole percentage.
   * Authorised and technical absences are not held against the pupil (Attendance Policy); they
   * are shown beside the rate instead. Null when nothing counts yet.
   */
  rate: number | null;
};

export function tallyAttendance(rows: { status: string }[]): AttendanceTally {
  const t: AttendanceTally = { lessons: rows.length, attended: 0, late: 0, authorised: 0, unauthorised: 0, technical: 0, rate: null };
  for (const r of rows) {
    if (countsAsAttended(r.status)) {
      t.attended++;
      if (r.status === "late") t.late++;
    } else if (r.status === "excused") t.authorised++;
    else if (r.status === "absent") t.unauthorised++;
    else if (r.status === "technical") t.technical++;
  }
  const base = t.attended + t.unauthorised;
  t.rate = base > 0 ? Math.round((t.attended / base) * 100) : null;
  return t;
}

/**
 * Technical absences are reviewed for a pattern: two or more in any 30 days is flagged
 * ("Repeated technical absences") so the office can check the family's connection and device.
 */
export const TECHNICAL_REPEAT = { count: 2, days: 30 } as const;

/** True when the dates (YYYY-MM-DD, one per technical absence) hold a repeat inside the window. */
export function technicalRepeats(dates: string[], rule: { count: number; days: number } = TECHNICAL_REPEAT): boolean {
  const days = [...new Set(dates)].sort();
  if (days.length < rule.count) return false;
  const ms = (d: string) => Date.parse(`${d}T12:00:00Z`);
  for (let i = 0; i + rule.count - 1 < days.length; i++) {
    const span = (ms(days[i + rule.count - 1]) - ms(days[i])) / 86_400_000;
    if (span < rule.days) return true;
  }
  return false;
}
