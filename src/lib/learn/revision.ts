import { getSupabaseClient } from "@/lib/supabase/client";

/** Unit revision (migration 0094): types and calls shared by the pupil and staff screens. */

export const MEDIA_BUCKET = "revision-media";

export type SummarySlide = {
  title: string;
  time?: string | null;
  term?: string | null;
  transliteration?: string | null;
  points: string[];
  quote?: { text: string; src: string } | null;
  keywords?: string[];
};

export type PupilUnitCard = {
  id: string;
  subject: string;
  subject_slug: string;
  unit: string;
  title: string;
  kind: "lessons" | "summary";
  has_video: boolean;
  questions: number;
  topics: number;
  mastered: number;
  last_quiz: { correct: number; total: number; at: string } | null;
};

export type PupilTopic = { topic: string; first: number; questions: number; level: number; next_review_on: string | null };

export type PupilUnit = {
  id: string;
  subject: string;
  subject_slug: string;
  unit: string;
  title: string;
  year: string;
  kind: "lessons" | "summary";
  summary: SummarySlide[];
  video_path: string | null;
  lessons: { lesson_no: number; title: string; objectives: string[]; pdf_path: string | null }[];
  topics: PupilTopic[];
};

export type PupilQuestion = { id: string; topic: string; question: string; options: string[]; hint: string | null };
export type AnswerResult = { correct: boolean; answer: number; explanation: string | null; note: string | null; level: number };

export type StaffQuestion = {
  id: string;
  topic: string;
  lesson_no: number | null;
  question: string;
  options: string[];
  answer: number;
  explanation: string | null;
};

export type InsightPupil = {
  id: string;
  name: string;
  quiz: { at: string; correct: number; total: number; answered: number; answers: Record<string, number> } | null;
  quizzes: number;
  practice: number;
  mastery: Record<string, number>;
};

export type Insights = {
  unit: { id: string; title: string; subject: string; year: string; unit: string; published: boolean };
  classes: { id: string; name: string }[];
  questions: StaffQuestion[];
  pupils: InsightPupil[];
};

export type StaffUnit = {
  id: string;
  subject_slug: string;
  subject: string;
  unit: string;
  title: string;
  kind: "lessons" | "summary";
  published: boolean;
  has_video: boolean;
  questions: number;
  practice_questions: number;
  takers: number;
};

export type OverviewRow = {
  unit_id: string;
  title: string;
  subject: string;
  subject_slug: string;
  year: string;
  unit: string;
  takers: number;
  avg_pct: number | null;
  under60: number;
  last_at: string;
  weakest: { topic: string; pct: number } | null;
};

/** Friendly message for a failed call: never show raw database errors to pupils. */
function fail(error: { message?: string } | null, fallback: string): never {
  const m = error?.message || "";
  if (/not a pupil/i.test(m)) throw new Error("Unit revision is for pupil accounts.");
  if (/no questions/i.test(m)) throw new Error("This unit has no questions yet.");
  if (/not found/i.test(m)) throw new Error("That unit isn't available.");
  throw new Error(fallback);
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("The portal isn't connected. Refresh to try again.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error, fallback);
  return data as T;
}

export const pupilUnits = () => rpc<PupilUnitCard[]>("revision_pupil_units", {}, "Couldn't load your revision units. Refresh to try again.");
export const pupilUnit = (id: string) => rpc<PupilUnit>("revision_pupil_unit", { p_unit: id }, "Couldn't open that unit. Refresh to try again.");
export const startRound = (unit: string, mode: "quiz" | "practice", topic?: string) =>
  rpc<{ attempt: string; questions: PupilQuestion[] }>("revision_start", { p_unit: unit, p_mode: mode, p_topic: topic ?? null }, "Couldn't start. Try again.");
export const answerQuestion = (attempt: string, question: string, choice: number, usedHint: boolean) =>
  rpc<AnswerResult>("revision_answer", { p_attempt: attempt, p_question: question, p_choice: choice, p_used_hint: usedHint }, "Couldn't save that answer. Check your connection and try again.");
export const finishRound = (attempt: string) => rpc<{ correct: number; answered: number; total: number }>("revision_finish", { p_attempt: attempt }, "Couldn't save your result.");
export const unitInsights = (unit: string, cls: string | null) => rpc<Insights>("revision_insights", { p_unit: unit, p_class: cls }, "Couldn't load the results. Refresh to try again.");
export const revisionOverview = () => rpc<OverviewRow[]>("revision_overview", {}, "Couldn't load revision results. Refresh to try again.");
export const unitsForYear = (year: string) => rpc<StaffUnit[]>("revision_units_for_year", { p_year: year }, "Couldn't load revision packs.");

/** Short-lived link to a unit video. */
export async function mediaUrl(path: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 3);
  return error ? null : data.signedUrl;
}

/** "7:56" -> 476. */
export function toSeconds(t: string | null | undefined): number {
  const parts = String(t || "").split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((s, n) => s * 60 + n, 0);
}

export function pct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

export function band(p: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (p >= 70) return { label: "Secure", tone: "good" };
  if (p >= 50) return { label: "Developing", tone: "warn" };
  return { label: "Needs practice", tone: "bad" };
}

export const TONE: Record<"good" | "warn" | "bad", { chip: string; bar: string; text: string }> = {
  good: { chip: "bg-green-50 text-green-800 ring-1 ring-green-200", bar: "bg-green-600", text: "text-green-800" },
  warn: { chip: "bg-amber-50 text-amber-900 ring-1 ring-amber-200", bar: "bg-amber-500", text: "text-amber-900" },
  bad: { chip: "bg-red-50 text-red-800 ring-1 ring-red-200", bar: "bg-red-600", text: "text-red-800" },
};

/** Stable shuffle of option positions, so a pupil sees options in a fresh order per question. */
export function displayOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
