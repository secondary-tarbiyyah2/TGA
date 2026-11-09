import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";

// Shared types and helpers for the Star of the Week flow (0074, 0131).

export type StarStatus = "nominated" | "approved" | "declined";
export type Star = {
  id: string;
  class_id: string;
  child_id: string;
  week_start: string;
  reason: string;
  reasons: string[] | null;
  message: string | null;
  status: StarStatus;
  decision_note: string | null;
  announced_at: string | null;
  certificate_path: string | null;
  certificate_emailed_at: string | null;
  created_at: string;
  children: { name: string; hide_from_leaderboard: boolean } | null;
  classes: { name: string } | null;
  nominator: { full_name: string } | null;
};

export const STAR_SELECT =
  "id, class_id, child_id, week_start, reason, reasons, message, status, decision_note, announced_at, certificate_path, certificate_emailed_at, created_at, children(name, hide_from_leaderboard), classes(name), nominator:profiles!star_of_the_week_nominated_by_fkey(full_name)";

/** One pupil's week, from star_candidates() (0131). */
export type Candidate = {
  child_id: string;
  child_name: string;
  hidden: boolean;
  merits: number;
  merit_points: number;
  net_points: number;
  homework_set: number;
  homework_done: number;
  quran_sessions: number;
  quran_average: number | null;
  lessons: number;
  attended: number;
  stars_this_term: number;
  stars_all_time: number;
  last_star_week: string | null;
};

/** One-tap reasons for "Why are they the star?". */
export const STAR_QUICK_TAGS = [
  "Outstanding effort",
  "Acts of kindness",
  "Academic progress",
  "Resilience",
  "Helping others",
  "Great Qur'an recitation",
  "Great teamwork",
  "Leadership",
  "Always on time",
  "Beautiful manners",
];

/** The sentence printed on the certificate, from the chosen reasons. */
export function sentenceFromTags(tags: string[]): string {
  if (tags.length === 0) return "";
  const lower = tags.map((t, i) => (i === 0 ? t : `${t.charAt(0).toLowerCase()}${t.slice(1)}`));
  return lower.length === 1 ? `${lower[0]}.` : `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}.`;
}

export const STATUS_LABEL: Record<StarStatus, string> = { nominated: "Waiting for approval", approved: "Approved", declined: "Not chosen" };

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday (local) of the week containing `d`, as YYYY-MM-DD. */
export function mondayIso(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return isoLocal(copy);
}

export function weekOptions(n = 6): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const value = mondayIso(d);
    out.push({ value, label: `${i === 0 ? "This week" : i === 1 ? "Last week" : "Week"} · ${shortDay(value)}` });
  }
  return out;
}

export const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** "Aisha K."– how the school shout-out names a pupil. */
export function shoutName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : parts[0] || name;
}

/** Weeks between two Mondays. */
export function weeksBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / (7 * 86400000));
}

/**
 * A simple, explainable suggestion score: this week's merits, homework,
 * attendance and Qur'an, less a little for every time they have already been
 * star this term, so the same child isn't chosen week after week.
 */
export function candidateScore(c: Candidate): number {
  const hw = c.homework_set ? c.homework_done / c.homework_set : 0;
  const att = c.lessons ? c.attended / c.lessons : 0;
  const q = c.quran_average != null ? Number(c.quran_average) / 10 : 0;
  return c.merit_points * 2 + hw * 3 + att * 2 + q * 2 + (c.net_points < 0 ? -2 : 0) - c.stars_this_term * 4;
}

/** Make (or open) the PDF certificate, or email it to the family. */
export async function certificateAction(star: Star, email: boolean): Promise<{ ok: boolean; text?: string }> {
  const tab = email ? null : window.open("about:blank", "_blank");
  const res = await callEdgeFunction("star-certificate", { star_id: star.id, email });
  if (!res.ok) {
    tab?.close();
    return { ok: false, text: edgeErrorMessage(res) };
  }
  if (!email && typeof res.url === "string") {
    if (tab) tab.location.href = res.url;
    else window.location.assign(res.url);
    return { ok: true };
  }
  return res.emailed ? { ok: true, text: "Certificate emailed to the family." } : { ok: false, text: `Not emailed: ${typeof res.email_note === "string" ? res.email_note : "unknown reason"}` };
}

/** Post the class shout-out (never for a pupil whose family opted out of the leaderboard). */
export async function postShoutOut(star: Star, authorId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  if (star.children?.hide_from_leaderboard) return null;
  const name = shoutName(star.children?.name || "Our star");
  const { error } = await supabase.from("announcements").insert({
    scope: "class",
    class_id: star.class_id,
    title: `Star of the Week: ${name}`,
    body: `Congratulations to ${name}, ${star.classes?.name ? `${star.classes.name}'s ` : "our "}Star of the Week for the week beginning ${longDay(star.week_start)}. ${star.reason}`,
    author_id: authorId,
  });
  if (error) return error.message;
  await supabase.from("star_of_the_week").update({ announced_at: new Date().toISOString() }).eq("id", star.id);
  return null;
}
