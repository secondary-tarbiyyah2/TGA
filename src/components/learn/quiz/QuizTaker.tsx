"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FocusView } from "@/components/learn/FocusView";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { askConfirm } from "@/components/learn/kit";
import { QuizImage } from "@/components/learn/quiz/QuizImage";
import { QuizResultView } from "@/components/learn/quiz/QuizResultView";
import { QTYPE_LABEL, answered, quizError, type PupilQuestion, type QuizResult, type Responses, type StartPayload } from "@/lib/learn/quiz";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const backupKey = (attempt: string) => `tga-quiz-${attempt}`;

function readBackup(attempt: string): Responses | null {
  try {
    const raw = localStorage.getItem(backupKey(attempt));
    return raw ? (JSON.parse(raw) as Responses) : null;
  } catch {
    return null;
  }
}
function writeBackup(attempt: string, r: Responses) {
  try {
    localStorage.setItem(backupKey(attempt), JSON.stringify(r));
  } catch {
    /* private window: the server copy is enough */
  }
}
function clearBackup(attempt: string) {
  try {
    localStorage.removeItem(backupKey(attempt));
  } catch {
    /* ignore */
  }
}

const choiceCls = (on: boolean) =>
  `flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-[0.9375rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 ${on ? "border-forest-700 bg-forest-50 text-ink ring-1 ring-inset ring-forest-700" : "border-gold-light bg-white text-ink hover:border-ink/25"}`;
const chipCls = (on: boolean) => `min-h-11 rounded-full border px-3.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700 sm:min-h-9 ${on ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light bg-white text-ink hover:border-ink/25"}`;

/** The answer area for one question, suited to its type. */
function Answer({ q, value, onChange }: { q: PupilQuestion; value: unknown; onChange: (v: unknown) => void }) {
  switch (q.qtype) {
    case "single":
      return (
        <div role="radiogroup" aria-label="Choose one answer" className="space-y-2">
          {q.choices!.map((c, k) => (
            <button key={c.i} type="button" role="radio" aria-checked={value === c.i} onClick={() => onChange(c.i)} className={choiceCls(value === c.i)}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${value === c.i ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light text-ink/70"}`}>{String.fromCharCode(65 + k)}</span>
              {c.text}
            </button>
          ))}
        </div>
      );
    case "multiple": {
      const picked = Array.isArray(value) ? (value as number[]) : [];
      return (
        <div role="group" aria-label={q.pick ? `Tick ${q.pick} answers` : "Tick every right answer"} className="space-y-2">
          {q.pick ? <p className="text-sm text-ink/70">Tick {q.pick}.</p> : null}
          {q.choices!.map((c) => {
            const on = picked.includes(c.i);
            return (
              <button key={c.i} type="button" role="checkbox" aria-checked={on} onClick={() => onChange(on ? picked.filter((x) => x !== c.i) : [...picked, c.i])} className={choiceCls(on)}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light"}`}>{on && <Icon name="check" size="sm" />}</span>
                {c.text}
              </button>
            );
          })}
        </div>
      );
    }
    case "true_false":
      return (
        <div role="radiogroup" aria-label="True or false" className="grid grid-cols-2 gap-3 sm:max-w-md">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`${choiceCls(value === v)} justify-center font-medium`}>
              {v ? "True" : "False"}
            </button>
          ))}
        </div>
      );
    case "short":
      return <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} maxLength={300} aria-label="Your answer" placeholder="Your answer" className={`${ui.input} max-w-lg !text-base`} autoComplete="off" />;
    case "numeric":
      return <input type="text" inputMode="decimal" value={typeof value === "string" ? value : value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} maxLength={40} aria-label="Your answer (a number)" placeholder="A number" className={`${ui.input} max-w-xs !text-base tabular-nums`} autoComplete="off" />;
    case "long":
      return <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} rows={8} maxLength={8000} aria-label="Your answer" placeholder="Write your answer" className={`${ui.textarea} !text-base`} />;
    case "ordering": {
      const order = Array.isArray(value) && (value as number[]).length === q.choices!.length ? (value as number[]) : q.choices!.map((c) => c.i);
      const text = (i: number) => q.choices!.find((c) => c.i === i)?.text || "";
      const move = (k: number, d: number) => {
        const j = k + d;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[k], next[j]] = [next[j], next[k]];
        onChange(next);
      };
      return (
        <ol className="space-y-2" aria-label="Put these in order, first at the top">
          {order.map((i, k) => (
            <li key={i} className="flex items-center gap-2 rounded-xl border border-gold-light bg-white px-3 py-2">
              <span className="w-6 text-right text-sm font-semibold tabular-nums text-ink/60">{k + 1}.</span>
              <span className="min-w-0 flex-1 text-[0.9375rem] text-ink">{text(i)}</span>
              <button type="button" className={ui.btnIcon} aria-label={`Move "${text(i)}" up`} disabled={k === 0} onClick={() => move(k, -1)}>
                <Icon name="chevronUp" size="sm" />
              </button>
              <button type="button" className={ui.btnIcon} aria-label={`Move "${text(i)}" down`} disabled={k === order.length - 1} onClick={() => move(k, 1)}>
                <Icon name="chevronDown" size="sm" />
              </button>
            </li>
          ))}
        </ol>
      );
    }
    case "matching":
    case "label": {
      const m = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, number>) : {};
      const rows = q.qtype === "matching" ? q.lefts! : q.pins!.map((p) => ({ i: p.i, text: `Pin ${p.i + 1}` }));
      const options = q.qtype === "matching" ? q.rights! : q.bank!;
      return (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.i} className="border-t border-gold-light/70 pt-3 first:border-0 first:pt-0">
              <p className="mb-2 text-[0.9375rem] font-medium text-ink">{r.text}</p>
              <div role="radiogroup" aria-label={`Match for ${r.text}`} className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <button key={o.i} type="button" role="radio" aria-checked={m[r.i] === o.i} onClick={() => onChange({ ...m, [r.i]: o.i })} className={chipCls(m[r.i] === o.i)}>
                    {o.text}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      );
    }
  }
  return null;
}

