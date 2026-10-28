// Wording for an admissions-call time in emails: the family's own time zone
// first, with UK time alongside when the two differ, e.g.
//   "Monday 2 November 2026 at 14:00 Dubai time (10:00 UK time)"
// With no (or an invalid) family zone, or a zone that shows the same wall-clock
// time as the UK on that date, it is "Monday 2 November 2026 at 10:00 UK time".

const UK = "Europe/London";

/** True when `tz` is a time zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Dubai" from "Asia/Dubai", "Kuala Lumpur" from "Asia/Kuala_Lumpur". */
export function zoneCity(tz: string): string {
  const last = tz.split("/").pop() || tz;
  return last.replace(/_/g, " ");
}

const dayText = (d: Date, tz: string) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
const timeText = (d: Date, tz: string) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });

export function bookingWhenText(iso: string, familyTz?: string | null): string {
  const d = new Date(iso);
  const ukDay = dayText(d, UK);
  const ukTime = timeText(d, UK);
  if (!familyTz || !isValidTimeZone(familyTz) || familyTz === UK) return `${ukDay} at ${ukTime} UK time`;
  const day = dayText(d, familyTz);
  const time = timeText(d, familyTz);
  if (day === ukDay && time === ukTime) return `${ukDay} at ${ukTime} UK time`;
  const ukPart = day === ukDay ? `${ukTime} UK time` : `${ukDay} at ${ukTime} UK time`;
  return `${day} at ${time} ${zoneCity(familyTz)} time (${ukPart})`;
}

/** Staff copy: UK time first, the family's local time in brackets when different. */
export function bookingWhenTextForStaff(iso: string, familyTz?: string | null): string {
  const d = new Date(iso);
  const uk = `${dayText(d, UK)} at ${timeText(d, UK)} UK time`;
  if (!familyTz || !isValidTimeZone(familyTz) || familyTz === UK) return uk;
  const day = dayText(d, familyTz);
  const time = timeText(d, familyTz);
  if (day === dayText(d, UK) && time === timeText(d, UK)) return uk;
  return `${uk} (family's time: ${day === dayText(d, UK) ? "" : `${day} at `}${time}, ${familyTz})`;
}

/** Minimal HTML escaping for values typed by families. */
export const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
