// Drafting revision quiz questions for a unit (Tafweed T2). Pure functions
// (no network, no Deno APIs). Staff-side only: the questions are saved as
// 'pending' (revision_questions.review, migration 0184), which can never be
// active, so no pupil sees one until a teacher approves it.
//
// Only lesson content is sent to the model: titles, objectives, key words and
// the teaching points. No pupil data of any kind.

export type LessonForPrompt = { lesson_no: number; title: string; objectives?: unknown; content?: Record<string, unknown> | null };
export type DraftQuestion = { lesson_no: number | null; topic: string; question: string; options: string[]; answer: number; explanation: string; hint: string | null };

const MAX_PROMPT_CHARS = 14_000;

function strs(v: unknown, max = 12): string[] {
  return (Array.isArray(v) ? v : []).map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).filter((y) => typeof y === "string").join(": ") : "")).filter(Boolean).slice(0, max);
}

/** One compact block per lesson, so the prompt stays small. */
export function lessonBrief(l: LessonForPrompt): string {
  const c = (l.content || {}) as Record<string, unknown>;
  const teach = (Array.isArray(c.teach) ? c.teach : []).slice(0, 6).map((t) => {
    const o = (t || {}) as Record<string, unknown>;
    return [typeof o.heading === "string" ? o.heading : "", ...strs(o.bullets, 5)].filter(Boolean).join("; ");
  });
  const keywords = (Array.isArray(c.keywords) ? c.keywords : []).slice(0, 10).map((k) => {
    const o = (k || {}) as Record<string, unknown>;
    return `${o.term ?? ""}: ${o.def ?? ""}`;
  });
  return [
    `Lesson ${l.lesson_no}: ${l.title}`,
    strs(l.objectives ?? c.objectives, 6).length ? `Objectives: ${strs(l.objectives ?? c.objectives, 6).join(" | ")}` : "",
    keywords.length ? `Key words: ${keywords.join(" | ")}` : "",
    teach.length ? `Taught: ${teach.join(" || ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRevisionPrompt(input: { subject: string; year: string; unit: string; lessons: LessonForPrompt[]; count: number; avoid: string[] }) {
  const system = [
    "You write multiple-choice revision questions for pupils at an Islamic school in the UK, for a teacher to check before any pupil sees them.",
    "Use UK English. No em dashes. Plain, age-appropriate wording.",
    "Base every question ONLY on the lesson content given. Do not invent facts, dates, Qur'an verse numbers or hadith references; if a lesson quotes one, you may use it exactly as given.",
    "Each question has 3 or 4 options, exactly one correct, with plausible wrong options of similar length.",
    "Reply with JSON only, no prose: {\"questions\": [{\"lesson\": <lesson number>, \"question\": \"...\", \"options\": [\"...\"], \"answer\": <index of the correct option, from 0>, \"explanation\": \"one sentence on why\", \"hint\": \"a short nudge, not the answer\"}]}",
  ].join("\n");
  let lessons = input.lessons.map(lessonBrief).join("\n\n");
  if (lessons.length > MAX_PROMPT_CHARS) lessons = lessons.slice(0, MAX_PROMPT_CHARS);
  const user = [
    `Subject: ${input.subject}. Year group: ${input.year}. Unit: ${input.unit}.`,
    `Write ${input.count} questions spread across the lessons.`,
    input.avoid.length ? `Do not repeat these existing questions:\n- ${input.avoid.slice(0, 40).join("\n- ")}` : "",
    "",
    "<lessons>",
    lessons,
    "</lessons>",
  ]
    .filter((x) => x !== "")
    .join("\n");
  return { system, user, maxTokens: Math.min(4000, 300 * input.count + 400) };
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keeps only well-formed questions; topic is the lesson title the model named. */
export function validateRevisionOutput(raw: Record<string, unknown>, lessons: LessonForPrompt[], count: number): DraftQuestion[] | null {
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  const titleOf = new Map(lessons.map((l) => [l.lesson_no, l.title]));
  const seen = new Set<string>();
  const out: DraftQuestion[] = [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;
    const question = clean(o.question, 600);
    const options = (Array.isArray(o.options) ? o.options : []).map((x) => clean(x, 200)).filter(Boolean);
    const answer = Number(o.answer);
    if (question.length < 3 || options.length < 2 || options.length > 6 || new Set(options).size !== options.length) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lessonNo = titleOf.has(Number(o.lesson)) ? Number(o.lesson) : null;
    const topic = (lessonNo !== null && titleOf.get(lessonNo)) || lessons[0]?.title || "Unit";
    out.push({ lesson_no: lessonNo, topic: topic.slice(0, 200), question, options, answer, explanation: clean(o.explanation, 400), hint: clean(o.hint, 200) || null });
    if (out.length >= count) break;
  }
  return out.length ? out : null;
}
