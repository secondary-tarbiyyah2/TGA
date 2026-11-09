// Lesson feedback (Tafweed T34, migration 0191): staff leave a note on a lesson or one part of
// it; the Headteacher and Admin answer it. RLS does the scoping: staff read their own notes,
// the Headteacher and Admin read every note. Pupils and parents have no access at all.
import { getSupabaseClient } from "@/lib/supabase/client";

export type FeedbackStatus = "open" | "accepted" | "done" | "declined";
export type LessonFeedback = {
  id: string;
  lesson_id: string;
  part: string;
  part_label: string | null;
  body: string;
  status: FeedbackStatus;
  response: string | null;
  author_id: string;
  author_name: string | null;
  created_at: string;
  handled_by_name: string | null;
  handled_at: string | null;
  lesson?: { subject: string; subject_slug: string; year: string; unit: string | null; lesson_no: number; title: string } | null;
};
export type FeedbackEvent = { id: string; action: string; note: string | null; actor_name: string | null; at: string };

export const STATUS_LABEL: Record<FeedbackStatus, string> = { open: "Waiting", accepted: "Being changed", done: "Done", declined: "Declined" };

const COLS = "id, lesson_id, part, part_label, body, status, response, author_id, author_name, created_at, handled_by_name, handled_at";
const WITH_LESSON = `${COLS}, lesson:curriculum_lessons(subject, subject_slug, year, unit, lesson_no, title)`;

/** The parts of a lesson a note can be about, in slide order. With the lesson's content, teaching slides are named by their heading. */
export function lessonParts(content?: { teach?: { heading?: string }[]; hook?: unknown } | null): { key: string; label: string }[] {
  const teach = content?.teach?.length ? content.teach : Array.from({ length: 7 }, () => ({ heading: "" }));
  return [
    { key: "lesson", label: "The whole lesson" },
    { key: "title", label: "Title slide" },
    { key: "objectives", label: "Objectives" },
    ...(content && !content.hook ? [] : [{ key: "hook", label: "Hook" }]),
    { key: "keywords", label: "Key words" },
    { key: "starter", label: "Starter" },
    ...teach.map((t, i) => ({ key: `teach:${i}`, label: `Teaching slide ${i + 1}${t.heading ? `: ${t.heading}` : ""}` })),
    { key: "practice", label: "Guided practice" },
    { key: "independent", label: "Independent tasks" },
    { key: "exit", label: "Exit ticket" },
    { key: "homework", label: "Homework" },
    { key: "plan", label: "Lesson plan" },
  ];
}

export async function sendFeedback(lessonId: string, part: string, partLabel: string, body: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not signed in.";
  const { error } = await supabase.from("curriculum_lesson_feedback").insert({ lesson_id: lessonId, part, part_label: partLabel, body: body.trim() });
  if (!error) return null;
  return /relation|does not exist|schema cache/i.test(error.message) ? "Lesson feedback is not switched on yet. Try again after the next update." : "Couldn't send your feedback. Try again.";
}

/** Head/Admin: the queue (open and being changed first), or one lesson's notes. */
export async function loadFeedback(opts: { lessonId?: string; openOnly?: boolean; id?: string } = {}): Promise<LessonFeedback[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  let q = supabase.from("curriculum_lesson_feedback").select(WITH_LESSON).order("created_at", { ascending: false }).limit(300);
  if (opts.lessonId) q = q.eq("lesson_id", opts.lessonId);
  if (opts.id) q = q.eq("id", opts.id);
  if (opts.openOnly) q = q.in("status", ["open", "accepted"]);
  const { data, error } = await q;
  if (error) return [];
  return (data as unknown as LessonFeedback[]) || [];
}

export async function feedbackLog(id: string): Promise<FeedbackEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase.from("curriculum_lesson_feedback_events").select("id, action, note, actor_name, at").eq("feedback_id", id).order("at");
  return (data as FeedbackEvent[]) || [];
}

/** Head/Admin: accept, mark done or decline (a decline needs a reason). */
export async function answerFeedback(id: string, status: FeedbackStatus, response?: string | null): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not signed in.";
  const patch: { status: FeedbackStatus; response?: string | null } = { status };
  if (response !== undefined) patch.response = response?.trim() || null;
  const { error } = await supabase.from("curriculum_lesson_feedback").update(patch).eq("id", id);
  if (!error) return null;
  return /decline_reason|23514/.test(`${error.code} ${error.message}`) ? "Say why you are declining it." : "Couldn't save that. Try again.";
}

export const lessonLabel = (l: LessonFeedback["lesson"]) => (l ? `${l.subject}, ${l.year.toUpperCase().replace(/^Y/, "Year ")}, lesson ${l.lesson_no}: ${l.title}` : "A lesson");
