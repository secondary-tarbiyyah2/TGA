import type { QuizAnswers, QuizConfig, QuizQuestion, RuleCondition } from "./schema";

function conditionMatches(condition: RuleCondition, answers: QuizAnswers): boolean {
  const actual = answers[condition.questionKey];
  if (actual === undefined) return false;
  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) ? condition.value.includes(actual) : false;
    case "not_in":
      return Array.isArray(condition.value) ? !condition.value.includes(actual) : true;
    default:
      return false;
  }
}

/** A question with an active showWhen rule is visible only once every AND'd condition matches. */
export function isQuestionVisible(question: QuizQuestion, answers: QuizAnswers): boolean {
  if (!question.showWhen || question.showWhen.length === 0) return true;
  return question.showWhen.every((c) => conditionMatches(c, answers));
}

export type EvaluatedResult = {
  texts: string[];
  flags: { text: string; tone: "info" | "warning" }[];
  startingPoints: Partial<Record<"arabic" | "quran", string>>;
};

/**
 * The no-code rules engine's evaluator: runs every active rule's condition
 * group (AND or OR, per rule) against the family's answers and collects
 * whichever actions matched, in rule order. Deliberately simple and pure
 * (no network, no randomness) so the exact same function powers the public
 * result screen AND the admin's "preview as a parent" tool — they can never
 * disagree about what a given set of answers produces.
 */
export function evaluateRules(config: QuizConfig, answers: QuizAnswers): EvaluatedResult {
  const result: EvaluatedResult = { texts: [], flags: [], startingPoints: {} };

  const activeRules = [...config.rules].filter((r) => r.active).sort((a, b) => a.order - b.order);

  for (const rule of activeRules) {
    if (rule.conditions.length === 0) continue;
    const matched =
      rule.match === "all"
        ? rule.conditions.every((c) => conditionMatches(c, answers))
        : rule.conditions.some((c) => conditionMatches(c, answers));
    if (!matched) continue;

    switch (rule.action.type) {
      case "show_text":
        result.texts.push(rule.action.text);
        break;
      case "show_flag":
        result.flags.push({ text: rule.action.text, tone: rule.action.tone });
        break;
      case "recommend_start":
        result.startingPoints[rule.action.subject] = rule.action.startingPoint;
        break;
    }
  }

  return result;
}
