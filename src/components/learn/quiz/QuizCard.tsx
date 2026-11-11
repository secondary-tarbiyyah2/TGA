"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FocusView } from "@/components/learn/FocusView";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { QuizTaker } from "@/components/learn/quiz/QuizTaker";
import { QuizResultView } from "@/components/learn/quiz/QuizResultView";
import { fmtMarks, quizError, type QuizInfo, type QuizResult } from "@/lib/learn/quiz";

type Finished = QuizInfo["finished"][number];

/**
 * A quiz on a pupil's (or parent's) homework: how many questions, the time limit, attempts used,
 * then Start / Carry on, and each finished attempt's result. Pupils sit it in `QuizTaker`;
 * parents only see finished results. Renders nothing for an old "quiz" with no questions, so the
 * ordinary hand-in form shows instead (`onNoQuestions`).
 */
export function QuizCard({ homeworkId, title, asPupil, onChanged, onNoQuestions }: { homeworkId: string; title: string; asPupil: boolean; onChanged?: () => void; onNoQuestions?: () => void }) {
  const [info, setInfo] = useState<QuizInfo | null>(null);
  const [finished, setFinished] = useState<Finished[] | null>(null);
  const [sitting, setSitting] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (asPupil) {
      const { data, error: err } = await supabase.rpc("quiz_info", { p_homework: homeworkId });
      if (err) return setError(quizError(err.message));
      const i = data as QuizInfo;
      setInfo(i);
      setFinished(i.finished);
      if (!i.questions) onNoQuestions?.();
    } else {
      const { data } = await supabase.from("homework_quiz_attempts").select("id, attempt_no, score, total, needs_marking, submitted_at").eq("homework_id", homeworkId).not("submitted_at", "is", null).order("attempt_no");
      setFinished((data as Finished[] | null) || []);
    }
  }, [asPupil, homeworkId, onNoQuestions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load
    load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !viewing) return;
    supabase.rpc("quiz_result", { p_attempt: viewing }).then(({ data, error: err }) => (err ? setError(quizError(err.message)) : setResult(data as QuizResult)));
  }, [viewing]);

  if (error) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>;
  if (finished === null) return <div className="h-16 motion-safe:animate-pulse rounded-lg bg-cream" />;
  if (asPupil && info && !info.questions) return null;

  const left = info ? info.max_attempts - info.attempts_used : 0;
  const canStart = asPupil && info && (info.open_attempt || (left > 0 && info.accepts));

  return (
    <div className="space-y-3 rounded-xl border border-gold-light bg-white p-4" data-guide="quiz-card">
      {info && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink/75">
          <li className="inline-flex items-center gap-1.5">
            <Icon name="listChecks" size="sm" />
            {info.questions} questions · {fmtMarks(info.total)} marks
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Icon name="timer" size="sm" />
            {info.time_limit_minutes ? `${info.time_limit_minutes} minutes once you start` : "No time limit"}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Icon name="rotateCcw" size="sm" />
            {info.max_attempts === 1 ? "One attempt" : `${info.attempts_used} of ${info.max_attempts} attempts used`}
          </li>
        </ul>
      )}
      {canStart && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={ui.btnPrimary} onClick={() => setSitting(true)}>
            <Icon name="play" size="sm" />
            {info!.open_attempt ? "Carry on with the quiz" : info!.attempts_used ? "Try again" : "Start the quiz"}
          </button>
          {!info!.open_attempt && info!.time_limit_minutes && <span className="text-xs text-ink/65">The timer starts when you press Start. Your answers save as you go.</span>}
        </div>
      )}
      {asPupil && info && !canStart && !finished.length && <p className="text-sm text-ink/70">{info.accepts ? "You have used all your attempts." : "This quiz has closed."}</p>}
      {finished.length > 0 && (
        <ul className="divide-y divide-gold-light/60 rounded-lg border border-gold-light/70">
          {finished.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="text-ink/70">Attempt {a.attempt_no}</span>
              <span className="font-semibold tabular-nums text-ink">
                {fmtMarks(a.score)} / {fmtMarks(a.total)}
              </span>
              {a.needs_marking && <span className="text-xs text-amber-900">Some answers are with the teacher</span>}
              <button type="button" className={`${ui.btnLink} ml-auto`} onClick={() => (setResult(null), setViewing(a.id))}>
                See answers
              </button>
            </li>
          ))}
        </ul>
      )}

      {sitting && (
        <QuizTaker
          homeworkId={homeworkId}
          title={title}
          onClose={() => {
            setSitting(false);
            load();
          }}
          onFinished={() => {
            load();
            onChanged?.();
          }}
        />
      )}
      {viewing && (
        <FocusView title={title} eyebrow="Quiz result" backLabel="Back" width="reading" onClose={() => setViewing(null)}>
          {result ? <QuizResultView result={result} /> : <div className="h-60 motion-safe:animate-pulse rounded-xl bg-white" />}
        </FocusView>
      )}
    </div>
  );
}
