import type { SupabaseClient } from "@supabase/supabase-js";

// Teacher "about me" (staff_profiles, 0067) and the safe subset families see
// via the meet_my_teachers() RPC. Compliance dates live in staff_vetting_records.

export const STAFF_PHOTO_BUCKET = "staff-photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type StaffProfile = {
  user_id: string;
  display_title: string | null;
  bio: string | null;
  qualifications: string | null;
  subjects_taught: string[];
  years_experience: number | null;
  languages: string[];
  photo_path: string | null;
  contact_visible: boolean;
};

export const STAFF_PROFILE_COLUMNS = "user_id, display_title, bio, qualifications, subjects_taught, years_experience, languages, photo_path, contact_visible";

/** What a family / student may see about a teacher of theirs. */
export type TeacherCardData = {
  teacher_id: string;
  full_name: string;
  display_title: string | null;
  bio: string | null;
  qualifications: string | null;
  subjects_taught: string[] | null;
  years_experience: number | null;
  languages: string[] | null;
  photo_path: string | null;
  contact_email: string | null;
  class_names: string[] | null;
};

export type Vetting = {
  user_id: string;
  dbs_check_date: string | null;
  dbs_renewal_due: string | null;
  right_to_work_verified: boolean;
  safeguarding_training_date: string | null;
  start_date: string | null;
};

export function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** "Mr Ahmed Khan" style: the title in front when there is one and the name doesn't already start with it. */
export function displayName(fullName: string, title: string | null): string {
  const t = (title || "").trim();
  if (!t || fullName.toLowerCase().startsWith(t.toLowerCase() + " ")) return fullName;
  return `${t} ${fullName}`;
}

/** Signed URLs (1 hour) for a set of staff-photos objects, keyed by object path. */
export async function signedPhotoUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const out: Record<string, string> = {};
  if (unique.length === 0) return out;
  const { data } = await supabase.storage.from(STAFF_PHOTO_BUCKET).createSignedUrls(unique, 3600);
  for (const row of data || []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

export type DueState = "none" | "ok" | "soon" | "overdue";

/** Days from today (local) to an ISO date; negative = in the past. */
export function daysUntil(isoDate: string, nowMs: number): number {
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export function dueState(isoDate: string | null, nowMs: number, warnDays = 60): DueState {
  if (!isoDate) return "none";
  const d = daysUntil(isoDate, nowMs);
  if (d < 0) return "overdue";
  return d <= warnDays ? "soon" : "ok";
}

/** Safeguarding training is refreshed annually: due date = last training + 12 months. */
export function trainingDue(trainedOn: string | null): string | null {
  if (!trainedOn) return null;
  const d = new Date(`${trainedOn.slice(0, 10)}T00:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
