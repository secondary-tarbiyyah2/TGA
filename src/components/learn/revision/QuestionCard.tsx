"use client";

import { useMemo, useState } from "react";
import { displayOrder, type AnswerResult, type PupilQuestion } from "@/lib/learn/revision";
import { WithArabic } from "@/components/learn/WithArabic";

const LETTERS = "ABCDEF";

/**
 * One multiple-choice question. The pupil's browser doesn't know the answer:
 * `onAnswer` sends the choice to the server, which marks it and returns the
 * right answer and an explanation.
 */
export function QuestionCard({
  q,
  onAnswer,
  allowHint,
  footer,
}: {
  q: PupilQuestion;
  onAnswer: (choice: number, usedHint: boolean) => Promise<AnswerResult>;
  allowHint?: boolean;
  footer?: (result: AnswerResult) => React.ReactNode;
}) {
  const order = useMemo(() => displayOrder(q.options.length, q.id), [q.id, q.options.length]);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (original: number) => {
    if (busy || result) return;
    setBusy(true);
    setError(null);
    setPicked(original);
    try {
      setResult(await onAnswer(original, hint));
    } catch (e) {
      setPicked(null);
      setError(e instanceof Error ? e.message : "Couldn't save that answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-lg font-semibold leading-snug text-ink sm:text-xl"><WithArabic text={q.question} /></p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answers">
        {order.map((original, pos) => {
          const isAnswer = result && original === result.answer;
          const isWrongPick = result && original === picked && !result.correct;
          return (
            <button
              key={original}
              type="button"
              disabled={!!result || busy}
              onClick={() => choose(original)}
              aria-pressed={picked === original}
              className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                isAnswer
                  ? "border-green-600 bg-green-50 text-green-900"
                  : isWrongPick
                    ? "border-red-600 bg-red-50 text-red-900"
                    : "border-gold-light bg-white text-ink hover:bg-cream disabled:hover:bg-white"
              }`}
            >
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cream text-xs font-semibold text-ink">
                {LETTERS[pos]}
              </span>
              <span className="min-w-0">
                <WithArabic text={q.options[original]} />
                {isAnswer && <span className="sr-only"> (correct answer)</span>}
                {isWrongPick && <span className="sr-only"> (your answer, incorrect)</span>}
              </span>
            </button>
          );
        })}
      </div>

      {!result && allowHint && q.hint && (
        hint ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong className="block">Hint</strong>
            <WithArabic text={q.hint} />
          </p>
        ) : (
          <button type="button" onClick={() => setHint(true)} className="rounded-md border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            I&apos;m stuck: show a hint
          </button>
        )
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {result && (
          <div className={`rounded-xl px-3 py-2.5 text-sm ${result.correct ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
            <strong className="block">
              {result.correct ? (hint ? "Correct, with a hint" : "Correct") : `Not quite. The answer is ${LETTERS[order.indexOf(result.answer)]}.`}
            </strong>
            <span className="text-ink">
              {!result.correct && result.note ? (
                <>
                  <WithArabic text={result.note} />{" "}
                </>
              ) : null}
              {result.explanation && <WithArabic text={result.explanation} />}
            </span>
          </div>
        )}
      </div>
      {result && footer?.(result)}
    </div>
  );
}
