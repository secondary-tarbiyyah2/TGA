// Shared timetable helpers for /learn (Phase A). Matches
// scripts/timetable-solver/generate.py's PERIODS grid exactly, so a slot
// written by the solver renders correctly in every dashboard.
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
];

// The prospectus school day (UK time). Monday-Thursday: form time
// 09:00-09:10, five 50-minute lessons with 10-minute movement breaks, lunch
// and Dhuhr 12:00-13:00, Asr break 13:50-14:00, end of day 14:50-15:00, no
// lessons after 15:00. Friday: form time and Lessons 1-3 only (09:00-12:00),
// then Jumu'ah. Matches scripts/timetable-solver/generate.py's default grid
// and migration 0150. Band "A" = inside the school day; "B" is only used for
// a stored period that starts at or after 15:00 (out of hours).
const MON_FRI = [1, 2, 3, 4, 5];
const MON_THU = [1, 2, 3, 4];
export const PERIODS: { start: string; end: string; band: "A" | "B"; weekdays: number[] }[] = [
  { start: "09:10", end: "10:00", band: "A", weekdays: MON_FRI },
  { start: "10:10", end: "11:00", band: "A", weekdays: MON_FRI },
  { start: "11:10", end: "12:00", band: "A", weekdays: MON_FRI },
  { start: "13:00", end: "13:50", band: "A", weekdays: MON_THU },
  { start: "14:00", end: "14:50", band: "A", weekdays: MON_THU },
];

/** A period starting at or after this is outside the school day (band "B"). */
export const END_OF_SCHOOL_DAY = "15:00";
export const bandFor = (start: string): "A" | "B" => (start < END_OF_SCHOOL_DAY ? "A" : "B");

/**
 * Live lesson length by year group (prospectus): Years 1-2 30 min, Years 3-6
 * 45 min, Years 7-11 50 min. Shorter primary lessons start at the same period
 * start times and simply end earlier. Mirrors lesson_minutes_for() in the
 * solver and the class defaults set by migration 0150.
 */
export function lessonMinutesFor(yearGroupName: string | null | undefined): number {
  const name = (yearGroupName || "").trim().toLowerCase();
  if (name.startsWith("reception")) return 30;
  const m = name.match(/(\d+)/);
  if (!m) return 50;
  const n = Number(m[1]);
  return n <= 2 ? 30 : n <= 6 ? 45 : 50;
}

// ── Admin-editable school day (table public.timetable_periods, migrations
// 0066 and 0150). PERIODS above stays as the fallback used when the table is empty
// or not migrated yet, so nothing ever breaks.
export type PeriodKind = "lesson" | "break" | "lunch" | "prayer" | "enrichment";

export type TimetablePeriod = {
  id: string;
  name: string;
  kind: PeriodKind;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  weekdays: number[];
  band: string | null;
  applies_to: string[];
  activity: string | null;
  sort: number;
  active: boolean;
  /** Enrichment only (migration 0069): the member of staff supervising the block. */
  supervisor_user_id?: string | null;
  /** Display name of the supervisor, filled by attachSupervisorNames() (families cannot read profiles). */
  supervisor_name?: string | null;
};

export const PERIOD_KINDS: { value: PeriodKind; label: string }[] = [
  { value: "lesson", label: "Lesson" },
  { value: "break", label: "Break" },
  { value: "lunch", label: "Lunch" },
  { value: "prayer", label: "Prayer" },
  { value: "enrichment", label: "Enrichment (supervised, no teaching)" },
];

/** Who a period is for. 'gcse' = Years 10-11, 'ks3' = Years 7-9, 'primary' = Year 1-Year 6. */
export const AUDIENCES: { value: string; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "primary", label: "Primary (Y1-Y6)" },
  { value: "ks3", label: "Years 7-9" },
  { value: "gcse", label: "GCSE (Years 10-11)" },
];

/** Suggestions for what a supervised enrichment block can be. */
export const ENRICHMENT_ACTIVITIES: string[] = [
  "Games & play",
  "Outdoor activity",
  "Nasheed",
  "Reading club",
  "Quiet reading",
  "Art & crafts",
  "Board games & chess",
  "Qur'an recitation circle",
  "Show and tell",
  "Stretch & movement",
  "Story time",
];

