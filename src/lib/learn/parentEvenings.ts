// Parent evenings (supabase/migrations/0072_progress_tracking.sql).
// Admin creates an evening (window + slot length + teachers); parents book
// through SECURITY DEFINER RPCs; teachers see their schedule.

export type EveningStatus = "draft" | "open" | "closed";

export type ParentEvening = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  slot_minutes: number;
  location: string | null;
  join_url: string | null;
  notes: string | null;
  status: EveningStatus;
};

export const EVENING_COLUMNS = "id, title, starts_at, ends_at, slot_minutes, location, join_url, notes, status";

export const SLOT_LENGTHS = [5, 10, 15, 20, 30] as const;

export const EVENING_STATUS_META: Record<EveningStatus, { label: string; className: string }> = {
  draft: { label: "Draft (hidden from parents)", className: "bg-cream text-ink/70" },
  open: { label: "Open for booking", className: "bg-green-100 text-green-700" },
  closed: { label: "Closed", className: "bg-red-100 text-red-700" },
};

/** Every slot start in the evening's window, on its slot-length grid. */
export function generateSlots(ev: Pick<ParentEvening, "starts_at" | "ends_at" | "slot_minutes">): Date[] {
  const out: Date[] = [];
  const start = new Date(ev.starts_at).getTime();
  const end = new Date(ev.ends_at).getTime();
  const step = ev.slot_minutes * 60_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || step <= 0) return out;
  for (let t = start; t + step <= end; t += step) out.push(new Date(t));
  return out;
}

/** Slots are compared by epoch milliseconds, so Postgres and JS timestamp spellings both match. */
export function slotKey(d: Date | string): number {
  return new Date(d).getTime();
}

const TZ = "Europe/London";

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** The evening's real window: "Tuesday 7 October, 17:00–19:30", or both dates when it spans days. */
export function formatWindow(startIso: string, endIso: string): string {
  const sameDay = formatDay(startIso) === formatDay(endIso);
  return sameDay
    ? `${formatDay(startIso)}, ${formatTime(startIso)}–${formatTime(endIso)}`
    : `${formatDay(startIso)} ${formatTime(startIso)} to ${formatDay(endIso)} ${formatTime(endIso)}`;
}

/** Why a start/end pair isn't a valid single-evening window, or null when it is. Inputs are datetime-local values. */
export function windowProblem(startsAt: string, endsAt: string, slotMinutes: number): string | null {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!startsAt || !endsAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Choose both a start and an end time.";
  if (end.getTime() <= start.getTime()) return "The end time must be after the start time.";
  if (end.getTime() - start.getTime() < slotMinutes * 60_000) return "The evening must be at least one meeting long.";
  if (start.toDateString() !== end.toDateString()) return "A parent evening must start and end on the same day.";
  return null;
}

export function formatSlot(startIso: string, endIso?: string): string {
  const day = new Date(startIso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return `${day}, ${formatTime(startIso)}${endIso ? `–${formatTime(endIso)}` : ""}`;
}

const BOOKING_ERRORS: Record<string, string> = {
  slot_taken: "Sorry, someone else just took that time. Please choose another.",
  parent_clash: "You already have a meeting at that time with another teacher.",
  already_booked_with_teacher: "You already have a slot with this teacher for this child. Change or cancel it first.",
  evening_not_open: "Booking for this evening isn't open.",
  teacher_not_in_evening: "That teacher isn't taking part in this evening.",
  teacher_does_not_teach_child: "That teacher doesn't teach this child.",
  invalid_slot: "That isn't a valid time for this evening.",
  slot_in_past: "That time has already passed.",
  booking_not_found: "That booking could not be found (it may already be cancelled).",
  forbidden: "You can't do that.",
  not_authenticated: "Please sign in again.",
  invalid_url: "Meeting links must start with https://",
  evening_has_bookings: "Parents have already booked, so the time window and slot length can no longer change.",
};

/** Turns an RPC error (whose message is a short code) into a sentence. */
export function bookingErrorMessage(message: string | undefined | null): string {
  const text = message || "";
  for (const [code, sentence] of Object.entries(BOOKING_ERRORS)) {
    if (text.includes(code)) return sentence;
  }
  return text || "Something went wrong. Please try again.";
}

/** "YYYY-MM-DDTHH:mm" in the browser's own time zone, for datetime-local inputs. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
