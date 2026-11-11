"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FocusView } from "@/components/learn/FocusView";
import { Icon } from "@/components/learn/Icon";
import { Switch, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";
import { askConfirm } from "@/components/learn/kit";
import { PupilPicker } from "@/components/learn/class/PupilPicker";
import { announceClassworkChanged } from "@/components/learn/class/SetWorkPanel";
import { QuestionEditor, QuestionTypePicker } from "@/components/learn/quiz/QuestionEditor";
import { quizImageUrl } from "@/components/learn/quiz/QuizImage";
import { QuizAiDraft } from "@/components/learn/quiz/QuizAiDraft";
import { QuizResults } from "@/components/learn/quiz/QuizResults";
import { mimeForName, safeObjectName, uploadWithProgress } from "@/lib/learn/homeworkFiles";
import { toLocalInput } from "@/lib/learn/homework";
import { DEFAULT_SETTINGS, QTYPES, blankQuestion, fromRow, questionProblem, toRow, totalMarks, type DraftQuestion, type QType, type QuizSettings } from "@/lib/learn/quiz";

type Loaded = { title: string; instructions: string; dueAt: string; audience: string[] | null; topicId: string; blockLate: boolean };

/**
 * The quiz builder (owner, 11 Nov 2026, items 6, 15 and 17). A big task, so it has the whole
 * screen with a clear Back button (FocusView), never a long form on the class page.
 *
 * Left: the quiz's details, then its questions, built one at a time. A new question starts from
 * the question types shown as cards; each question changes type with segmented buttons (never a
 * dropdown). Right: the summary (questions, marks, mix of types), the settings (time limit,
 * attempts, shuffling, when pupils see answers), "Generate with AI" and an outline to jump about.
 *
 * Saving writes the homework row (kind 'quiz', marks = the total), its settings, any diagram
 * images and the questions (migration 0205). AI-drafted questions must each be ticked as checked
 * before the quiz can be set. "Results" lists pupils' attempts and opens one to mark.
 */
export function QuizBuilder({
  classId,
  className,
  homeworkId,
  topics,
  initialTopicId = "",
  onClose,
  onSaved,
}: {
  classId: string;
  className: string;
  /** Editing an existing quiz; leave out for a new one. */
  homeworkId?: string | null;
  topics?: { id: string; name: string }[];
  initialTopicId?: string;
  onClose: () => void;
  onSaved?: (note?: string) => void;
}) {
  const supabase = getSupabaseClient();
  const [id] = useState(() => homeworkId || crypto.randomUUID());
  const isNew = !homeworkId;
  const [loaded, setLoaded] = useState<Loaded | null>(isNew ? { title: "", instructions: "", dueAt: "", audience: null, topicId: initialTopicId, blockLate: false } : null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [audience, setAudience] = useState<string[] | null>(null);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [blockLate, setBlockLate] = useState(false);
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, { file?: File; url: string | null }>>({});
  const [attempts, setAttempts] = useState(0);
  const [view, setView] = useState<"build" | "results">("build");
  const [picking, setPicking] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Editing: read the quiz, its settings and questions (staff RLS).
  useEffect(() => {
    if (isNew || !supabase) return;
    let alive = true;
    (async () => {
      const [hw, st, qs, at] = await Promise.all([
        supabase.from("homework").select("title, instructions, due_at, assigned_child_ids, topic_id, late_policy").eq("id", id).maybeSingle(),
        supabase.from("homework_quizzes").select("shuffle_questions, shuffle_options, time_limit_minutes, max_attempts, show_answers").eq("homework_id", id).maybeSingle(),
        supabase.from("homework_quiz_questions").select("id, qtype, prompt, options, answer, marks, explanation, image_path, difficulty, drafted_by_ai").eq("homework_id", id).order("position").order("created_at"),
        supabase.from("homework_quiz_attempts").select("id", { count: "exact", head: true }).eq("homework_id", id),
      ]);
      if (!alive) return;
      const h = hw.data as { title: string; instructions: string | null; due_at: string; assigned_child_ids: string[] | null; topic_id: string | null; late_policy: string | null } | null;
      if (h) {
        setTitle(h.title);
        setInstructions(h.instructions || "");
        setDueAt(toLocalInput(h.due_at));
        setAudience(h.assigned_child_ids && h.assigned_child_ids.length ? h.assigned_child_ids : null);
        setTopicId(h.topic_id || "");
        setBlockLate(h.late_policy === "block");
      }
      if (st.data) setSettings({ ...DEFAULT_SETTINGS, ...(st.data as QuizSettings) });
      const list = ((qs.data as Parameters<typeof fromRow>[0][] | null) || []).map(fromRow);
      setQuestions(list);
      setSavedIds(list.map((q) => q.id));
      setAttempts(at.count || 0);
      const imgs: Record<string, { url: string | null }> = {};
      for (const q of list) if (q.image_path) imgs[q.id] = { url: await quizImageUrl(q.image_path) };
      if (alive) {
        setImages(imgs);
        setLoaded({ title: h?.title || "", instructions: h?.instructions || "", dueAt: h ? toLocalInput(h.due_at) : "", audience: null, topicId: h?.topic_id || "", blockLate: h?.late_policy === "block" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, isNew, supabase]);

  const total = totalMarks(questions);
  const problems = useMemo(() => questions.map((q) => questionProblem(q)), [questions]);
  const unchecked = questions.filter((q) => q.ai && !q.checked).length;
  const mix = useMemo(() => QTYPES.map((t) => ({ ...t, n: questions.filter((q) => q.qtype === t.type).length })).filter((t) => t.n > 0), [questions]);

  const edit = useCallback((fn: (qs: DraftQuestion[]) => DraftQuestion[]) => {
    setQuestions(fn);
    setDirty(true);
  }, []);
  const addQuestion = (t: QType) => {
    edit((qs) => [...qs, blankQuestion(t)]);
    setPicking(false);
  };

  const detailsProblem = !title.trim() ? "Give the quiz a title." : !dueAt ? "Choose when it is due." : audience !== null && audience.length === 0 ? "Choose at least one pupil, or set it for the whole class." : null;
  const firstProblem = detailsProblem || (questions.length === 0 ? "Add at least one question." : problems.find(Boolean) || (unchecked ? `Check the ${unchecked} AI-drafted question${unchecked === 1 ? "" : "s"} (tick each one) before setting the quiz.` : null));

  const save = async () => {
    if (!supabase) return;
    setShowProblems(true);
    if (firstProblem) {
      setError(firstProblem);
      const bad = problems.findIndex(Boolean);
      if (!detailsProblem && bad >= 0) document.getElementById(`q-${questions[bad].id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (attempts > 0 && !(await askConfirm("Pupils have already started this quiz. Changing answers or marks only changes how new attempts are marked. Save the changes?", { confirmLabel: "Save changes" }))) return;
    setBusy(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setError("You are signed out.");
      const fields = {
        title: title.trim(),
        instructions: instructions.trim() || null,
        due_at: new Date(dueAt).toISOString(),
        max_points: total,
        allowed_submission_types: ["text"],
        late_policy: blockLate ? "block" : "allow",
        assigned_child_ids: audience,
        ...(topics ? { topic_id: topicId || null } : {}),
      };
      const hwRes = isNew ? await supabase.from("homework").insert({ id, class_id: classId, teacher_id: user.id, kind: "quiz", ...fields }) : await supabase.from("homework").update(fields).eq("id", id);
      if (hwRes.error) return setError(/row-level security/.test(hwRes.error.message) ? "You don't have permission to set work for this class." : "Could not save the quiz. Try again.");

      const stRes = await supabase.from("homework_quizzes").upsert({ homework_id: id, ...settings, drafted_with_ai: questions.some((q) => q.ai), updated_at: new Date().toISOString() });
      if (stRes.error) return setError("The quiz was saved, but its settings and questions could not be. Ask the office to run the latest update, then try again.");

      // Diagrams chosen in this session upload now that the quiz exists.
      const rows: ReturnType<typeof toRow>[] = [];
      const failed: string[] = [];
      for (const [i, q] of questions.entries()) {
        let path = q.image_path;
        const pending = images[q.id]?.file;
        if (pending) {
          path = `${id}/quiz-${q.id.slice(0, 8)}-${Date.now()}-${safeObjectName(pending.name)}`;
          const up = await uploadWithProgress("homework-attachments", path, pending, mimeForName(pending.name, pending.type), pending.name, () => {});
          if (!up.ok) {
            failed.push(`question ${i + 1}`);
            path = q.image_path;
          }
        }
        rows.push(toRow({ ...q, image_path: path }, id, i + 1));
      }
      const upQ = await supabase.from("homework_quiz_questions").upsert(rows);
      if (upQ.error) return setError("The quiz was saved, but the questions could not be. Try again.");
      const removed = savedIds.filter((x) => !questions.some((q) => q.id === x));
      if (removed.length) await supabase.from("homework_quiz_questions").delete().in("id", removed);
      setSavedIds(questions.map((q) => q.id));
      setQuestions((qs) => qs.map((q, i) => ({ ...q, image_path: rows[i].image_path })));
      setImages((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { url: v.url }])));
      setDirty(false);
      announceClassworkChanged(classId);
      onSaved?.(failed.length ? `Quiz saved, but the diagram for ${failed.join(", ")} didn't upload. Open the quiz to add it again.` : undefined);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const setImage = (qid: string, f: File) => {
    setImages((m) => ({ ...m, [qid]: { file: f, url: URL.createObjectURL(f) } }));
    edit((qs) => qs.map((q) => (q.id === qid ? { ...q, pins: [] } : q)));
  };

  const seg = (on: boolean) => `min-h-11 rounded-lg px-3 text-[0.8125rem] font-medium sm:min-h-8 ${on ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70 hover:text-ink"}`;

  return (
    <FocusView
      title={isNew ? "New quiz" : title || "Quiz"}
      eyebrow={`${className} · Classwork`}
      backLabel="Classwork"
      dataGuide="quiz-builder"
      onClose={onClose}
      beforeClose={() => (dirty && !busy ? askConfirm("Leave without saving this quiz?", { confirmLabel: "Leave", cancelLabel: "Keep building" }) : true)}
      actions={
        <>
          {!isNew && (
            <div role="radiogroup" aria-label="Quiz views" className="inline-flex rounded-xl bg-cream p-1">
              <button type="button" role="radio" aria-checked={view === "build"} className={seg(view === "build")} onClick={() => setView("build")}>
                Questions
              </button>
              <button type="button" role="radio" aria-checked={view === "results"} className={seg(view === "results")} onClick={() => setView("results")}>
                Results{attempts ? ` (${attempts})` : ""}
              </button>
            </div>
          )}
          {view === "build" && (
            <button type="button" className={ui.btnPrimary} onClick={save} disabled={busy || loaded === null}>
              {busy ? "Saving…" : isNew ? "Set quiz" : "Save changes"}
            </button>
          )}
        </>
      }
    >
      {loaded === null ? (
        <div className="h-60 motion-safe:animate-pulse rounded-xl bg-white" />
      ) : view === "results" ? (
        <QuizResults homeworkId={id} classId={classId} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-5">
            <section aria-label="About the quiz" className="space-y-3 rounded-xl border border-gold-light bg-white p-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink/70">Title</span>
                <input type="text" value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} maxLength={200} placeholder="e.g. Forces: end of unit quiz" className={ui.input} data-autofocus />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-ink/70">Instructions for pupils (optional)</span>
                <textarea value={instructions} onChange={(e) => (setInstructions(e.target.value), setDirty(true))} rows={2} maxLength={4000} placeholder="e.g. Answer every question. You can go back before you hand in." className={`${ui.input} leading-relaxed`} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-ink/70">Due</span>
                  <input type="datetime-local" value={dueAt} onChange={(e) => (setDueAt(e.target.value), setDirty(true))} className={ui.input} />
                </label>
                {topics && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-ink/70">Topic</span>
                    <Select value={topicId} onChange={(e) => (setTopicId(e.target.value), setDirty(true))} className={ui.select}>
                      <option value="">No topic</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <PupilPicker classId={classId} value={audience} onChange={(v) => (setAudience(v), setDirty(true))} />
            </section>

            <section aria-labelledby="quiz-questions-h" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="quiz-questions-h" className="t-section">
                  Questions
                </h3>
                <span className="text-sm tabular-nums text-ink/65">
                  {questions.length} question{questions.length === 1 ? "" : "s"} · {total} mark{total === 1 ? "" : "s"}
                </span>
              </div>
              {questions.length === 0 && !picking && (
                <div className="rounded-xl border border-dashed border-gold-light bg-white p-5">
                  <p className="text-sm font-medium text-ink">Start the quiz</p>
                  <p className="mb-3 text-sm text-ink/65">Pick the first question&apos;s type below, or have a draft written from the unit for you to check.</p>
                  <QuestionTypePicker onPick={addQuestion} />
                </div>
              )}
              {questions.map((q, i) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  index={i}
                  count={questions.length}
                  showProblems={showProblems}
                  imageUrl={images[q.id]?.url ?? null}
                  onImage={(f) => setImage(q.id, f)}
                  onChange={(next) => edit((qs) => qs.map((x) => (x.id === q.id ? next : x)))}
                  onRemove={() => edit((qs) => qs.filter((x) => x.id !== q.id))}
                  onDuplicate={() => edit((qs) => [...qs.slice(0, i + 1), { ...q, id: crypto.randomUUID() }, ...qs.slice(i + 1)])}
                  onMove={(d) =>
                    edit((qs) => {
                      const j = i + d;
                      if (j < 0 || j >= qs.length) return qs;
                      const next = [...qs];
                      [next[i], next[j]] = [next[j], next[i]];
                      return next;
                    })
                  }
                />
              ))}
              {questions.length > 0 &&
                (picking ? (
                  <div className="rounded-xl border border-gold-light bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">Add a question</p>
                      <button type="button" className={`${ui.btnGhost} ${ui.sm}`} onClick={() => setPicking(false)}>
                        Cancel
                      </button>
                    </div>
                    <QuestionTypePicker onPick={addQuestion} />
                  </div>
                ) : (
                  <button type="button" onClick={() => setPicking(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold-light bg-white text-sm font-medium text-forest-700 hover:border-forest-700/50 hover:bg-forest-50">
                    <Icon name="plus" size="sm" />
                    Add a question
                  </button>
                ))}
            </section>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start" aria-label="Quiz settings">
            <section className="rounded-xl border border-gold-light bg-white p-4">
              <p className="t-eyebrow mb-2">Summary</p>
              <p className="text-2xl font-semibold tabular-nums text-ink">
                {total} <span className="text-sm font-normal text-ink/65">marks, {questions.length} questions</span>
              </p>
              {mix.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {mix.map((t) => (
                    <li key={t.type} className="inline-flex items-center gap-1 rounded-full border border-gold-light px-2 py-0.5 text-xs text-ink/75">
                      <Icon name={t.icon} size="sm" />
                      {t.n} {t.label.toLowerCase()}
                    </li>
                  ))}
                </ul>
              )}
              {questions.some((q) => !QTYPES.find((t) => t.type === q.qtype)?.auto) && <p className="mt-2 text-xs text-ink/65">Long answers come to you to mark; everything else marks itself.</p>}
              {unchecked > 0 && <p className="mt-2 text-xs font-medium text-amber-900">{unchecked} AI-drafted question{unchecked === 1 ? "" : "s"} still to check.</p>}
            </section>

            <QuizAiDraft classId={classId} existing={questions.map((q) => q.prompt)} open={aiOpen} setOpen={setAiOpen} onDrafted={(qs) => edit((cur) => [...cur, ...qs])} />

            <section className="space-y-3 rounded-xl border border-gold-light bg-white p-4">
              <p className="t-eyebrow">Settings</p>
              <div>
                <p className="mb-1 text-xs font-medium text-ink/70" id="ql-time">
                  Time limit
                </p>
                <div role="radiogroup" aria-labelledby="ql-time" className="flex flex-wrap gap-1 rounded-xl bg-cream p-1">
                  {[null, 10, 20, 30, 45, 60].map((m) => (
                    <button key={m ?? "none"} type="button" role="radio" aria-checked={settings.time_limit_minutes === m} className={seg(settings.time_limit_minutes === m)} onClick={() => (setSettings((s) => ({ ...s, time_limit_minutes: m })), setDirty(true))}>
                      {m === null ? "None" : `${m} min`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-ink/70" id="ql-att">
                  Attempts
                </p>
                <div role="radiogroup" aria-labelledby="ql-att" className="inline-flex flex-wrap gap-1 rounded-xl bg-cream p-1">
                  {[1, 2, 3, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={settings.max_attempts === n} className={seg(settings.max_attempts === n)} onClick={() => (setSettings((s) => ({ ...s, max_attempts: n })), setDirty(true))}>
                      {n}
                    </button>
                  ))}
                </div>
                {settings.max_attempts > 1 && <p className="mt-1 text-xs text-ink/65">The best attempt counts.</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-ink/70" id="ql-show">
                  Pupils see the answers
                </p>
                <div role="radiogroup" aria-labelledby="ql-show" className="flex flex-wrap gap-1 rounded-xl bg-cream p-1">
                  {(
                    [
                      ["after_submit", "When they finish"],
                      ["after_due", "After the due time"],
                      ["never", "Score only"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={settings.show_answers === k} className={seg(settings.show_answers === k)} onClick={() => (setSettings((s) => ({ ...s, show_answers: k })), setDirty(true))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="-mx-3">
                <Switch checked={settings.shuffle_questions} onChange={(v) => (setSettings((s) => ({ ...s, shuffle_questions: v })), setDirty(true))} label="Shuffle the questions" hint="Each pupil gets them in a different order." />
                <Switch checked={settings.shuffle_options} onChange={(v) => (setSettings((s) => ({ ...s, shuffle_options: v })), setDirty(true))} label="Shuffle the options" hint="For multiple choice and multiple answer." />
                <Switch checked={blockLate} onChange={(v) => (setBlockLate(v), setDirty(true))} label="Close at the due time" hint="No new attempts after it is due." />
              </div>
            </section>

            {questions.length > 2 && (
              <nav aria-label="Jump to a question" className="rounded-xl border border-gold-light bg-white p-4">
                <p className="t-eyebrow mb-2">Outline</p>
                <ol className="flex flex-wrap gap-1.5">
                  {questions.map((q, i) => (
                    <li key={q.id}>
                      <a href={`#q-${q.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`q-${q.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))} className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums ${showProblems && problems[i] ? "border-red-300 text-red-700" : q.ai && !q.checked ? "border-amber-300 text-amber-900" : "border-gold-light text-ink/80"} hover:bg-cream`} title={q.prompt || "Untitled question"}>
                        {i + 1}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
          </aside>
        </div>
      )}
    </FocusView>
  );
}
