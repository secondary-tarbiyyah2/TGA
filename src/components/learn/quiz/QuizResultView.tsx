"use client";

import { useState } from "react";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { QuizImage } from "@/components/learn/quiz/QuizImage";
import { QTYPE_LABEL, fmtMarks, type QuizResult, type ResultQuestion } from "@/lib/learn/quiz";

type Pair = { left: string; right: string };
type Pin = { x: number; y: number; label: string };

const str = (v: unknown) => (v == null ? "" : String(v));

/** What the pupil answered, in words. */
function YourAnswer({ q }: { q: ResultQuestion }) {
  const r = q.response;
  const opts = (q.options || []) as unknown[];
  if (r === undefined || r === null || (typeof r === "string" && !r.trim()) || (Array.isArray(r) && !r.length)) return <span className="text-ink/60">No answer</span>;
  switch (q.qtype) {
    case "single":
      return <span>{str(opts[Number(r)]) || "–"}</span>;
    case "multiple":
      return <span>{(r as number[]).map((i) => str(opts[i])).join(", ")}</span>;
    case "true_false":
      return <span>{r ? "True" : "False"}</span>;
    case "ordering":
      return (
        <ol className="list-decimal pl-5">
          {(r as number[]).map((i, k) => (
            <li key={k}>{str(opts[i])}</li>
          ))}
        </ol>
      );
    case "matching": {
      const m = r as Record<string, number>;
      return (
        <ul className="space-y-0.5">
          {(opts as Pair[]).map((p, i) => (
            <li key={i}>
              {p.left} <span className="text-ink/50">to</span> {m[i] != null ? str((opts as Pair[])[m[i]]?.right) : <span className="text-ink/60">not matched</span>}
            </li>
          ))}
        </ul>
      );
    }
    case "label": {
      const m = r as Record<string, number>;
      return (
        <ul className="space-y-0.5">
          {(opts as Pin[]).map((p, i) => (
            <li key={i}>
              {i + 1}: {m[i] != null ? str((opts as Pin[])[m[i]]?.label) : <span className="text-ink/60">not named</span>}
            </li>
          ))}
        </ul>
      );
    }
    default:
      return <span className="whitespace-pre-wrap">{str(r)}</span>;
  }
}

/** The right answer, in words (only when answers are shown). */
function RightAnswer({ q }: { q: ResultQuestion }) {
  const a = q.answer || {};
  const opts = (q.options || []) as unknown[];
  switch (q.qtype) {
    case "single":
      return <>{str(opts[Number(a.correct)])}</>;
    case "multiple":
      return <>{((a.correct as number[]) || []).map((i) => str(opts[i])).join(", ")}</>;
    case "true_false":
      return <>{a.correct ? "True" : "False"}</>;
    case "short":
      return <>{((a.accept as string[]) || []).join(" or ")}</>;
    case "numeric":
      return (
        <>
          {str(a.value)}
          {Number(a.tolerance) > 0 ? ` (give or take ${str(a.tolerance)})` : ""}
        </>
      );
    case "long":
      return a.model ? <span className="whitespace-pre-wrap">{str(a.model)}</span> : null;
    case "ordering":
      return <>{opts.map(str).join(", then ")}</>;
    case "matching":
      return <>{(opts as Pair[]).map((p) => `${p.left}: ${p.right}`).join("; ")}</>;
    case "label":
      return <>{(opts as Pin[]).map((p, i) => `${i + 1}: ${p.label}`).join("; ")}</>;
    default:
      return null;
  }
}

/**
 * A finished quiz, question by question: what was answered, marks, and (when the quiz shows
 * answers) the right answer and the explanation. For staff (`onMark`), questions a teacher marks
 * (long answers and short answers that were not on the list) get a marks box.
 */