export const KIND_STYLE: Record<PeriodKind, { label: string; chip: string; cell: string }> = {
  lesson: { label: "Lesson", chip: "bg-gold-500/10 text-ink", cell: "border-gold-500/40 bg-gold-500/10 text-ink" },
  break: { label: "Break", chip: "bg-gray-100 text-gray-700", cell: "border-gray-300 bg-gray-100 text-gray-700" },
  lunch: { label: "Lunch", chip: "bg-amber-100 text-amber-900", cell: "border-amber-300 bg-amber-100 text-amber-900" },
  prayer: { label: "Prayer", chip: "bg-amber-100 text-amber-900", cell: "border-amber-300 bg-amber-100 text-amber-900" },
  enrichment: { label: "Enrichment", chip: "bg-green-100 text-green-900", cell: "border-green-300 bg-green-100 text-green-900" },
};

/** Audience tokens a year group name belongs to, e.g. "Year 10" -> ["all", "gcse", "year 10"]. */
export function audiencesOf(yearGroupName: string | null | undefined): string[] {
  if (!yearGroupName) return [];
  const name = yearGroupName.trim().toLowerCase();
  const out = ["all", name];
  const m = name.match(/(\d+)/);
  if (name.startsWith("reception")) out.push("primary");
  else if (m) {
    const n = Number(m[1]);
    if (n <= 6) out.push("primary");
    else if (n <= 9) out.push("ks3");
    else if (n <= 11) out.push("gcse");
  }
  return out;
}

/** Does a period apply to a viewer? `viewer` = year group names (or tokens); undefined/empty = unknown, so only 'all' rows match. */
export function periodApplies(p: { applies_to: string[] }, viewer?: string[]): boolean {
  if (p.applies_to.includes("all")) return true;
  if (!viewer || viewer.length === 0) return false;
  const tokens = new Set(viewer.flatMap((v) => audiencesOf(v)));
  return p.applies_to.some((a) => tokens.has(a.trim().toLowerCase()));
}

/** The built-in day, used when no periods are stored (same as migration 0150). */
const block = (id: string, name: string, kind: PeriodKind, start_time: string, end_time: string, weekdays: number[], sort: number): TimetablePeriod => ({ id, name, kind, start_time, end_time, weekdays, band: bandFor(start_time), applies_to: ["all"], activity: null, sort, active: true });
export const FALLBACK_PERIODS: TimetablePeriod[] = [
  block("fallback-form", "Form time", "break", "09:00", "09:10", MON_FRI, 5),
  ...PERIODS.map((p, i): TimetablePeriod => ({ id: `fallback-lesson-${i}`, name: `Lesson ${i + 1}`, kind: "lesson", start_time: p.start, end_time: p.end, weekdays: p.weekdays, band: p.band, applies_to: ["all"], activity: null, sort: (i + 1) * 10, active: true })),
  block("fallback-break-1", "Break", "break", "10:00", "10:10", MON_FRI, 15),
  block("fallback-break-2", "Break", "break", "11:00", "11:10", MON_FRI, 25),
  block("fallback-lunch", "Lunch & Dhuhr", "lunch", "12:00", "13:00", MON_THU, 35),
  block("fallback-break-3", "Break (Asr, extended Nov-Feb)", "break", "13:50", "14:00", MON_THU, 45),
  block("fallback-end", "End of day", "break", "14:50", "15:00", MON_THU, 55),
];

type PeriodRow = {
  id: string;
  name: string | null;
  kind: string | null;
  start_time: string;
  end_time: string;
  weekdays: number[] | null;
  band: string | null;
  applies_to: string[] | null;
  activity: string | null;
  sort: number | null;
  active: boolean | null;
  supervisor_user_id?: string | null;
};

export function normalisePeriods(rows: PeriodRow[] | null | undefined): TimetablePeriod[] {
  const kinds = PERIOD_KINDS.map((k) => k.value) as string[];
  return (rows || [])
    .map((r): TimetablePeriod => ({
      id: r.id,
      name: r.name || "Period",
      kind: (r.kind && kinds.includes(r.kind) ? r.kind : "lesson") as PeriodKind,
      start_time: timeLabel(r.start_time),
      end_time: timeLabel(r.end_time),
      weekdays: r.weekdays && r.weekdays.length > 0 ? r.weekdays : [1, 2, 3, 4, 5],
      band: r.band,
      applies_to: r.applies_to && r.applies_to.length > 0 ? r.applies_to : ["all"],
      activity: r.activity,
      sort: r.sort ?? 0,
      active: r.active !== false,
      supervisor_user_id: r.supervisor_user_id ?? null,
    }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.sort - b.sort);
}

/** Columns of timetable_periods; `supervisor_user_id` needs migration 0069, so it is retried without it. */
export const PERIOD_COLUMNS: string = "id, name, kind, start_time, end_time, weekdays, band, applies_to, activity, sort, active";
export const PERIOD_COLUMNS_WITH_SUPERVISOR: string = `${PERIOD_COLUMNS}, supervisor_user_id`;

/** Fills `supervisor_name` on enrichment periods through period_supervisor_names() (name only; works for families and students). Never throws. */
export async function attachSupervisorNames(periods: TimetablePeriod[]): Promise<TimetablePeriod[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !periods.some((p) => p.supervisor_user_id)) return periods;
  try {
    const { data, error } = await supabase.rpc("period_supervisor_names");
    if (error || !data) return periods;
    const names = new Map((data as { period_id: string; supervisor_name: string }[]).map((r) => [r.period_id, r.supervisor_name]));
    return periods.map((p) => (p.supervisor_user_id ? { ...p, supervisor_name: names.get(p.id) ?? null } : p));
  } catch {
    return periods;
  }
}

