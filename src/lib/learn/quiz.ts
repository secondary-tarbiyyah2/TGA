import type { IconName } from "@/components/learn/Icon";

// Classwork quizzes (migration 0205): question types, the editor's shape of a question, checks
// before saving, and the pupil-side shapes the quiz_* functions return. Pure: no Supabase here.

export type QType = "single" | "multiple" | "true_false" | "short" | "long" | "matching" | "ordering" | "numeric" | "label";

/** The nine question types, in the order the builder offers them, each with what it is for. */
export const QTYPES: { type: QType; label: string; icon: IconName; hint: string; auto: boolean }[] = [
  { type: "single", label: "Multiple choice", icon: "circleDot", hint: "One right answer from a list", auto: true },
  { type: "multiple", label: "Multiple answer", icon: "squareCheck", hint: "Tick every right answer", auto: true },
  { type: "true_false", label: "True or false", icon: "toggleLeft", hint: "A statement to judge", auto: true },
  { type: "short", label: "Short answer", icon: "type", hint: "A word or phrase; you list what to accept", auto: true },
  { type: "long", label: "Long answer", icon: "alignLeft", hint: "A paragraph; you mark it", auto: false },
  { type: "matching", label: "Matching", icon: "arrowLeftRight", hint: "Pair each item with its match", auto: true },
  { type: "ordering", label: "Ordering", icon: "listOrdered", hint: "Put steps or events in order", auto: true },
  { type: "numeric", label: "Number", icon: "hash", hint: "A numerical answer, with a margin", auto: true },
  { type: "label", label: "Label a diagram", icon: "mapPin", hint: "Pins on an image to name", auto: true },
];

export const QTYPE_LABEL: Record<QType, string> = Object.fromEntries(QTYPES.map((t) => [t.type, t.label])) as Record<QType, string>;

export type Pair = { left: string; right: string };
export type Pin = { x: number; y: number; label: string };

/** A question as the builder holds it (one shape for every type; unused fields are ignored). */
export type DraftQuestion = {
  id: string;
  qtype: QType;
  prompt: string;
  marks: number;
  explanation: string;
  difficulty: "" | "easy" | "medium" | "hard";
  /** single, multiple: the options; ordering: the items in the right order. */
  options: string[];
  /** single: one index; multiple: several. */
  correct: number[];
  tf: boolean;
  /** short: accepted answers. */
  accept: string[];
  /** long: a model answer for marking. */
  model: string;
  numeric: string;
  tolerance: string;
  pairs: Pair[];
  pins: Pin[];
  image_path: string | null;
  /** Drafted by AI: the teacher must tick it as checked before the quiz is set. */
  ai: boolean;
  checked: boolean;
};

export type QuizSettings = {
  shuffle_questions: boolean;
  shuffle_options: boolean;
  time_limit_minutes: number | null;
  max_attempts: number;
  show_answers: "after_submit" | "after_due" | "never";
};

export const DEFAULT_SETTINGS: QuizSettings = { shuffle_questions: false, shuffle_options: true, time_limit_minutes: null, max_attempts: 1, show_answers: "after_submit" };

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function blankQuestion(qtype: QType): DraftQuestion {
  const base: DraftQuestion = {
    id: uid(),
    qtype,
    prompt: "",
    marks: qtype === "long" ? 4 : qtype === "matching" || qtype === "label" || qtype === "multiple" ? 2 : 1,
    explanation: "",
    difficulty: "",
    options: [],
    correct: [],
    tf: true,
    accept: [""],
    model: "",
    numeric: "",
    tolerance: "0",
    pairs: [],
    pins: [],
    image_path: null,
    ai: false,
    checked: true,
  };
  if (qtype === "single" || qtype === "multiple") return { ...base, options: ["", "", ""], correct: [0] };
  if (qtype === "ordering") return { ...base, options: ["", "", ""] };
  if (qtype === "matching") return { ...base, pairs: [{ left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }] };
  return base;
}

/** Change a question's type, keeping what still makes sense (the prompt, marks and explanation). */
export function changeType(q: DraftQuestion, qtype: QType): DraftQuestion {
  const fresh = blankQuestion(qtype);
  const keepOptions = (qtype === "single" || qtype === "multiple" || qtype === "ordering") && q.options.length >= 2;
  return {
    ...fresh,
    id: q.id,
    prompt: q.prompt,
    explanation: q.explanation,
    difficulty: q.difficulty,
    ai: q.ai,
    checked: q.checked,
    options: keepOptions ? q.options : fresh.options,
    correct: qtype === "single" ? [q.correct[0] ?? 0] : qtype === "multiple" ? (q.correct.length ? q.correct : [0]) : [],
  };
}

const t = (s: string) => s.trim();

