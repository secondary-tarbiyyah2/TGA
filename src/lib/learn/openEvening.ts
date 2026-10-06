/** Shared helpers for the open-evening admin page (sessions, bookings, CSV). */

export type OpenEveningSession = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  join_url: string | null;
  published: boolean;
  cancelled_at: string | null;
};

export type OpenEveningBooking = {
  id: string;
  session_id: string;
  parent_name: string;
  email: string;
  phone: string | null;
  attendees: number;
  year_groups: string;
  questions: string | null;
  status: "confirmed" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
};

const UK = "Europe/London";

/** Minutes the UK is ahead of UTC at the given instant (60 in summer, 0 in winter). */
function ukOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** "2026-11-12T19:30" typed as UK wall-clock time -> the exact instant, as an ISO string. */
export function ukLocalToIso(local: string): string {
  const [datePart, timePart] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart || "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ms = wall;
  for (let i = 0; i < 2; i++) ms = wall - ukOffsetMinutes(ms) * 60000;
  return new Date(ms).toISOString();
}

/** An instant -> "2026-11-12T19:30" in UK wall-clock time, for a datetime-local input. */
export function isoToUkLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const ukDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: UK });

/** One CSV cell. Quotes are doubled, and a leading = + - @ is defused so a spreadsheet never runs it as a formula. */
function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function bookingsCsv(rows: { session: OpenEveningSession; booking: OpenEveningBooking }[]): string {
  const header = ["Session", "Date and time (UK)", "Status", "Name", "Email", "Phone", "Attendees", "Year groups", "Questions", "Booked at"];
  const lines = rows.map(({ session, booking }) =>
    [
      session.title,
      ukDateTime(session.starts_at),
      booking.status === "confirmed" ? "Confirmed" : "Cancelled",
      booking.parent_name,
      booking.email,
      booking.phone,
      booking.attendees,
      booking.year_groups,
      booking.questions,
      new Date(booking.created_at).toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
