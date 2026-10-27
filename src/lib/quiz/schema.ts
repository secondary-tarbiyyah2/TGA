/**
 * Shared shape for "Your Child's Week"– the public quiz
 * (src/components/eligibility/YourChildsWeekQuiz.tsx) and the admin
 * quiz/rules builder (src/app/learn/admin/quiz) both read and write this
 * same TS shape. A whole config is stored as ONE jsonb blob per
 * quiz_config_versions row (0016_eligibility_quiz_v2.sql) · draft, review,
 * published or archived, so publishing/reverting is a single atomic
 * status flip on one row, never a half-published mix of old and new
 * questions.
 *
 * No PII ever lives in this shape, it is copy and rules only. Answers
 * given by a real family live in quiz_sessions (anonymous) and, only after
 * consent, quiz_leads.
 */

export type LineIcon =
  | "book" | "moon" | "graduation-cap" | "clock" | "home" | "compass"
  | "sprout" | "letters" | "speech" | "pages" | "bookmark" | "target" | "scales" | "user-check" | "users" | "user-away"
  | "none";

export type QuestionType = "year_group" | "timezone" | "single_select";

export type QuizOption = {
  value: string;
  label: string;
  detail?: string;
  icon?: LineIcon;
};

export type RuleOperator = "equals" | "not_equals" | "in" | "not_in";

export type RuleCondition = {
  questionKey: string;
  operator: RuleOperator;
  value: string | string[];
};

export type RuleAction =
  | { type: "show_text"; text: string }
  | { type: "show_flag"; text: string; tone: "info" | "warning" }
  | { type: "recommend_start"; subject: "arabic" | "quran"; startingPoint: string };

export type QuizRule = {
  id: string;
  name: string;
  match: "all" | "any";
  conditions: RuleCondition[];
  action: RuleAction;
  order: number;
  active: boolean;
};

export type QuizQuestion = {
  key: string; // stable machine key, referenced by RuleCondition.questionKey; never renamed once rules use it
  step: number; // which visible step (1..N) this question appears on, two questions can share a step (e.g. Arabic + Qur'an level both on step 3), rendered together under one "Question X of N" progress label
  order: number; // ordering within its step, and of steps themselves
  title: string;
  subtitle?: string;
  type: QuestionType;
  options: QuizOption[]; // ignored for type "year_group" (sourced live from year_groups) and "timezone" (uses TIMEZONE_OPTIONS)
  active: boolean; // show/hide toggle
  showWhen?: RuleCondition[]; // simple AND show-rule against earlier answers; empty/undefined = always shown
};

export type ResultSectionKey =
  | "sample_week"
  | "starting_points"
  | "fees"
  | "timezone_flag"
  | "hifz_role_note"
  | "ctas";

export type ResultSection = {
  key: ResultSectionKey;
  order: number;
  active: boolean;
};

export type QuizConfig = {
  schemaVersion: 1;
  intro: { kicker: string; title: string; body: string };
  questions: QuizQuestion[];
  rules: QuizRule[];
  resultSections: ResultSection[];
  disclaimer: string;
  consentText: string;
  resultHeading: string; // supports {name} token, capitalised at render time
};

export type QuizAnswers = Record<string, string>;

export function sortedActive<T extends { order: number; active: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.active).sort((a, b) => a.order - b.order);
}

/** Groups active questions by their `step`, in ascending step order, used by both the public quiz and the admin preview. */
export function questionsByStep(questions: QuizQuestion[]): { step: number; questions: QuizQuestion[] }[] {
  const active = questions.filter((q) => q.active);
  const steps = Array.from(new Set(active.map((q) => q.step))).sort((a, b) => a - b);
  return steps.map((step) => ({
    step,
    questions: active.filter((q) => q.step === step).sort((a, b) => a.order - b.order),
  }));
}