/** What is wrong with a question, in plain words, or null when it is ready. */
export function questionProblem(q: DraftQuestion): string | null {
  if (!t(q.prompt)) return "Write the question.";
  if (!(q.marks >= 0 && q.marks <= 100)) return "Marks must be from 0 to 100.";
  switch (q.qtype) {
    case "single":
    case "multiple": {
      const opts = q.options.map(t);
      if (opts.filter(Boolean).length < 2) return "Give at least two options.";
      if (opts.some((o) => !o)) return "Fill in or remove the empty option.";
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return "Two options are the same.";
      if (q.qtype === "single" && q.correct.length !== 1) return "Choose the right answer.";
      if (q.qtype === "multiple" && q.correct.length < 1) return "Tick at least one right answer.";
      return null;
    }
    case "short":
      return q.accept.map(t).filter(Boolean).length ? null : "Add at least one answer to accept.";
    case "numeric":
      if (t(q.numeric) === "" || !Number.isFinite(Number(q.numeric))) return "Give the right number.";
      if (t(q.tolerance) !== "" && !(Number(q.tolerance) >= 0)) return "The margin must be 0 or more.";
      return null;
    case "matching":
      if (q.pairs.length < 2) return "Add at least two pairs.";
      if (q.pairs.some((p) => !t(p.left) || !t(p.right))) return "Fill in both sides of every pair.";
      return null;
    case "ordering":
      if (q.options.length < 2) return "Add at least two items.";
      if (q.options.some((o) => !t(o))) return "Fill in or remove the empty item.";
      return null;
    case "label":
      if (!q.image_path) return "Add the diagram.";
      if (q.pins.length < 2) return "Add at least two labels: press the diagram where each goes.";
      if (q.pins.some((p) => !t(p.label))) return "Name every pin.";
      return null;
    default:
      return null;
  }
}

/** The database row for a question (homework_quiz_questions). */
export function toRow(q: DraftQuestion, homeworkId: string, position: number) {
  let options: unknown[] = [];
  let answer: Record<string, unknown> = {};
  switch (q.qtype) {
    case "single":
      options = q.options.map(t);
      answer = { correct: q.correct[0] ?? 0 };
      break;
    case "multiple":
      options = q.options.map(t);
      answer = { correct: [...q.correct].sort((a, b) => a - b) };
      break;
    case "true_false":
      answer = { correct: q.tf };
      break;
    case "short":
      answer = { accept: q.accept.map(t).filter(Boolean) };
      break;
    case "long":
      answer = { model: t(q.model) };
      break;
    case "numeric":
      answer = { value: Number(q.numeric), tolerance: Number(q.tolerance || 0) };
      break;
    case "matching":
      options = q.pairs.map((p) => ({ left: t(p.left), right: t(p.right) }));
      break;
    case "ordering":
      options = q.options.map(t);
      break;
    case "label":
      options = q.pins.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, label: t(p.label) }));
      break;
  }
  return {
    id: q.id,
    homework_id: homeworkId,
    position,
    qtype: q.qtype,
    prompt: t(q.prompt),
    options,
    answer,
    marks: q.marks,
    explanation: t(q.explanation) || null,
    image_path: q.image_path,
    difficulty: q.difficulty || null,
    drafted_by_ai: q.ai,
  };
}

type Row = ReturnType<typeof toRow>;

/** A saved question back into the builder's shape. */
export function fromRow(r: Omit<Row, "homework_id" | "position"> & { options: unknown; answer: unknown }): DraftQuestion {
  const q = blankQuestion(r.qtype);
  const a = (r.answer || {}) as Record<string, unknown>;
  const opts = Array.isArray(r.options) ? r.options : [];
  const out: DraftQuestion = { ...q, id: r.id, prompt: r.prompt, marks: Number(r.marks), explanation: r.explanation || "", difficulty: (r.difficulty || "") as DraftQuestion["difficulty"], image_path: r.image_path, ai: !!r.drafted_by_ai, checked: true };
  switch (r.qtype) {
    case "single":
      return { ...out, options: opts.map(String), correct: [Number(a.correct ?? 0)] };
    case "multiple":
      return { ...out, options: opts.map(String), correct: Array.isArray(a.correct) ? a.correct.map(Number) : [] };
    case "true_false":
      return { ...out, tf: a.correct !== false };
    case "short":
      return { ...out, accept: Array.isArray(a.accept) && a.accept.length ? a.accept.map(String) : [""] };
    case "long":
      return { ...out, model: typeof a.model === "string" ? a.model : "" };
    case "numeric":
      return { ...out, numeric: a.value == null ? "" : String(a.value), tolerance: a.tolerance == null ? "0" : String(a.tolerance) };
    case "matching":
      return { ...out, pairs: opts.map((p) => ({ left: String((p as Pair).left ?? ""), right: String((p as Pair).right ?? "") })) };
    case "ordering":
      return { ...out, options: opts.map(String) };
    case "label":
      return { ...out, pins: opts.map((p) => ({ x: Number((p as Pin).x), y: Number((p as Pin).y), label: String((p as Pin).label ?? "") })) };
  }
  return out;
}

