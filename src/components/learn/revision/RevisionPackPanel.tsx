"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { mediaUrl, type StaffUnit, type SummarySlide } from "@/lib/learn/revision";
import { aiAssist, aiErrorMessage, useAiStatus } from "@/lib/learn/aiAssist";
import { AiSpark } from "@/components/learn/AiBits";
import { QuestionEditor } from "@/components/learn/revision/PackBuilder";
import { Notice, StatusChip, ui } from "@/components/learn/ui";

// The unit's Revision pack tab (Curriculum › unit › Revision pack), Tafweed T2:
// status and actions first, then anything waiting for the teacher (questions
// drafted by AI, the to-do list), then the questions, the video and, folded
// away, how pupils use the pack. Nothing drafted reaches pupils until a
// teacher approves it: pending questions are never active (0184), the to-do
// list shows only once a teacher shows it, and staff or automatic packs stay
// hidden until checked (revision_units_guard).

type PackQuestion = {
  id: string;
  topic: string;
  lesson_no: number | null;
  question: string;
  options: string[];
  answer: number;
  explanation: string | null;
  in_quiz: boolean;
  active?: boolean;
  review?: "approved" | "pending";
  drafted_by_ai?: boolean;
};
type Todo = { id: string; body: string; sort_order: number };

const btn = `${ui.btnSecondary} ${ui.sm}`;
const letters = "ABCDEF";
const ukDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export function RevisionPackPanel({
  pack,
  year,
  subjectSlug,
  unit,
  lessonCount,
  signedOff,
  onChanged,
  onBuild,
}: {
  pack: StaffUnit | undefined;
  year: string;
  subjectSlug: string;
  unit: string;
  lessonCount: number;
  signedOff: number;
  onChanged: () => void;
  onBuild: () => void;
}) {
  const supabase = getSupabaseClient();
  const ai = useAiStatus();
  const [qs, setQs] = useState<PackQuestion[] | null>(null);
  // null: not loaded, or the to-do list isn't available yet (before migration 0184).
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [videos, setVideos] = useState<{ path: string; label: string }[]>([]);
  const [chapter, setChapter] = useState(0);
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [reload, setReload] = useState(0);

  const packId = pack?.id;
  useEffect(() => {
    if (!supabase || !packId) return;
    let alive = true;
    (async () => {
      const cols = "id, topic, lesson_no, question, options, answer, explanation, in_quiz";
      let res: { data: unknown; error: unknown } = await supabase.from("revision_questions").select(`${cols}, active, review, drafted_by_ai`).eq("unit_id", packId).or("active.eq.true,review.eq.pending").order("lesson_no").order("qkey");
      // Before migration 0184 there is no review column: show the live questions only.
      if (res.error) res = await supabase.from("revision_questions").select(cols).eq("unit_id", packId).eq("active", true).order("lesson_no").order("qkey");
      const [{ data: unitRow }, todoRes] = await Promise.all([
        supabase.from("revision_units").select("video_path, summary").eq("id", packId).maybeSingle(),
        supabase.from("revision_todos").select("id, body, sort_order").eq("unit_id", packId).order("sort_order"),
      ]);
      if (!alive) return;
      setQs(((res.data as PackQuestion[]) || []).map((q) => ({ ...q, review: q.review || "approved", active: q.active ?? true })));
      setTodos(todoRes.error ? null : ((todoRes.data as Todo[]) || []));
      const u = unitRow as { video_path: string | null; summary: SummarySlide[] | null } | null;
      const chapters = (u?.summary || []).flatMap((x, k) => (x.video_path ? [{ path: x.video_path, label: `Chapter ${k + 1}: ${x.title}${x.length ? ` (${x.length})` : ""}` }] : []));
      setVideos(chapters.length ? chapters : u?.video_path ? [{ path: u.video_path, label: "Unit video" }] : []);
      setChapter(0);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, packId, reload]);

  const videoPath = videos[chapter]?.path || null;
  useEffect(() => {
    if (!videoPath) return;
    let alive = true;
    mediaUrl(videoPath).then((url) => alive && setLoaded({ path: videoPath, url }));
    return () => {
      alive = false;
    };
  }, [videoPath]);
  const video = loaded && loaded.path === videoPath ? loaded.url : null;

  const refresh = useCallback(() => {
    setReload((n) => n + 1);
    onChanged();
  }, [onChanged]);

  async function run(key: string, fn: () => Promise<string | null | void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }
  const myId = async () => (await supabase?.auth.getUser())?.data.user?.id ?? null;
  const noRights = "Couldn't save that. Only teachers and the head can change revision packs.";

  // ── no pack yet ──────────────────────────────────────────────────────────
  if (!pack) {
    const makeDraft = () =>
      run("draft", async () => {
        if (!supabase) return;
        const { error: err } = await supabase.rpc("revision_create_draft_pack", { p_subject_slug: subjectSlug, p_year: year, p_unit: unit });
        if (err) throw new Error(/no lessons/i.test(err.message) ? "This unit has no lessons in the Lesson library yet." : noRights);
        onChanged();
        return "Draft pack made. It is hidden from pupils until you check it.";
      });
    return (
      <div className="space-y-3">
        <div className={`${ui.card} space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="neutral">No pack yet</StatusChip>
            {lessonCount > 0 && (
              <span className="text-sm text-ink/75">
                {signedOff} of {lessonCount} lesson{lessonCount === 1 ? "" : "s"} signed off
              </span>
            )}
          </div>
          <p className="text-sm text-ink/75">
            {lessonCount > 0
              ? "When every lesson in this unit is signed off as approved, a draft pack is made for you automatically and appears in your Action centre. Or make one now."
              : "Make a pack with a summary video, chapters and your own quiz questions."}
          </p>
          <div className={ui.toolbar}>
            {lessonCount > 0 && (
              <button type="button" className={ui.btnPrimary} disabled={busy !== null} onClick={makeDraft}>
                {busy === "draft" ? "Making the draft…" : "Make a draft pack from the lessons"}
              </button>
            )}
            <button type="button" className={lessonCount > 0 ? ui.btnSecondary : ui.btnPrimary} onClick={onBuild}>
              Make a summary pack with a video
            </button>
          </div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        {notice && <Notice tone="good">{notice}</Notice>}
      </div>
    );
  }

  // ── a pack ───────────────────────────────────────────────────────────────
  const live = (qs || []).filter((q) => q.review !== "pending");
  const pending = (qs || []).filter((q) => q.review === "pending");
  const quiz = live.filter((q) => q.in_quiz);
  const topics = [...new Set(quiz.map((q) => q.topic))];
  const needsCheck = (pack.source === "staff" || pack.source === "auto") && !pack.checked_at;
  const todosShown = !!pack.todos_checked_at;
  const quizCount = qs ? quiz.length : pack.questions;
  const canAi = !!ai?.configured && ai.can.revision_questions !== false;

  const setPublished = (on: boolean) =>
    run("publish", async () => {
      if (!supabase) return;
      const patch: Record<string, unknown> = { published: on };
      if (on && !pack.checked_at) {
        patch.checked_at = new Date().toISOString();
        patch.checked_by = await myId();
      }
      const { error: err } = await supabase.from("revision_units").update(patch).eq("id", pack.id);
      if (err) throw new Error(noRights);
      onChanged();
      return on ? "Pupils can now see this pack." : "The pack is hidden from pupils.";
    });

  const draftWithAi = () =>
    run("ai", async () => {
      const r = await aiAssist("revision_questions", { unit_id: pack.id, count: 8 });
      if (!r.ok) throw new Error(aiErrorMessage(r));
      refresh();
      const n = Number(r.drafted) || 0;
      return `${n} question${n === 1 ? "" : "s"} drafted. Check each one under "Waiting for your check". Pupils see none until you approve it.`;
    });

  const approve = (ids: string[]) =>
    run(ids.length > 1 ? "approve-all" : `approve-${ids[0]}`, async () => {
      if (!supabase) return;
      const { error: err } = await supabase.from("revision_questions").update({ review: "approved", active: true, approved_at: new Date().toISOString(), approved_by: await myId() }).in("id", ids);
      if (err) throw new Error(noRights);
      refresh();
      return ids.length > 1 ? `${ids.length} questions approved.` : null;
    });

  const removeQuestion = (id: string) =>
    run(`remove-${id}`, async () => {
      if (!supabase) return;
      const { error: err } = await supabase.from("revision_questions").delete().eq("id", id);
      if (err) throw new Error(noRights);
      refresh();
    });

  const makeTodos = () =>
    run("todos", async () => {
      if (!supabase) return;
      const { error: err } = await supabase.rpc("revision_create_todos", { p_unit: pack.id });
      if (err) throw new Error(noRights);
      refresh();
      return "To-do list made from the unit's lessons. Edit it, then show it to pupils.";
    });

  const saveTodo = (t: Todo, body: string) =>
    run(`todo-${t.id}`, async () => {
      if (!supabase || body.trim() === t.body) return;
      if (body.trim().length < 3) throw new Error("A to-do item needs at least a few words.");
      const { error: err } = await supabase.from("revision_todos").update({ body: body.trim(), updated_at: new Date().toISOString() }).eq("id", t.id);
      if (err) throw new Error(noRights);
      setReload((n) => n + 1);
    });

  const removeTodo = (t: Todo) =>
    run(`todo-${t.id}`, async () => {
      if (!supabase) return;
      const { error: err } = await supabase.from("revision_todos").delete().eq("id", t.id);
      if (err) throw new Error(noRights);
      refresh();
    });

  const addTodo = () =>
    run("todo-add", async () => {
      if (!supabase) return;
      const body = newTodo.trim();
      if (body.length < 3) throw new Error("A to-do item needs at least a few words.");
      const last = todos?.length ? todos[todos.length - 1].sort_order : 0;
      const { error: err } = await supabase.from("revision_todos").insert({ unit_id: pack.id, body, sort_order: last + 10, created_by: await myId() });
      if (err) throw new Error(noRights);
      setNewTodo("");
      refresh();
    });

  const showTodos = (on: boolean) =>
    run("todos-show", async () => {
      if (!supabase) return;
      const { error: err } = await supabase
        .from("revision_units")
        .update(on ? { todos_checked_at: new Date().toISOString(), todos_checked_by: await myId() } : { todos_checked_at: null, todos_checked_by: null })
        .eq("id", pack.id);
      if (err) throw new Error(noRights);
      onChanged();
      return on ? (pack.published ? "Pupils can now see the to-do list." : "The to-do list will show once the pack is shown to pupils.") : "The to-do list is hidden from pupils.";
    });

  return (
    <div className="space-y-4">
      {/* 1. Status and the main actions */}
      <section aria-label="Pack status" className={`${ui.card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {pack.published ? <StatusChip tone="good">Pupils can see this pack</StatusChip> : needsCheck ? <StatusChip tone="warn">Draft: waiting for your check</StatusChip> : <StatusChip tone="neutral">Hidden from pupils</StatusChip>}
          {pending.length > 0 && <StatusChip tone="warn">{pending.length} question{pending.length === 1 ? "" : "s"} to check</StatusChip>}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/75">
          <li>{pack.kind === "summary" ? "Summary slides" : "The unit's lesson slides"}{pack.has_video ? " and a video" : ""}</li>
          <li>{quizCount} quiz question{quizCount === 1 ? "" : "s"}</li>
          {pack.practice_questions > 0 && <li>{pack.practice_questions} extra practice questions from the key words</li>}
          {todos !== null && <li>{todos.length ? `To-do list: ${todos.length} items, ${todosShown ? "shown" : "not shown yet"}` : "No to-do list yet"}</li>}
        </ul>
        {pack.source === "auto" && pack.auto_created_at && !pack.checked_at && (
          <p className="text-sm text-ink/75">Made automatically on {ukDate(pack.auto_created_at)}, when every lesson in this unit was signed off. Check the questions and the to-do list, then show it to pupils.</p>
        )}
        <div className={ui.toolbar}>
          {pack.published ? (
            <button type="button" className={btn} disabled={busy !== null} onClick={() => setPublished(false)}>
              Hide from pupils
            </button>
          ) : (
            <button type="button" className={ui.btnPrimary} disabled={busy !== null || quizCount === 0} onClick={() => setPublished(true)} aria-describedby={quizCount === 0 ? "pack-no-questions" : undefined}>
              {busy === "publish" ? "Saving…" : needsCheck ? "Approve and show to pupils" : "Show to pupils"}
            </button>
          )}
          {pack.source === "staff" && (
            <button type="button" className={btn} onClick={onBuild}>
              Edit pack
            </button>
          )}
        </div>
        {!pack.published && quizCount === 0 && (
          <p id="pack-no-questions" className={ui.hint}>
            Add or approve at least one quiz question first.
          </p>
        )}
      </section>

      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="good">{notice}</Notice>}

      {/* 2. Make the pack better: question pack and action pack in a click */}
      <section aria-labelledby="pack-build" className={`${ui.card} space-y-3`}>
        <h3 id="pack-build" className={ui.sectionTitle}>
          Add to this pack
        </h3>
        <div className={ui.toolbar}>
          {canAi && (
            <button type="button" className={`${btn} gap-1.5`} disabled={busy !== null} onClick={draftWithAi}>
              <AiSpark className="h-4 w-4 text-teal-700" />
              {busy === "ai" ? "Drafting questions…" : "Draft 8 questions with AI"}
            </button>
          )}
          <button type="button" className={btn} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            {adding ? "Close the question form" : "Write questions yourself"}
          </button>
          {todos !== null && todos.length === 0 && (
            <button type="button" className={btn} disabled={busy !== null} onClick={makeTodos}>
              {busy === "todos" ? "Making the list…" : "Make the to-do list"}
            </button>
          )}
        </div>
        <p className={ui.hint}>
          {canAi
            ? "AI drafts questions from this unit's lessons only (no pupil information is sent). Every draft waits for you to approve it before any pupil sees it."
            : ai && !ai.configured
              ? "AI drafting is off until the AI key is added (Settings › AI helpers)."
              : "Questions you write go straight into the quiz."}
        </p>
        {adding && <QuestionEditor unitId={pack.id} topics={topics} questions={[]} onChange={() => refresh()} onError={setError} />}
      </section>

      {/* 3. Waiting for the teacher */}
      {pending.length > 0 && (
        <section aria-labelledby="pack-pending" className={`${ui.card} space-y-3 border-amber-200`}>
          <div className={ui.cardHead}>
            <h3 id="pack-pending" className={ui.sectionTitle}>
              Waiting for your check ({pending.length})
            </h3>
            <button type="button" className={btn} disabled={busy !== null} onClick={() => approve(pending.map((q) => q.id))}>
              {busy === "approve-all" ? "Approving…" : "Approve all"}
            </button>
          </div>
          <p className={ui.hint}>Check the facts, the Arabic and any references. Approve the good ones; remove the rest. Pupils see none of these until approved.</p>
          <ol className="space-y-3">
            {pending.map((q) => (
              <li key={q.id} className="rounded-xl border border-gold-light p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs text-ink/65">
                  {q.drafted_by_ai && (
                    <span className="inline-flex items-center gap-1">
                      <AiSpark className="h-3.5 w-3.5 text-teal-700" /> AI draft
                    </span>
                  )}
                  <span>{q.topic}</span>
                </p>
                <QuestionBody q={q} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={`${ui.btnPrimary} ${ui.sm}`} disabled={busy !== null} onClick={() => approve([q.id])}>
                    Approve
                  </button>
                  <button type="button" className={ui.btnLinkDanger} disabled={busy !== null} onClick={() => removeQuestion(q.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 4. The action pack: a to-do list for the unit */}
      {todos !== null && todos.length > 0 && (
        <section aria-labelledby="pack-todos" className={`${ui.card} space-y-3`}>
          <div className={ui.cardHead}>
            <h3 id="pack-todos" className={`${ui.sectionTitle} flex flex-wrap items-center gap-2`}>
              To-do list for pupils
              {todosShown ? <StatusChip tone="good">Shown to pupils</StatusChip> : <StatusChip tone="warn">Not shown yet</StatusChip>}
            </h3>
            <button type="button" className={todosShown ? btn : `${ui.btnPrimary} ${ui.sm}`} disabled={busy !== null} onClick={() => showTodos(!todosShown)}>
              {todosShown ? "Hide the list" : "Show the list to pupils"}
            </button>
          </div>
          <p className={ui.hint}>What each pupil should do next for this unit. Pupils tick items off on their revision page. Edit any line; changes save when you leave the box.</p>
          <ol className="space-y-2">
            {todos.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink/65">{i + 1}.</span>
                <label className="sr-only" htmlFor={`todo-${t.id}`}>
                  To-do item {i + 1}
                </label>
                <input id={`todo-${t.id}`} defaultValue={t.body} maxLength={300} onBlur={(e) => saveTodo(t, e.target.value)} className={`${ui.input} min-w-0 flex-1`} />
                <button type="button" className={ui.btnLinkDanger} disabled={busy !== null} onClick={() => removeTodo(t)} aria-label={`Remove to-do item ${i + 1}`}>
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="todo-new">
              New to-do item
            </label>
            <input id="todo-new" value={newTodo} maxLength={300} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTodo()} placeholder="Add an item, e.g. Make a mind map of the unit" className={`${ui.input} min-w-0 flex-1`} />
            <button type="button" className={btn} disabled={busy !== null || newTodo.trim().length < 3} onClick={addTodo}>
              Add
            </button>
          </div>
        </section>
      )}

      {/* 5. The quiz questions pupils get */}
      <details open={quiz.length <= 12} className={`${ui.card} group`}>
        <summary className="cursor-pointer text-base font-semibold text-ink">Quiz questions ({quizCount})</summary>
        <div className="mt-3 space-y-4">
          {qs === null ? (
            <div className="h-32 animate-pulse rounded-2xl bg-cream" />
          ) : quiz.length === 0 ? (
            <p className="text-sm text-ink/70">No quiz questions yet. Draft some with AI or write your own above.</p>
          ) : (
            topics.map((t) => (
              <section key={t} aria-label={t}>
                <h4 className="mb-2 font-semibold text-ink">{t}</h4>
                <ol className="space-y-3">
                  {quiz
                    .filter((q) => q.topic === t)
                    .map((q) => (
                      <li key={q.id} className="text-sm">
                        <QuestionBody q={q} />
                      </li>
                    ))}
                </ol>
              </section>
            ))
          )}
        </div>
      </details>

      {videos.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-gold-light bg-white p-3">
          {videos.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              Video
              <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className={`${ui.select} min-w-0 flex-1`}>
                {videos.map((v, k) => (
                  <option key={v.path} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {video ? (
            <video key={videoPath} src={video} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-ink" />
          ) : (
            <div role="status" className="flex aspect-video w-full items-center justify-center rounded-lg bg-cream text-sm text-ink/65">
              Loading the video…
            </div>
          )}
        </div>
      )}

      {/* 6. The explainer, folded away */}
      <details className={ui.card}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">How pupils use this pack</summary>
        <div className="mt-2 space-y-2 text-sm text-ink/75">
          <p>
            Under <strong>Unit revision</strong> pupils see this unit for their year. They revise from the {pack.kind === "summary" ? "summary slides and video" : "lesson slides"}, take the quiz (marked on the
            server, so answers never reach their browser early), then the practice coach works on their weakest topics with hints. If you have shown the to-do list, it sits at the top of the unit and
            they tick items off.
          </p>
          <p>Pupils never use AI. Questions drafted by AI are only for staff to check: each one stays hidden until a teacher approves it.</p>
        </div>
      </details>
    </div>
  );
}

function QuestionBody({ q }: { q: PackQuestion }) {
  return (
    <>
      <p className="mt-1 font-medium text-ink">{q.question}</p>
      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <li key={i} className={`rounded-md px-2 py-1 ${i === q.answer ? "bg-green-50 font-semibold text-green-900" : "bg-cream/60 text-ink/80"}`}>
            {letters[i]}. {o}
            {i === q.answer && <span className="sr-only"> (correct)</span>}
          </li>
        ))}
      </ul>
      {q.explanation && <p className="mt-1 text-xs text-ink/65">Why: {q.explanation}</p>}
    </>
  );
}
