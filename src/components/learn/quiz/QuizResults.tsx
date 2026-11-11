"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SidePanel, Loading } from "@/components/learn/kit";
import { Status, ui } from "@/components/learn/ui";
import { useClassRoster } from "@/components/learn/class/PupilPicker";
import { QuizResultView } from "@/components/learn/quiz/QuizResultView";
import { fmtMarks, quizError, type QuizResult } from "@/lib/learn/quiz";

type Attempt = { id: string; child_id: string; attempt_no: number; started_at: string; submitted_at: string | null; score: number | null; total: number | null; needs_marking: boolean };

/**
 * A quiz's results for the teacher: every pupil it was set for, their best attempt and whether
 * anything needs marking. Pressing a pupil opens their answers beside the list, with marks boxes
 * for long answers; saving updates the pupil's mark straight away (quiz_mark, migration 0205).
 */
export function QuizResults({ homeworkId, classId }: { homeworkId: string; classId: string }) {
  const roster = useClassRoster(classId);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [open, setOpen] = useState<{ childId: string; name: string; attemptId: string } | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mark" | "missing">("all");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.from("homework_quiz_attempts").select("id, child_id, attempt_no, started_at, submitted_at, score, total, needs_marking").eq("homework_id", homeworkId).order("attempt_no");
    setAttempts((data as Attempt[] | null) || []);
  }, [homeworkId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load
    load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !open) return;
    let alive = true;
    supabase.rpc("quiz_result", { p_attempt: open.attemptId }).then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(quizError(err.message));
      else setResult(data as QuizResult);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (roster === null || attempts === null) return <Loading label="Loading results" />;

  const rows = roster.map((p) => {
    const mine = attempts.filter((a) => a.child_id === p.id);
    const finished = mine.filter((a) => a.submitted_at);
    const best = [...finished].sort((a, b) => Number(b.score ?? -1) - Number(a.score ?? -1))[0] || null;
    const inProgress = mine.find((a) => !a.submitted_at) || null;
    return { p, mine, best, inProgress, toMark: finished.some((a) => a.needs_marking) };
  });
  const shown = rows.filter((r) => (filter === "mark" ? r.toMark : filter === "missing" ? !r.best && !r.inProgress : true));
  const done = rows.filter((r) => r.best);
  const avg = done.length ? Math.round((done.reduce((a, r) => a + (r.best!.total ? Number(r.best!.score || 0) / Number(r.best!.total) : 0), 0) / done.length) * 100) : null;

  return (
    <div className="space-y-4" data-guide="quiz-results">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `Everyone (${rows.length})`],
            ["mark", `To mark (${rows.filter((r) => r.toMark).length})`],
            ["missing", `Not started (${rows.filter((r) => !r.best && !r.inProgress).length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={filter === k ? ui.chipOn : ui.chip}>
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-sm text-ink/70">
          {done.length} of {rows.length} handed in{avg !== null ? ` · average ${avg}%` : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gold-light bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Quiz results</caption>
          <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-ink/65">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">Pupil</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              <th scope="col" className="px-3 py-2 font-semibold">Best score</th>
              <th scope="col" className="px-3 py-2 font-semibold">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ p, mine, best, inProgress, toMark }) => (
              <tr key={p.id} className="border-t border-gold-light/60">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {best ? (
                    <button type="button" className="text-left text-ink hover:text-forest-700 hover:underline" onClick={() => (setResult(null), setError(null), setOpen({ childId: p.id, name: p.name, attemptId: best.id }))}>
                      {p.name}
                    </button>
                  ) : (
                    <span className="text-ink">{p.name}</span>
                  )}
                </th>
                <td className="px-3 py-2">{toMark ? <Status kind="attention">To mark</Status> : best ? <Status kind="completed">Handed in</Status> : inProgress ? <Status kind="in_progress">In progress</Status> : <Status kind="pending">Not started</Status>}</td>
                <td className="px-3 py-2 tabular-nums">{best ? `${fmtMarks(best.score)} / ${fmtMarks(best.total)}` : "–"}</td>
                <td className="px-3 py-2 tabular-nums text-ink/70">{mine.length || "–"}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink/65">
                  Nobody here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <SidePanel title={open.name} eyebrow="Quiz answers" size="lg" onClose={() => setOpen(null)}>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : !result ? (
            <Loading label="Loading answers" />
          ) : (
            <>
              {attempts.filter((a) => a.child_id === open.childId && a.submitted_at).length > 1 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {attempts
                    .filter((a) => a.child_id === open.childId && a.submitted_at)
                    .map((a) => (
                      <button key={a.id} type="button" aria-pressed={a.id === open.attemptId} onClick={() => (setResult(null), setOpen({ ...open, attemptId: a.id }))} className={a.id === open.attemptId ? ui.chipOn : ui.chip}>
                        Attempt {a.attempt_no}: {fmtMarks(a.score)}
                      </button>
                    ))}
                </div>
              )}
              <QuizResultView
                result={result}
                pupilName={open.name}
                onMark={async (marks) => {
                  const supabase = getSupabaseClient();
                  if (!supabase) return;
                  const { data, error: err } = await supabase.rpc("quiz_mark", { p_attempt: open.attemptId, p_marks: marks });
                  if (err) return setError(quizError(err.message));
                  setResult(data as QuizResult);
                  load();
                }}
              />
            </>
          )}
        </SidePanel>
      )}
    </div>
  );
}