/** An AI-drafted question (ai-assist "quiz_questions") into the builder, unchecked. */
export function fromAi(raw: Record<string, unknown>): DraftQuestion | null {
  const qtype = raw.qtype as QType;
  if (!QTYPES.some((x) => x.type === qtype) || qtype === "label") return null;
  const q = blankQuestion(qtype);
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);
  const out: DraftQuestion = { ...q, prompt: s(raw.prompt), marks: Number(raw.marks) > 0 ? Math.min(20, Number(raw.marks)) : q.marks, explanation: s(raw.explanation), difficulty: (["easy", "medium", "hard"].includes(s(raw.difficulty)) ? s(raw.difficulty) : "") as DraftQuestion["difficulty"], ai: true, checked: false };
  switch (qtype) {
    case "single":
    case "multiple":
      return { ...out, options: list(raw.options), correct: Array.isArray(raw.correct) ? raw.correct.map(Number) : [Number(raw.correct ?? 0)] };
    case "true_false":
      return { ...out, tf: raw.correct !== false };
    case "short":
      return { ...out, accept: list(raw.accept).length ? list(raw.accept) : [""] };
    case "long":
      return { ...out, model: s(raw.model) };
    case "numeric":
      return { ...out, numeric: String(raw.value ?? ""), tolerance: String(raw.tolerance ?? 0) };
    case "matching":
      return { ...out, pairs: (Array.isArray(raw.pairs) ? raw.pairs : []).map((p) => ({ left: s((p as Pair).left), right: s((p as Pair).right) })) };
    case "ordering":
      return { ...out, options: list(raw.items ?? raw.options) };
  }
  return out;
}

export const totalMarks = (qs: DraftQuestion[]) => Math.round(qs.reduce((a, q) => a + (Number(q.marks) || 0), 0) * 100) / 100;

// ── pupil side (what quiz_start / quiz_result return) ─────────────────────
export type Choice = { i: number; text: string };
export type PupilQuestion = {
  id: string;
  qtype: QType;
  prompt: string;
  marks: number;
  image_path: string | null;
  choices?: Choice[];
  pick?: number;
  lefts?: Choice[];
  rights?: Choice[];
  pins?: { i: number; x: number; y: number }[];
  bank?: Choice[];
};
export type Responses = Record<string, unknown>;
export type StartPayload = { attempt_id: string; attempt_no: number; max_attempts: number; deadline_at: string | null; server_now: string; responses: Responses; questions: PupilQuestion[] };
export type ResultQuestion = {
  id: string;
  qtype: QType;
  prompt: string;
  marks: number;
  image_path: string | null;
  response: unknown;
  awarded: number | null;
  correct: boolean | null;
  options?: unknown[];
  answer?: Record<string, unknown>;
  explanation?: string | null;
};
export type QuizResult = { attempt_id: string; attempt_no: number; title: string; submitted_at: string | null; score: number | null; total: number | null; needs_marking: boolean; answers_shown: boolean; show_answers: string; due_at: string; questions: ResultQuestion[] };
export type QuizInfo = {
  title: string;
  instructions: string | null;
  due_at: string;
  questions: number;
  total: number;
  time_limit_minutes: number | null;
  max_attempts: number;
  attempts_used: number;
  open_attempt: string | null;
  accepts: boolean;
  finished: { id: string; attempt_no: number; score: number | null; total: number | null; needs_marking: boolean; submitted_at: string }[];
};

/** Has the pupil given any answer to this question? */
export function answered(q: PupilQuestion, r: unknown): boolean {
  if (r === undefined || r === null) return false;
  if (typeof r === "string") return r.trim() !== "";
  if (Array.isArray(r)) return r.length > 0;
  if (typeof r === "object") return Object.keys(r as object).length > 0;
  return true;
}

export const QUIZ_ERRORS: Record<string, string> = {
  not_your_quiz: "This quiz isn't set for you.",
  quiz_closed: "This quiz has closed. It no longer takes answers after the due time.",
  no_attempts_left: "You have used all your attempts at this quiz.",
  quiz_empty: "Your teacher hasn't added the questions yet.",
  not_finished: "This attempt isn't finished yet.",
};

export function quizError(message: string | undefined): string {
  const key = Object.keys(QUIZ_ERRORS).find((k) => (message || "").includes(k));
  return key ? QUIZ_ERRORS[key] : "Something went wrong. Check your connection and try again.";
}

export const fmtMarks = (n: number | null | undefined) => (n == null ? "–" : String(Math.round(Number(n) * 100) / 100));