/**
 * A pupil sitting a quiz (owner, 11 Nov 2026, item 17): full screen, one question at a time with
 * a numbered navigator, the server's clock when it is timed, answers saved as they go (and kept
 * in the browser if the connection drops), a check before handing in, then the result. The
 * questions arrive without their answers and are marked on the server (migration 0206).
 */
export function QuizTaker({ homeworkId, title, onClose, onFinished }: { homeworkId: string; title: string; onClose: () => void; onFinished?: () => void }) {
  const [start, setStart] = useState<StartPayload | null>(null);
  const [responses, setResponses] = useState<Responses>({});
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [left, setLeft] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Responses>({});
  const submitted = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc("quiz_start", { p_homework: homeworkId }).then(({ data, error: err }) => {
      if (err) return setError(quizError(err.message));
      const s = data as StartPayload;
      offset.current = new Date(s.server_now).getTime() - Date.now();
      const merged = { ...(s.responses || {}), ...(readBackup(s.attempt_id) || {}) };
      latest.current = merged;
      setResponses(merged);
      setStart(s);
    });
  }, [homeworkId]);

  const saveNow = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !start || submitted.current) return;
    setSaving("saving");
    const { data, error: err } = await supabase.rpc("quiz_save", { p_attempt: start.attempt_id, p_responses: latest.current });
    if (err) return setSaving("offline");
    const r = data as { ok: boolean; submitted?: boolean };
    if (r.submitted && !submitted.current) {
      // Time ran out on the server: show what was handed in.
      submitted.current = true;
      const res = await supabase.rpc("quiz_result", { p_attempt: start.attempt_id });
      clearBackup(start.attempt_id);
      if (!res.error) setResult(res.data as QuizResult);
      onFinished?.();
      return;
    }
    setSaving("saved");
  }, [start, onFinished]);

  const setAnswer = (qid: string, v: unknown) => {
    const next = { ...latest.current, [qid]: v };
    latest.current = next;
    setResponses(next);
    if (start) writeBackup(start.attempt_id, next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 800);
  };

  const submit = useCallback(
    async (auto = false) => {
      const supabase = getSupabaseClient();
      if (!supabase || !start || submitted.current) return;
      const blank = start.questions.filter((q) => !answered(q, latest.current[q.id])).length;
      if (!auto && !(await askConfirm(blank ? `You haven't answered ${blank} question${blank === 1 ? "" : "s"}. Hand in anyway?` : "Hand in your quiz? You can't change your answers after this.", { confirmLabel: "Hand in", cancelLabel: "Keep going" }))) return;
      if (timer.current) clearTimeout(timer.current);
      submitted.current = true;
      setBusy(true);
      const { data, error: err } = await supabase.rpc("quiz_submit", { p_attempt: start.attempt_id, p_responses: latest.current });
      setBusy(false);
      if (err) {
        submitted.current = false;
        return setError(`${quizError(err.message)} Your answers are saved; press Hand in again.`);
      }
      clearBackup(start.attempt_id);
      setResult(data as QuizResult);
      onFinished?.();
    },
    [start, onFinished],
  );

  // The clock: the server's deadline, corrected for this device's clock.
  useEffect(() => {
    if (!start?.deadline_at || result) return;
    const end = new Date(start.deadline_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - (Date.now() + offset.current)) / 1000));
      setLeft(s);
      if (s <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [start, result, submit]);

  // Save when the pupil leaves the tab or comes back online.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveNow();
    const onOnline = () => saveNow();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, [saveNow]);

  const qs = start?.questions || [];
  const q = qs[index];
  const done = qs.filter((x) => answered(x, responses[x.id])).length;
  const warn = left !== null && left <= 60 ? "bg-red-50 text-red-800 ring-red-200" : left !== null && left <= 300 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-ink ring-gold-light";

  return (
    <FocusView
      title={title}
      eyebrow={result ? "Quiz result" : start ? `Quiz · attempt ${start.attempt_no} of ${start.max_attempts}` : "Quiz"}
      backLabel={result ? "Done" : "Save and leave"}
      width="reading"
      dataGuide="quiz-taker"
      onClose={onClose}
      beforeClose={() => (result || !start ? true : (saveNow(), askConfirm(left !== null ? "Your answers are saved. The timer keeps going while you are away, and the quiz hands itself in when time is up." : "Your answers are saved. Come back to finish and hand in.", { confirmLabel: "Leave", cancelLabel: "Stay" })))}
      actions={
        !result && start ? (
          <>
            <span className="text-xs text-ink/60" aria-live="polite">
              {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "offline" ? "Not saved yet: it will try again" : ""}
            </span>
            {left !== null && (
              <span role="timer" aria-label={`${Math.ceil(left / 60)} minutes left`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-base font-semibold tabular-nums ring-1 ${warn}`}>
                <Icon name="timer" size="sm" />
                {mmss(left)}
              </span>
            )}
            <button type="button" className={ui.btnPrimary} onClick={() => (reviewing ? submit() : setReviewing(true))} disabled={busy}>
              {busy ? "Handing in…" : reviewing ? "Hand in" : "Finish"}
            </button>
          </>
        ) : undefined
      }
    >
      {error && !start ? (
        <div className="rounded-xl border border-gold-light bg-white p-6 text-center">
          <p className="text-base font-medium text-ink">{error}</p>
          <button type="button" className={`${ui.btnSecondary} mt-4`} onClick={onClose}>
            Back
          </button>
        </div>
      ) : result ? (
        <QuizResultView result={result} />
      ) : !start ? (
        <div className="h-60 motion-safe:animate-pulse rounded-xl bg-white" aria-label="Loading the quiz" />
      ) : reviewing ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-gold-light bg-white p-5">
            <h3 className="t-section">Check before you hand in</h3>
            <p className="mt-1 text-sm text-ink/70">
              You have answered {done} of {qs.length}. Press a number to go back to it.
            </p>
            <ol className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
              {qs.map((x, i) => {
                const a = answered(x, responses[x.id]);
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => (setIndex(i), setReviewing(false))} className={`flex h-11 w-full items-center justify-center rounded-lg border text-sm font-semibold tabular-nums ${a ? "border-forest-700 bg-forest-50 text-forest-900" : "border-amber-300 bg-amber-50 text-amber-900"}`} aria-label={`Question ${i + 1}: ${a ? "answered" : "not answered"}`}>
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.btnPrimary} onClick={() => submit()} disabled={busy}>
              {busy ? "Handing in…" : "Hand in"}
            </button>
            <button type="button" className={ui.btnSecondary} onClick={() => setReviewing(false)}>
              Back to the questions
            </button>
          </div>
        </div>
      ) : (
        q && (
          <div className="space-y-5">
            <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
              {qs.map((x, i) => {
                const a = answered(x, responses[x.id]);
                return (
                  <button key={x.id} type="button" onClick={() => setIndex(i)} aria-current={i === index ? "step" : undefined} aria-label={`Question ${i + 1}${a ? ", answered" : ""}`} className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold tabular-nums ${i === index ? "border-forest-700 bg-forest-700 text-white" : a ? "border-forest-700/40 bg-forest-50 text-forest-900" : "border-gold-light bg-white text-ink/70"}`}>
                    {i + 1}
                  </button>
                );
              })}
            </nav>
            <section aria-labelledby="quiz-q" className="rounded-xl border border-gold-light bg-white p-5">
              <p className="t-eyebrow">
                Question {index + 1} of {qs.length} · {QTYPE_LABEL[q.qtype]} · {q.marks} mark{Number(q.marks) === 1 ? "" : "s"}
              </p>
              <h3 id="quiz-q" className="mt-1 whitespace-pre-wrap text-lg font-medium leading-snug text-ink">
                {q.prompt}
              </h3>
              {q.image_path && (
                <div className="mt-4">
                  <QuizImage path={q.image_path} pins={q.qtype === "label" ? q.pins : undefined} />
                </div>
              )}
              <div className="mt-5">
                <Answer q={q} value={responses[q.id]} onChange={(v) => setAnswer(q.id, v)} />
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={ui.btnSecondary} disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                <Icon name="chevronLeft" size="sm" />
                Previous
              </button>
              {index < qs.length - 1 ? (
                <button type="button" className={ui.btnPrimary} onClick={() => setIndex((i) => i + 1)}>
                  Next
                  <Icon name="chevronRight" size="sm" />
                </button>
              ) : (
                <button type="button" className={ui.btnPrimary} onClick={() => setReviewing(true)}>
                  Check and hand in
                </button>
              )}
              <span className="ml-auto text-sm text-ink/65">
                {done} of {qs.length} answered
              </span>
            </div>
          </div>
        )
      )}
    </FocusView>
  );
}
