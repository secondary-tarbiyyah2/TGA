// Drafting a classwork quiz from a unit's (or one lesson's) content (owner feedback 11 Nov 2026,
// item 6). Pure functions (no network, no Deno APIs). Nothing is saved: the questions go back to
// the teacher's quiz builder, each marked "Drafted by AI" and unchecked, and the quiz cannot be
// set until the teacher has checked every one.
//
// Only lesson content is sent to the model: titles, objectives, key words and the teaching points.
// No pupil data of any kind.

import { lessonBrief, type LessonForPrompt } from "./revision.ts";

export const QUIZ_TYPES = ["single", "multiple", "true_false", "short", "long", "matching", "ordering", "numeric"] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];

export type QuizDraft = {
  qtype: QuizType;
  prompt: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  options?: string[];
  correct?: number | number[] | boolean;
  accept?: string[];
  model?: string;
  value?: number;
  tolerance?: number;
  pairs?: { left: string; right: string }[];
  items?: string[];
};

const MAX_PROMPT_CHARS = 16_000;

const SHAPES: Record<QuizType, string> = {
  single: '{"qtype":"single","prompt":"...","options":["...","...","...","..."],"correct":<index from 0>}',
  multiple: '{"qtype":"multiple","prompt":"... (say how many to tick)","options":["...", "...", "...", "..."],"correct":[<indexes from 0>]}',
  true_false: '{"qtype":"true_false","prompt":"a statement","correct":true|false}',
  short: '{"qtype":"short","prompt":"...","accept":["the answer","another acceptable wording"]}',
  long: '{"qtype":"long","prompt":"...","model":"the points a full answer makes"}',
  matching: '{"qtype":"matching","prompt":"Match each ... to its ...","pairs":[{"left":"...","right":"..."}]}',
  ordering: '{"qtype":"ordering","prompt":"Put these in order ...","items":["first","second","..."]}',
  numeric: '{"qtype":"numeric","prompt":"...","value":<number>,"tolerance":<number, 0 for exact>}',
};

