// The school runs on UK time (Europe/London), whatever zone the browser is
// in: staff and the owner may be abroad. These helpers give "today", "now"
// and day arithmetic as the school sees them, as plain YYYY-MM-DD / HH:MM
// strings that compare directly with lesson_instances.date and
// timetable_slots.start_time.

const UK = "Europe/London";

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** Today's date in the UK, YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The time now in the UK, HH:MM (24 hour). */
export function ukNowHm(now: Date = new Date()): string {
  const p = parts(now);
  return `${p.hour}:${p.minute}`;
}

/** Shift a YYYY-MM-DD key by whole days (calendar arithmetic, DST safe). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The UK date `n` days before today. */
export function ukDaysAgo(n: number): string {
  return shiftDateKey(ukToday(), -n);
}

/** "Mon 4 Jan 2027" style label for a YYYY-MM-DD key, independent of the browser zone. */
export function formatDateKey(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** HH:MM of an ISO timestamp in UK time. */
export function ukTimeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UK });
}

/** Medium date + short time of an ISO timestamp in UK time. */
export function ukDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: UK });
}

/** Minutes the UK is ahead of UTC at a moment (0 in winter, 60 in summer). */
function ukOffsetMinutes(at: Date): number {
  const p = parts(at);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The instant a UK wall-clock date and time (YYYY-MM-DD, HH:MM) happens. */
export function ukWallToDate(key: string, hm = "00:00"): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  const off = ukOffsetMinutes(new Date(guess));
  let t = guess - off * 60000;
  const off2 = ukOffsetMinutes(new Date(t));
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}

/** Value for an <input type="datetime-local"> showing an instant in UK time. */
export function ukDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const p = parts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Reads a datetime-local value as UK time. */
export function fromUkDateTimeInput(v: string): Date | null {
  const [d, t] = v.split("T");
  if (!d || !t) return null;
  return ukWallToDate(d, t.slice(0, 5));
}

/** Minutes after UK midnight of an instant. */
export function ukMinutesOfDay(iso: string): number {
  const p = parts(new Date(iso));
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * A UK lesson time shown in the viewer's own zone, or "" when the viewer is
 * on UK time already: "09:00" -> "11:00 your time" for a family in Cairo.
 */
export function localTimeNote(key: string, hm: string): string {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!browserZone || browserZone === UK) return "";
  const at = ukWallToDate(key, hm);
  const local = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (local === hm) return "";
  const localDay = at.toLocaleDateString("en-CA"); // YYYY-MM-DD in the browser zone
  const shift = localDay > key ? " (next day)" : localDay < key ? " (previous day)" : "";
  return `${local} your time${shift}`;
}
