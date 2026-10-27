// Minimal iCalendar (RFC 5545) generator, just enough for a single-event
// invite/update/cancellation, which is all a booking confirmation needs.

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(opts: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  organizerEmail: string;
  attendeeEmail: string;
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
}): string {
  const method = opts.method ?? "REQUEST";
  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tarbiyyah Global Academy//Booking//EN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `SEQUENCE:${opts.sequence ?? 0}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(opts.startsAt)}`,
    `DTEND:${toIcsDate(opts.endsAt)}`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
    `DESCRIPTION:${escapeIcsText(opts.description)}`,
    `LOCATION:${escapeIcsText(opts.location)}`,
    `ORGANIZER:mailto:${opts.organizerEmail}`,
    `ATTENDEE:mailto:${opts.attendeeEmail}`,
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}