export function buildQuizPrompt(input: { subject: string; year: string; unit: string; lessons: LessonForPrompt[]; count: number; types: QuizType[]; avoid: string[] }) {
  const types = input.types.length ? input.types : (["single", "multiple", "true_false", "short", "matching", "ordering", "long"] as QuizType[]);
  const system = [
    "You write classwork quizzes for pupils at an Islamic school in the UK, for a teacher to check and edit before any pupil sees them.",
    "Use UK English. No em dashes. Plain, age-appropriate wording.",
    "Base every question ONLY on the lesson content given. Do not invent facts, dates, Qur'an verse numbers or hadith references; if a lesson quotes one, you may use it exactly as given.",
    "Make a well-structured quiz: cover the lesson objectives and key words; start easier and build up; mix difficulty (about a third easy, half medium, the rest hard); mix the question types asked for.",
    "Multiple choice: 4 options, exactly one right, wrong options plausible and of similar length. Multiple answer: 4 or 5 options, 2 or 3 right, and the prompt says how many to tick.",
    "Short answers must be a word or short phrase with every acceptable wording listed. Matching: 3 to 6 pairs. Ordering: 3 to 6 items. Long answer: at most one, worth more marks, with a model answer.",
    "Marks: 1 for most questions, 2 for multiple answer, matching and ordering, 3 to 6 for a long answer.",
    "Every question has a one-sentence explanation of why the answer is right, and a difficulty of easy, medium or hard.",
    `Reply with JSON only, no prose: {"questions": [ ... ]} where each question has "marks", "difficulty", "explanation", "lesson" (the lesson number) and one of these shapes:`,
    ...types.map((t) => SHAPES[t]),
  ].join("\n");
  let lessons = input.lessons.map(lessonBrief).join("\n\n");
  if (lessons.length > MAX_PROMPT_CHARS) lessons = lessons.slice(0, MAX_PROMPT_CHARS);
  const user = [
    `Subject: ${input.subject}. Year group: ${input.year}. Unit: ${input.unit}.`,
    `Write ${input.count} questions using these types: ${types.join(", ")}.`,
    input.avoid.length ? `Do not repeat these questions already in the quiz:\n- ${input.avoid.slice(0, 40).join("\n- ")}` : "",
    "",
    "<lessons>",
    lessons,
    "</lessons>",
  ]
    .filter((x) => x !== "")
    .join("\n");
  return { system, user, maxTokens: Math.min(6000, 380 * input.count + 600) };
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s*[—―]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const strList = (v: unknown, max: number, len = 200) => (Array.isArray(v) ? v.map((x) => clean(x, len)).filter(Boolean).slice(0, max) : []);

/** Keeps only well-formed questions of the asked-for types. */
export function validateQuizOutput(raw: Record<string, unknown>, types: QuizType[], count: number): QuizDraft[] | null {
  const allowed = new Set(types.length ? types : QUIZ_TYPES);
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  const seen = new Set<string>();
  const out: QuizDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const qtype = o.qtype as QuizType;
    if (!allowed.has(qtype)) continue;
    const prompt = clean(o.prompt, 600);
    if (prompt.length < 3 || seen.has(prompt.toLowerCase())) continue;
    const marks = Math.max(1, Math.min(10, Math.round(Number(o.marks) || 1)));
    const difficulty = (["easy", "medium", "hard"].includes(String(o.difficulty)) ? o.difficulty : "medium") as QuizDraft["difficulty"];
    const base = { qtype, prompt, marks, difficulty, explanation: clean(o.explanation, 400) };
    let q: QuizDraft | null = null;
    if (qtype === "single" || qtype === "multiple") {
      const options = strList(o.options, 6);
      if (options.length < 2 || new Set(options.map((x) => x.toLowerCase())).size !== options.length) continue;
      const correct = (Array.isArray(o.correct) ? o.correct : [o.correct]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
      if (qtype === "single" && correct.length !== 1) continue;
      if (qtype === "multiple" && correct.length < 1) continue;
      q = { ...base, options, correct: qtype === "single" ? correct[0] : Array.from(new Set(correct)) };
    } else if (qtype === "true_false") {
      if (typeof o.correct !== "boolean") continue;
      q = { ...base, correct: o.correct };
    } else if (qtype === "short") {
      const accept = strList(o.accept, 8, 120);
      if (!accept.length) continue;
      q = { ...base, accept };
    } else if (qtype === "long") {
      q = { ...base, model: clean(o.model, 1500) };
    } else if (qtype === "numeric") {
      const value = Number(o.value);
      if (!Number.isFinite(value)) continue;
      const tol = Number(o.tolerance);
      q = { ...base, value, tolerance: Number.isFinite(tol) && tol >= 0 ? tol : 0 };
    } else if (qtype === "matching") {
      const pairs = (Array.isArray(o.pairs) ? o.pairs : [])
        .map((p) => ({ left: clean((p as Record<string, unknown>)?.left, 150), right: clean((p as Record<string, unknown>)?.right, 150) }))
        .filter((p) => p.left && p.right)
        .slice(0, 8);
      if (pairs.length < 2) continue;
      q = { ...base, pairs };
    } else if (qtype === "ordering") {
      const items = strList(o.items ?? o.options, 8);
      if (items.length < 2) continue;
      q = { ...base, items };
    }
    if (!q) continue;
    seen.add(prompt.toLowerCase());
    out.push(q);
    if (out.length >= count) break;
  }
  return out.length ? out : null;
}

/** "Year 7", "y7", "7A" -> "y7"; "Reception" -> "reception". */
export function yearKey(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/reception/i.test(name)) return "reception";
  const m = /(\d{1,2})/.exec(name);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 11 ? `y${n}` : null;
}