export function QuizResultView({ result, onMark, pupilName }: { result: QuizResult; onMark?: (marks: Record<string, number | null>) => Promise<void>; pupilName?: string }) {
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toMark = result.questions.filter((q) => q.awarded == null || q.qtype === "long" || q.qtype === "short");
  const pct = result.total ? Math.round((Number(result.score || 0) / Number(result.total)) * 100) : null;

  const save = async () => {
    if (!onMark) return;
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(marks)) if (v.trim() !== "") out[k] = Number(v);
    setBusy(true);
    await onMark(out);
    setBusy(false);
    setMarks({});
  };

  return (
    <div className="space-y-5">
      <section aria-label="Score" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gold-light bg-white p-4">
        <div>
          <p className="t-eyebrow">{pupilName ? `${pupilName}, attempt ${result.attempt_no}` : `Attempt ${result.attempt_no}`}</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {fmtMarks(result.score)} <span className="text-base font-normal text-ink/65">out of {fmtMarks(result.total)}</span>
            {pct !== null && <span className="ml-2 text-base font-normal text-ink/65">({pct}%)</span>}
          </p>
        </div>
        <p className="text-sm text-ink/70">
          {result.needs_marking ? "Some answers are waiting for the teacher to mark, so the score may go up." : "Marked."}
          {!result.answers_shown && (result.show_answers === "after_due" ? " The right answers appear after the due time." : " Your teacher will go through the answers.")}
        </p>
      </section>

      <ol className="space-y-3">
        {result.questions.map((q, i) => {
          const tone = q.awarded == null ? "pending" : q.correct ? "right" : Number(q.awarded) > 0 ? "part" : "wrong";
          return (
            <li key={q.id} className="rounded-xl border border-gold-light bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cream px-2 text-xs font-semibold tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="t-eyebrow">{QTYPE_LABEL[q.qtype]}</p>
                  <p className="whitespace-pre-wrap text-sm font-medium text-ink">{q.prompt}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone === "right" ? "text-forest-700" : tone === "wrong" ? "text-red-700" : tone === "part" ? "text-amber-900" : "text-ink/70"}`}>
                  <Icon name={tone === "right" ? "circleCheck" : tone === "wrong" ? "x" : tone === "part" ? "circleAlert" : "hourglass"} size="sm" />
                  {tone === "pending" ? "To be marked" : `${fmtMarks(q.awarded)} / ${fmtMarks(q.marks)}`}
                </span>
              </div>
              {q.image_path && (
                <div className="mt-3">
                  <QuizImage path={q.image_path} pins={q.qtype === "label" ? ((q.options || []) as Pin[]) : undefined} />
                </div>
              )}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-ink/65">{pupilName ? "Answer" : "Your answer"}</dt>
                <dd className="text-ink">
                  <YourAnswer q={q} />
                </dd>
                {result.answers_shown && q.answer && (
                  <>
                    <dt className="text-ink/65">{q.qtype === "long" ? "Model answer" : "Right answer"}</dt>
                    <dd className="text-ink">
                      <RightAnswer q={q} />
                    </dd>
                  </>
                )}
                {result.answers_shown && q.explanation && (
                  <>
                    <dt className="text-ink/65">Why</dt>
                    <dd className="text-ink/85">{q.explanation}</dd>
                  </>
                )}
              </dl>
              {onMark && toMark.some((x) => x.id === q.id) && (
                <label className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-cream/60 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">Marks for this answer</span>
                  <input type="number" min={0} max={q.marks} step={0.5} value={marks[q.id] ?? (q.awarded == null ? "" : String(q.awarded))} onChange={(e) => setMarks((m) => ({ ...m, [q.id]: e.target.value }))} className={`${ui.input} !w-24 tabular-nums`} aria-label={`Marks for question ${i + 1}`} />
                  <span className="text-ink/65">out of {fmtMarks(q.marks)}</span>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      {onMark && toMark.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ui.btnPrimary} disabled={busy || Object.keys(marks).length === 0} onClick={save}>
            {busy ? "Saving…" : "Save marks"}
          </button>
          <span className="text-xs text-ink/65">The score and the pupil&apos;s mark update straight away.</span>
        </div>
      )}
    </div>
  );
}
