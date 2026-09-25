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

// Two live-lesson time bands (see scripts/timetable-solver/generate.py's
// module docstring / src/sanity/schemaTypes/curriculumContent.ts's
// timeBandsHeading/timeBandsBody) — this school teaches an
// international, timezone-spread cohort across two daily windows.
export const PERIODS: { start: string; end: string; band: "A" | "B" }[] = [
  { start: "09:00", end: "10:00", band: "A" },
  { start: "10:00", end: "11:00", band: "A" },
  { start: "11:15", end: "12:15", band: "A" },
  { start: "15:00", end: "16:00", band: "B" },
  { start: "16:00", end: "17:00", band: "B" },
  { start: "17:15", end: "18:15", band: "B" },
];

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
  const base = getEdgeFunctionUrl("timetable-ics");
  if (!base) return null;
  return `${base}?token=${token}`;
}