/** Stored periods, or [] when the table is empty / missing. Never throws. */
export async function fetchTimetablePeriods(): Promise<TimetablePeriod[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const first = await supabase.from("timetable_periods").select(PERIOD_COLUMNS_WITH_SUPERVISOR);
    const res = first.error ? await supabase.from("timetable_periods").select(PERIOD_COLUMNS) : first;
    if (res.error) return [];
    return await attachSupervisorNames(normalisePeriods(res.data as unknown as PeriodRow[]));
  } catch {
    return [];
  }
}

/** Active stored periods, or the built-in day when there are none. */
export function effectivePeriods(stored: TimetablePeriod[] | null | undefined): TimetablePeriod[] {
  const active = (stored || []).filter((p) => p.active);
  return active.length > 0 ? active : FALLBACK_PERIODS;
}

/** Lesson periods as the simple {start,end,band,weekdays} shape PERIODS has (weekdays merged across identical times). */
export function lessonPeriods(stored: TimetablePeriod[] | null | undefined, viewer?: string[]): { start: string; end: string; band: string; weekdays: number[] }[] {
  const lessons = effectivePeriods(stored).filter((p) => p.kind === "lesson" && (viewer === undefined || periodApplies(p, viewer)));
  const byKey = new Map<string, { start: string; end: string; band: string; weekdays: number[] }>();
  for (const p of lessons) {
    const key = `${p.start_time}-${p.end_time}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.weekdays = Array.from(new Set([...seen.weekdays, ...p.weekdays])).sort((a, b) => a - b);
      continue;
    }
    byKey.set(key, { start: p.start_time, end: p.end_time, band: p.band || bandFor(p.start_time), weekdays: [...p.weekdays] });
  }
  return Array.from(byKey.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export type TimetableSlot = {
  id: string;
  run_id: string;
  class_id: string;
  subject_id: string;
  teacher_user_id: string;
  virtual_session_id: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  classes?: { name: string; year_group: string } | null;
  subjects?: { name: string } | null;
};

export function timeLabel(t: string): string {
  return t.slice(0, 5);
}

/** The most recently published run for a given academic year (or any if omitted). */
export async function getPublishedRunId(academicYearId?: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  let query = supabase.from("timetable_runs").select("id, published_at, academic_year_id").eq("status", "published");
  if (academicYearId) query = query.eq("academic_year_id", academicYearId);
  const { data } = await query.order("published_at", { ascending: false }).limit(1);
  return data && data.length > 0 ? data[0].id : null;
}

// ── ICS calendar-feed tokens (client-side generate + hash; only the hash
// is ever sent to Supabase, matching the server-side manageToken.ts
// pattern used by the booking system's own tokens) ─────────────────────
export function generateIcsToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashIcsToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function icsFeedUrl(token: string): string | null {
  // Branded address on the portal's own domain (proxied by deploy/calendar.php);
  // falls back to the function URL when running somewhere without the proxy.
  if (typeof window !== "undefined" && /(^|\.)learn\.tarbiyyah\.co\.uk$/.test(window.location.hostname)) {
    return `${window.location.origin}/calendar.php?token=${token}`;
  }
  const base = getEdgeFunctionUrl("timetable-ics");
  if (!base) return null;
  return `${base}?token=${token}`;
}

// ── One-click subscribe links for a feed URL ───────────────────────────
/** webcal:// form of a feed URL: opens the user's default calendar app directly. */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:/i, "webcal:");
}

/** Google Calendar's "add by URL" screen, pre-filled with the feed. */
export function googleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}

/** Outlook (outlook.live.com / Microsoft 365) "subscribe from web" screen, pre-filled. */
export function outlookSubscribeUrl(feedUrl: string, name = "Tarbiyyah Global Academy"): string {
  return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`;
}
