"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { LinesField, Modal, TextField } from "@/components/learn/curriculum/Modal";
import { problemsFor, realEditAt, syncNotes, triggerCurriculumSync, when, type SyncNote } from "@/lib/learn/curriculumUnits";
import type { CurriculumLesson } from "@/lib/learn/curriculum";
import { ASSESSMENT_LABEL, ASSESSMENT_MODES, BLOCKS, HOOK_TYPES, ROUTINES, ROUTINE_SECTIONS, blockProblems, detectAssessment, extrasProblems, lessonWarnings } from "@/lib/learn/lessonSchema.mjs";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
// The lesson as stored in curriculum_lessons.content: the lesson object from
// content/lessons/<subject>/<year>.json (content/lessons/README.md). Fields this form does not
// show (board, anything else) are kept as they are. Slide blocks (worked examples, charts…) are
// edited as checked JSON. Shapes and limits: src/lib/learn/lessonSchema.mjs.
// `_key` is a form-only id (never saved) so each slide keeps its own inputs when slides move.
type Slide = { heading?: string; bullets?: string[]; note?: string; routine?: string; _key?: string; [block: string]: unknown };
let keySeq = 0;
const newKey = () => `slide-${++keySeq}`;
type Keyword = { term: string; def: string };
/** A question or task: plain text, or with an answer, minutes, the teacher's model and poll options. */
type Item = string | { q: string; a?: string; mins?: number; model?: string; options?: string[]; [key: string]: unknown };
/** The form's copy of an item, always with every field (options one per line). `x`: any other fields, kept as they are. */
type ItemRow = { q: string; a: string; mins: string; model: string; options: string; x?: Record<string, unknown> };
type Hook = { type: string; text: string; options?: string[]; a?: string; [key: string]: unknown };
/** Lessons v3: the Islamic foundation (start) or the Islamic position (end). */
type IslamicLink = { text: string; at: string };
/** Lessons v3: a picture found on Wikimedia Commons (scripts/lessons/pictures.mjs). */
type Picture = { find: string; alt: string; for: string; file?: string; credit?: string; licence?: string };
/** Everything in a lesson except its question lists. */
type LessonBase = {
  unit: string;
  n: number;
  title: string;
  duration?: number;
  bigQuestion?: string;
  objectives: string[];
  successCriteria?: string[];
  crossCurricular?: string;
  smsc?: string;
  keywords: Keyword[];
  teach: Slide[];
  homework: string | string[];
  send?: string;
  hook?: Hook;
  routines?: Record<string, string>;
  resources?: string[];
  islamicLink?: IslamicLink;
  pictures?: Picture[];
  /** A test, mock or quiz (exam conditions, marks, mark scheme for the teacher only); false: never one. Left out: detected from the title. */
  assessmentMode?: "test" | "mock" | "quiz" | false;
  [key: string]: unknown;
};
export type LessonContent = LessonBase & { starter: Item[]; practice: Item[]; independent: Item[]; exit: Item[] };

/** The form state: items as rows, so the answer and minutes can be typed beside each question. */
type FormContent = LessonBase & { starter: ItemRow[]; practice: ItemRow[]; independent: ItemRow[]; exit: ItemRow[] };
const ITEM_KEYS = ["starter", "practice", "independent", "exit"] as const;

const BLOCK_LABEL: Record<string, string> = {
  model: "a worked example",
  check: "a hinge question",
  quote: "a quotation",
  compare: "a side-by-side comparison",
  timeline: "a timeline",
  table: "a table",
  code: "a program to trace",
  misconception: "a common mistake and its correction",
  cycle: "a cycle diagram",
  chart: "a chart",
  numberline: "a number line",
  fraction: "fraction bars",
  diagram: "a concept map",
  sort: "a card sort",
};
const blockOf = (s: Slide) => (BLOCKS as string[]).find((k) => s[k] != null);
/** A starting point for each block, so staff can see its shape (content/lessons/README.md). */
const BLOCK_TEMPLATE: Record<string, unknown> = {
  model: { problem: "", steps: ["", ""], answer: "" },
  check: { q: "", options: ["", "", "", ""], answer: 0, why: "" },
  misconception: { wrong: "", right: "" },
  quote: { text: "", source: "" },
  compare: { left: { title: "", points: [""] }, right: { title: "", points: [""] }, label: "vs" },
  timeline: [{ label: "", text: "" }, { label: "", text: "" }, { label: "", text: "" }],
  table: { head: ["", ""], rows: [["", ""]] },
  code: { lang: "python", text: "", output: "" },
  cycle: ["", "", ""],
  chart: { kind: "bar", title: "", labels: ["", ""], values: [0, 0], unit: "" },
  numberline: { min: 0, max: 10, step: 1, marks: [{ at: 5, label: "" }] },
  fraction: { parts: 4, shaded: 1 },
  diagram: { centre: "", items: ["", "", ""] },
  sort: { columns: ["", ""], cards: ["", "", "", ""], answer: [0, 1, 0, 1] },
};
const ROUTINE_SECTION_LABEL: Record<string, string> = { hook: "Hook", starter: "Starter", teach: "Teaching slides", hinge: "Hinge question", practice: "Guided practice", independent: "Independent", exit: "Exit ticket" };
const x0 = (x: unknown) => x as { q?: unknown; a?: unknown; mins?: unknown; model?: unknown; options?: unknown; [k: string]: unknown };
const toRow = (x: unknown): ItemRow => {
  if (x && typeof x === "object") {
    // Any other fields an item has (added by a newer lesson format) are kept as they are.
    const { q, a, mins, model, options, ...rest } = x0(x);
    return {
      q: String(q ?? ""),
      a: a == null ? "" : String(a),
      mins: mins == null ? "" : String(mins),
      model: model == null ? "" : String(model),
      options: Array.isArray(options) ? options.map(String).join("\n") : "",
      ...(Object.keys(rest).length ? { x: rest } : {}),
    };
  }
  return { q: String(x ?? ""), a: "", mins: "", model: "", options: "" };
};
const EMPTY_ROW: ItemRow = { q: "", a: "", mins: "", model: "", options: "" };
/** A row back to the lesson format: plain text unless it has an answer, minutes, a model or options. */
const fromRow = (r: ItemRow): Item => {
  const q = r.q.trim();
  const a = r.a.trim();
  const model = r.model.trim();
  const options = clean(r.options.split("\n"));
  const mins = r.mins.trim() ? Number(r.mins) : undefined;
  if (!a && mins == null && !model && !options.length && !r.x) return q;
  return { ...(r.x || {}), q, ...(a ? { a } : {}), ...(mins != null ? { mins } : {}), ...(model ? { model } : {}), ...(options.length ? { options } : {}) };
};
/** The slide with its block replaced (kind null: no block). */
function withBlock(t: Slide, kind: string | null, value: unknown): Slide {
  const x: Slide = { ...t };
  for (const k of BLOCKS as string[]) delete x[k];
  if (kind) x[kind] = value;
  return x;
}
const btn = `${ui.btnSecondary} ${ui.sm}`;
const lines = (a: unknown) => (Array.isArray(a) ? a.map(String) : typeof a === "string" && a ? [a] : []);
const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);

/** Tidy the form for saving, so the lesson always passes the content checks the slide builder runs. */
function tidy(c: FormContent): LessonContent {
  const out = { ...c, title: c.title.trim(), unit: c.unit.trim() } as unknown as LessonContent;
  out.objectives = clean(c.objectives);
  ITEM_KEYS.forEach((k) => (out[k] = c[k].filter((r) => r.q.trim()).map(fromRow)));
  out.keywords = c.keywords.map((k) => ({ ...k, term: k.term.trim(), def: k.def.trim() })).filter((k) => k.term);
  out.teach = c.teach.map((s) => {
    const t: Slide = { ...s, heading: (s.heading || "").trim(), bullets: clean(s.bullets || []) };
    delete t._key;
    if (typeof s.note === "string") t.note = s.note.trim();
    if (!t.note) delete t.note;
    if (!t.bullets?.length && blockOf(t)) delete t.bullets;
    return t;
  });
  out.homework = Array.isArray(c.homework) ? clean(c.homework) : String(c.homework || "").trim();
  if (c.successCriteria) {
    const sc = clean(c.successCriteria);
    if (sc.length) out.successCriteria = sc;
    else delete out.successCriteria;
  }
  for (const k of ["bigQuestion", "crossCurricular", "smsc", "send"] as const) {
    const v = typeof c[k] === "string" ? (c[k] as string).trim() : "";
    if (v) out[k] = v;
    else delete out[k];
  }
  // Optional extras: left out of the lesson when empty, so untouched lessons do not change.
  const res = clean(c.resources || []);
  if (res.length) out.resources = res;
  else delete out.resources;
  const routines = Object.fromEntries(Object.entries(c.routines || {}).filter(([, v]) => v));
  if (Object.keys(routines).length) out.routines = routines;
  else delete out.routines;
  if (c.hook && c.hook.type && c.hook.text.trim()) {
    const opts = clean(c.hook.options || []);
    // Other hook fields (from a newer lesson format) are kept.
    const { options: _o, a: _a, ...rest } = c.hook;
    void _o;
    void _a;
    out.hook = { ...rest, type: c.hook.type, text: c.hook.text.trim(), ...(opts.length ? { options: opts } : {}), ...(c.hook.a?.trim() ? { a: c.hook.a.trim() } : {}) };
  } else delete out.hook;
  if (c.assessmentMode === undefined) delete out.assessmentMode;
  if (c.islamicLink && c.islamicLink.text.trim()) out.islamicLink = { text: c.islamicLink.text.trim(), at: c.islamicLink.at === "end" ? "end" : "start" };
  else delete out.islamicLink;
  const pics = (c.pictures || [])
    .map((x) => {
      const p: Picture = { find: x.find.trim(), alt: x.alt.trim(), for: x.for.trim() };
      for (const k of ["file", "credit", "licence"] as const) if (x[k]?.trim()) p[k] = x[k]!.trim();
      return p;
    })
    .filter((x) => x.find);
  if (pics.length) out.pictures = pics;
  else delete out.pictures;
  out.teach = out.teach.map((t) => {
    const x = { ...t };
    if (!x.routine) delete x.routine;
    return x;
  });
  return out;
}

/** What stops a lesson being saved (the same checks the slide builder runs). Shared with LessonStudio. */
export function problemsOf(c: LessonContent): string[] {
  const extra = (extrasProblems(c) as string[]).map((x) => `${x[0].toUpperCase()}${x.slice(1)}.`);
  const p: string[] = [];
  if (!c.title) p.push("Give the lesson a title.");
  if (!c.unit) p.push("Say which unit the lesson belongs to.");
  if (!c.objectives.length) p.push("Add at least one objective.");
  if (!c.starter.length) p.push("Add at least one starter question.");
  if (c.teach.length < 3 || c.teach.length > 7) p.push("A lesson needs 3 to 7 teaching slides.");
  c.teach.forEach((s, i) => {
    if (!s.heading || (!blockOf(s) && !(s.bullets || []).length)) p.push(`Teaching slide ${i + 1} needs a heading and at least one bullet point.`);
    (blockProblems(s).problems as string[]).forEach((x) => p.push(`Teaching slide ${i + 1}: ${x}.`));
  });
  if (!c.practice.length) p.push("Add at least one practice question.");
  if (!c.independent.length) p.push("Add at least one independent task.");
  if (!c.exit.length) p.push("Add at least one exit ticket question.");
  if (!(Array.isArray(c.homework) ? c.homework.length : c.homework)) p.push("Add the homework.");
  return [...p, ...extra];
}

type Loaded = { content: LessonContent | null; content_updated_at: string | null; content_updated_by_name: string | null; custom_deck: boolean; rebuild_requested: boolean };
type Version = { id: string; content: LessonContent; note: string | null; edited_by_name: string | null; edited_at: string; replaced_at: string };

/**
 * Edit a lesson in the browser. Saving stores the new content and asks for the slides,
 * lesson plan and PDFs to be rebuilt; no file is downloaded or uploaded.
 */
export function LessonEditor({ lesson, canEdit, onClose, onSaved }: { lesson: CurriculumLesson; canEdit: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const supabase = getSupabaseClient();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [c, setC] = useState<FormContent | null>(null);
  const [note, setNote] = useState("");
  const [rebuild, setRebuild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [badBlocks, setBadBlocks] = useState<Record<string, boolean>>({});
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allNotes, setAllNotes] = useState<SyncNote[]>([]);
  useEffect(() => {
    let live = true;
    syncNotes().then((r) => live && setAllNotes(r.notes));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase
      .from("curriculum_lessons")
      .select("content, content_updated_at, content_updated_by_name, custom_deck, rebuild_requested")
      .eq("id", lesson.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e || !data) return setError("Couldn't open this lesson for editing. The editor may not be switched on yet; try again later.");
        const d = data as Loaded;
        setLoaded(d);
        if (d.content) setC(normalise(d.content));
      });
    return () => {
      live = false;
    };
  }, [supabase, lesson.id]);

  // A clash noted before the lesson was last saved has been dealt with.
  const lessonEditedAt = realEditAt(loaded?.content_updated_by_name, loaded?.content_updated_at);
  const notesHere = problemsFor(allNotes, [`lesson:${lesson.subject_slug}/${lesson.year}/${lesson.lesson_no}`], () => lessonEditedAt);
  const dirty = !!(c && loaded?.content && JSON.stringify(tidy(c)) !== JSON.stringify(tidy(normalise(loaded.content))));
  const set = <K extends keyof FormContent>(k: K, v: FormContent[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const setSlide = (i: number, s: Partial<Slide>) => setC((x) => (x ? { ...x, teach: x.teach.map((t, k) => (k === i ? { ...t, ...s } : t)) } : x));
  const moveSlide = (i: number, dir: -1 | 1) =>
    setC((x) => {
      if (!x) return x;
      const t = [...x.teach];
      [t[i], t[i + dir]] = [t[i + dir], t[i]];
      return { ...x, teach: t };
    });

  const close = async () => {
    if (dirty && !(await askConfirm("Close without saving your changes?"))) return;
    onClose();
  };

  const save = async () => {
    if (!supabase || !c || !loaded) return;
    const t = tidy(c);
    // A block box still holding JSON that does not parse would otherwise be saved as its last valid version.
    const unparsed = c.teach.map((s, i) => (s._key && badBlocks[s._key] ? i + 1 : 0)).filter(Boolean);
    const p = [...unparsed.map((n) => `Teaching slide ${n}: the slide block is not valid JSON yet. Fix it (check the commas, quotes and brackets) or choose “None” before saving.`), ...problemsOf(t)];
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    const { error: e } = await supabase.rpc("curriculum_save_lesson_content", { p_lesson: lesson.id, p_content: t, p_note: note, p_rebuild_slides: rebuild, p_expected: loaded.content_updated_at });
    if (e) {
      setBusy(false);
      setProblems([
        /edited_elsewhere/.test(e.message)
          ? "Someone else saved this lesson while you were editing it. Copy anything you need, close this window and open the lesson again to see their changes."
          : /not allowed/.test(e.message)
            ? "Only teachers and the Headteacher can edit lessons."
            : `Couldn't save: ${e.message}`,
      ]);
      return;
    }
    const msg = await triggerCurriculumSync("lesson", lesson.id);
    onSaved(loaded.custom_deck && !rebuild ? `${msg.split(".")[0]}. This lesson uses slides you uploaded, so they stay as they are; its lesson plan is rebuilt from your changes.` : msg);
  };

  const showHistory = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("curriculum_lesson_content_versions").select("id, content, note, edited_by_name, edited_at, replaced_at").eq("lesson_id", lesson.id).order("replaced_at", { ascending: false }).limit(30);
    setVersions((data as Version[]) || []);
  };

  const dis = !canEdit || busy;
  return (
    <Modal title={`Edit lesson ${lesson.lesson_no}: ${lesson.title}`} onClose={close} panel>
      <div className="space-y-5 p-4 sm:p-6">
        {error && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}
        {!error && !loaded && <p className="text-sm text-ink/65">Opening…</p>}
        {loaded && !loaded.content && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This lesson has not been loaded into the editor yet. It is filled in from the lesson files automatically within the hour; try again later.</p>
        )}
        {loaded && c && (
          <>
            {notesHere.length > 0 && (
              <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">From the last copy to the slide builder</p>
                <ul className="list-disc pl-5">
                  {notesHere.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1 text-xs text-ink/65">
              {loaded.content_updated_by_name && (
                <p>
                  Last changed by {loaded.content_updated_by_name}
                  {loaded.content_updated_at ? `, ${when(loaded.content_updated_at)}` : ""}.{" "}
                  <button type="button" className={`${ui.btnLink} !text-xs`} onClick={showHistory}>
                    See earlier versions
                  </button>
                </p>
              )}
              {loaded.rebuild_requested && <p className="font-semibold text-teal-800">New slides and a new lesson plan are being built from the last save.</p>}
            </div>
            {versions && (
              <div className="rounded-xl border border-gold-light bg-cream/60 p-3 text-sm">
                <p className="font-semibold text-ink">Earlier versions</p>
                {versions.length === 0 ? (
                  <p className="text-ink/70">No earlier versions yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-gold-light/70">
                    {versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <span className="min-w-0 flex-1">
                          {when(v.edited_at)} · {v.edited_by_name || "Unknown"} · <span className="text-ink/70">{v.content.title}</span>
                          {v.note && <span className="block text-xs text-ink/60">Then changed: {v.note}</span>}
                        </span>
                        {canEdit && (
                          <button type="button" className={btn} onClick={() => setC(normalise({ ...v.content, n: lesson.lesson_no }))}>
                            Use this version
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-ink/65">“Use this version” fills the form with it; press Save to keep it.</p>
              </div>
            )}

            <fieldset disabled={dis} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField label="Lesson title" value={c.title} onChange={(v) => set("title", v)} />
              </div>
              <TextField label="Unit" hint="Lessons with the same unit are grouped together" value={c.unit} onChange={(v) => set("unit", v)} />
              <label className="block">
                <span className={ui.label}>Length (minutes)</span>
                <input type="number" min={10} max={120} value={c.duration ?? ""} onChange={(e) => set("duration", e.target.value ? Number(e.target.value) : undefined)} className={`mt-1 ${ui.input}`} />
              </label>
              <AssessmentField value={c.assessmentMode} title={c.title} unit={c.unit} onChange={(v) => set("assessmentMode", v)} />
              <div className="sm:col-span-2">
                <TextField label="Big question (optional)" hint="Gets its own slide and comes back on the exit ticket" value={c.bigQuestion || ""} onChange={(v) => set("bigQuestion", v)} />
              </div>
              <LinesField label="Objectives" hint="One per line." value={c.objectives} onChange={(v) => set("objectives", v)} />
              <LinesField label="Success criteria (optional)" hint="Up to three lines: All, Most, Some." value={c.successCriteria || []} onChange={(v) => set("successCriteria", v)} />
              <div className="sm:col-span-2">
                <TextField label="Resources (optional)" hint="One per line. Left empty, the plan lists slides, mini-whiteboard and pen, exercise book." value={(c.resources || []).join("\n")} onChange={(v) => set("resources", v.split("\n"))} multiline />
              </div>
            </fieldset>

            <HookField hook={c.hook} disabled={dis} onChange={(h) => set("hook", h)} />
            <IslamicLinkField value={c.islamicLink} disabled={dis} onChange={(v) => set("islamicLink", v)} />
            <PicturesField value={c.pictures || []} teachCount={c.teach.length} disabled={dis} onChange={(v) => set("pictures", v)} />
            <ItemsField label="Starter" hint="Retrieval questions. Add the answer to show a “Check your answers” slide; minutes set the slide timer." rows={c.starter} disabled={dis} onChange={(v) => set("starter", v)} />

            <section aria-labelledby="kw-h" className="space-y-2">
              <h3 id="kw-h" className={ui.sectionTitle}>
                Key words
              </h3>
              <ul className="space-y-2">
                {c.keywords.map((k, i) => (
                  <li key={i} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
                    <input aria-label={`Key word ${i + 1}`} value={k.term} disabled={dis} onChange={(e) => set("keywords", c.keywords.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)))} className={ui.input} placeholder="Word" />
                    <input aria-label={`Meaning of key word ${i + 1}`} value={k.def} disabled={dis} onChange={(e) => set("keywords", c.keywords.map((x, j) => (j === i ? { ...x, def: e.target.value } : x)))} className={ui.input} placeholder="What it means" />
                    {canEdit && (
                      <button type="button" className={ui.btnLinkDanger} disabled={busy} onClick={() => set("keywords", c.keywords.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <button type="button" className={btn} disabled={busy} onClick={() => set("keywords", [...c.keywords, { term: "", def: "" }])}>
                  + Add a key word
                </button>
              )}
            </section>

            <section aria-labelledby="teach-h" className="space-y-2">
              <h3 id="teach-h" className={ui.sectionTitle}>
                Teaching slides ({c.teach.length})
              </h3>
              <p className={ui.hint}>Between 3 and 7 slides. Keep bullet points short (at most 14 words).</p>
              <ol className="space-y-3">
                {c.teach.map((s, i) => {
                  const block = blockOf(s);
                  return (
                    <li key={s._key || i} className="rounded-xl border border-gold-light p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Slide {i + 1}</p>
                      <fieldset disabled={dis} className="grid gap-3">
                        <TextField label="Heading" value={s.heading || ""} onChange={(v) => setSlide(i, { heading: v })} />
                        <LinesField label={block ? "Bullet points (optional)" : "Bullet points"} hint="One per line." value={s.bullets || []} onChange={(v) => setSlide(i, { bullets: v })} rows={3} />
                        <TextField label="Teacher note" hint="What to say and ask; shown in the speaker notes and the lesson plan" value={s.note || ""} onChange={(v) => setSlide(i, { note: v })} multiline />
                        <RoutineSelect label="Routine on this slide (optional)" value={s.routine || ""} disabled={dis} onChange={(v) => setSlide(i, { routine: v || undefined })} />
                        <BlockField
                          slide={s}
                          disabled={dis}
                          onChange={(kind, value) => setC((x) => (x ? { ...x, teach: x.teach.map((t) => (t._key === s._key ? withBlock(t, kind, value) : t)) } : x))}
                          onInvalid={(bad) => s._key && setBadBlocks((b) => ({ ...b, [s._key as string]: bad }))}
                        />
                        {block && <p className="text-xs text-ink/65">This slide shows {BLOCK_LABEL[block]}.</p>}
                      </fieldset>
                      {canEdit && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className={btn} disabled={busy || i === 0} onClick={() => moveSlide(i, -1)}>
                            Move up
                          </button>
                          <button type="button" className={btn} disabled={busy || i === c.teach.length - 1} onClick={() => moveSlide(i, 1)}>
                            Move down
                          </button>
                          <button type="button" className={`${ui.btnLinkDanger} ml-auto`} disabled={busy || c.teach.length <= 3} onClick={() => set("teach", c.teach.filter((_, k) => k !== i))}>
                            Remove slide
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {canEdit && c.teach.length < 7 && (
                <button type="button" className={btn} disabled={busy} onClick={() => set("teach", [...c.teach, { heading: "", bullets: [], _key: newKey() }])}>
                  + Add a slide
                </button>
              )}
            </section>

            <ItemsField label="Practice (guided questions)" rows={c.practice} disabled={dis} onChange={(v) => set("practice", v)} />
            <ItemsField label="Independent tasks" hint="Usually three: core, extend, stretch." rows={c.independent} disabled={dis} onChange={(v) => set("independent", v)} />
            <ItemsField label="Exit ticket" hint="Answers go on a teacher-only slide at the end and in the lesson plan." rows={c.exit} disabled={dis} onChange={(v) => set("exit", v)} />

            <section aria-labelledby="routines-h" className="space-y-2">
              <h3 id="routines-h" className={ui.sectionTitle}>
                Routines
              </h3>
              <p className={ui.hint}>How pupils answer on Teams, shown as a badge on the slide. Left on “Usual”, the starter and hinge question are Show me, guided practice Cold call and the exit ticket Chat waterfall.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(ROUTINE_SECTIONS as string[]).map((k) => (
                  <RoutineSelect key={k} label={ROUTINE_SECTION_LABEL[k] || k} value={c.routines?.[k] || ""} disabled={dis} onChange={(v) => set("routines", { ...(c.routines || {}), [k]: v })} />
                ))}
              </div>
            </section>

            <fieldset disabled={dis} className="grid gap-4 sm:grid-cols-2">
              {Array.isArray(c.homework) ? (
                <LinesField label="Homework" hint="One per line." value={c.homework} onChange={(v) => set("homework", v)} />
              ) : (
                <TextField label="Homework" value={c.homework} onChange={(v) => set("homework", v)} multiline />
              )}
              <div className="sm:col-span-2">
                <TextField label="SEND, EAL and stretch" hint="One line: how to adapt the lesson" value={c.send || ""} onChange={(v) => set("send", v)} />
              </div>
              <TextField label="Cross-curricular link (optional)" value={c.crossCurricular || ""} onChange={(v) => set("crossCurricular", v)} />
              <TextField label="SMSC (optional)" hint="Spiritual, moral, social and cultural" value={c.smsc || ""} onChange={(v) => set("smsc", v)} />
            </fieldset>

            {canEdit && (
              <div className="space-y-3 rounded-xl border border-gold-light bg-cream/50 p-3">
                <TextField label="What did you change? (optional)" value={note} onChange={setNote} placeholder="e.g. Shorter starter for a catch-up lesson" />
                {loaded.custom_deck && (
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} className="mt-1" />
                    <span>
                      This lesson uses slides that were uploaded (or an older version that was restored). Tick to replace them with new slides built from this lesson. Leave it unticked to keep them; the lesson plan is
                      rebuilt either way. The uploaded slides stay in Version history.
                    </span>
                  </label>
                )}
              </div>
            )}
            {(() => {
              // Lessons v3 advice: never blocks saving.
              const advice = lessonWarnings(tidy(c), lesson.subject_slug, c.duration) as string[];
              return advice.length > 0 ? (
                <div className="rounded-lg border border-gold-light bg-cream px-3 py-2 text-sm text-ink/80">
                  <p className="font-semibold">Advice (you can still save)</p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {advice.map((a) => (
                      <li key={a}>This lesson {a}.</li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
            {problems.length > 0 && (
              <ul role="alert" className="list-disc space-y-0.5 rounded-lg border border-red-200 bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-gold-light bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                <button type="button" className={ui.btnPrimary} onClick={save} disabled={busy || (!dirty && !rebuild)}>
                  {busy ? "Saving…" : "Save and rebuild the slides"}
                </button>
                <button type="button" className={ui.btnSecondary} onClick={close} disabled={busy}>
                  Cancel
                </button>
                <span className="min-w-0 flex-1 text-sm text-ink/70">{dirty ? "You have unsaved changes." : "No unsaved changes."}</span>
              </div>
            )}
            <p className="text-xs text-ink/60">After you save, the slides (PowerPoint and PDF) and the lesson plan are rebuilt automatically, usually within 30 minutes. The previous slides stay in Version history.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Fill in any list the form expects but the stored lesson lacks. Items keep their answers and minutes. */
/** Test, mock or quiz: the slides then show exam conditions and marks, and keep the answers for the teacher. */
function AssessmentField({ value, title, unit, onChange }: { value: LessonBase["assessmentMode"]; title: string; unit: string; onChange: (v: LessonBase["assessmentMode"]) => void }) {
  const labels = ASSESSMENT_LABEL as Record<string, string>;
  const found = detectAssessment({ title, unit }) as { mode: string; matched: string } | null;
  const current = value === false ? "none" : value || "";
  return (
    <label className="block">
      <span className={ui.label}>Assessment (test, mock or quiz)</span>
      <Select value={current} onChange={(e) => onChange(e.target.value === "none" ? false : e.target.value ? (e.target.value as "test" | "mock" | "quiz") : undefined)} className={`mt-1 ${ui.select}`}>
        <option value="">{found ? `From the title: ${labels[found.mode]}` : "From the title: not an assessment"}</option>
        {(ASSESSMENT_MODES as string[]).map((m) => (
          <option key={m} value={m}>
            {labels[m]}
          </option>
        ))}
        <option value="none">Not an assessment</option>
      </Select>
      <span className="mt-1 block text-xs text-ink/65">An assessment gets an exam-conditions slide, questions with their marks, and the answers only in a teacher-only section at the end.</span>
    </label>
  );
}

function normalise(raw: LessonContent): FormContent {
  const rows = (a: unknown) => (Array.isArray(a) ? a.map(toRow) : typeof a === "string" && a ? [toRow(a)] : []);
  return {
    ...raw,
    title: String(raw.title || ""),
    unit: String(raw.unit || ""),
    objectives: lines(raw.objectives),
    starter: rows(raw.starter),
    practice: rows(raw.practice),
    independent: rows(raw.independent),
    exit: rows(raw.exit),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map((k) => ({ ...k, term: String(k?.term ?? ""), def: String(k?.def ?? "") })) : [],
    teach: Array.isArray(raw.teach) ? raw.teach.map((s) => ({ ...s, bullets: lines(s?.bullets), _key: newKey() })) : [],
    homework: Array.isArray(raw.homework) ? raw.homework.map(String) : String(raw.homework ?? ""),
  };
}

/** Questions with an optional answer and minutes each. */
function ItemsField({ label, hint, rows, onChange, disabled }: { label: string; hint?: string; rows: ItemRow[]; onChange: (v: ItemRow[]) => void; disabled?: boolean }) {
  const setRow = (i: number, r: Partial<ItemRow>) => onChange(rows.map((x, k) => (k === i ? { ...x, ...r } : x)));
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className={ui.label}>{label}</legend>
      <p className={ui.hint}>{hint || "One question per row."} The answer (optional) goes on a “Check your answers” slide and in the lesson plan.</p>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-gold-light/70 p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_auto]">
            <textarea aria-label={`${label} ${i + 1}: question`} value={r.q} onChange={(e) => setRow(i, { q: e.target.value })} rows={2} className={ui.textarea} placeholder="Question or task" />
            <textarea aria-label={`${label} ${i + 1}: answer`} value={r.a} onChange={(e) => setRow(i, { a: e.target.value })} rows={2} className={ui.textarea} placeholder="Answer (optional)" />
            <input aria-label={`${label} ${i + 1}: minutes`} type="number" min={1} max={30} value={r.mins} onChange={(e) => setRow(i, { mins: e.target.value })} className={ui.input} placeholder="Mins" />
            <button type="button" className={ui.btnLinkDanger} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
              Remove
            </button>
            <textarea aria-label={`${label} ${i + 1}: teacher's model`} value={r.model} onChange={(e) => setRow(i, { model: e.target.value })} rows={2} className={`sm:col-span-2 ${ui.textarea}`} placeholder="Teacher's worked model, gone through first (optional)" />
            <textarea aria-label={`${label} ${i + 1}: poll options`} value={r.options} onChange={(e) => setRow(i, { options: e.target.value })} rows={2} className={`sm:col-span-2 ${ui.textarea}`} placeholder="Teams poll options, 2 to 4, one per line (optional)" />
          </li>
        ))}
      </ol>
      <button type="button" className={btn} onClick={() => onChange([...rows, EMPTY_ROW])}>
        + Add a question
      </button>
    </fieldset>
  );
}

function RoutineSelect({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className={ui.label}>{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`mt-1 ${ui.select}`}>
        <option value="">Usual</option>
        {Object.entries(ROUTINES as Record<string, { label: string }>).map(([id, r]) => (
          <option key={id} value={id}>
            {r.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

const HOOK_LABEL: Record<string, string> = { ponder: "Ponder (first slide, while pupils join)", question: "A big question", "image-prompt": "Picture this (imagine a scene)", story: "A short story", puzzle: "A puzzle", "odd-one-out": "Odd one out" };

/** The optional hook: a striking first slide straight after the title. */
function HookField({ hook, onChange, disabled }: { hook?: Hook; onChange: (h: Hook | undefined) => void; disabled?: boolean }) {
  const h = hook || { type: "", text: "" };
  const up = (x: Partial<Hook>) => onChange({ ...h, ...x });
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-xl border border-gold-light p-3 sm:grid-cols-2">
      <legend className={`${ui.sectionTitle} px-1`}>Hook (optional)</legend>
      <p className={`sm:col-span-2 ${ui.hint}`}>A full-screen slide straight after the title to grab attention in the first minute.</p>
      <label className="block">
        <span className={ui.label}>Kind of hook</span>
        <Select value={h.type} onChange={(e) => (e.target.value ? up({ type: e.target.value }) : onChange(undefined))} className={`mt-1 ${ui.select}`}>
          <option value="">No hook</option>
          {(HOOK_TYPES as string[]).map((t) => (
            <option key={t} value={t}>
              {HOOK_LABEL[t] || t}
            </option>
          ))}
        </Select>
      </label>
      {h.type && (
        <>
          <TextField label="What it says" hint="At most 240 characters." value={h.text} onChange={(v) => up({ text: v })} multiline />
          <LinesField label="Options (optional)" hint="2 to 5, one per line. An odd-one-out needs 3 to 5." value={h.options || []} onChange={(v) => up({ options: v })} />
          <TextField label="Answer or what to draw out (optional)" hint="Goes in the notes and the lesson plan, not on the slide." value={h.a || ""} onChange={(v) => up({ a: v })} multiline />
        </>
      )}
    </fieldset>
  );
}

/** Lessons v3: the Islamic foundation at the start, or the Islamic position at the end. */
function IslamicLinkField({ value, onChange, disabled }: { value?: IslamicLink; onChange: (v: IslamicLink | undefined) => void; disabled?: boolean }) {
  const v = value || { text: "", at: "start" };
  return (
    <fieldset disabled={disabled} className="grid gap-3 rounded-xl border border-gold-light p-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <legend className={`${ui.sectionTitle} px-1`}>Islamic link (optional)</legend>
      <TextField label="What it says" hint="Cite only ayat you are certain of (surah:ayah). Leave empty for none." value={v.text} onChange={(text) => onChange(text.trim() || v.text ? { ...v, text } : undefined)} multiline />
      <label className="block">
        <span className={ui.label}>Where</span>
        <Select value={v.at} onChange={(e) => onChange({ ...v, at: e.target.value })} className={`mt-1 ${ui.select}`}>
          <option value="start">At the start: the foundation</option>
          <option value="end">At the end: the Islamic position</option>
        </Select>
      </label>
    </fieldset>
  );
}

/** Lessons v3: pictures found on Wikimedia Commons when the slides are built (never of people). */
function PicturesField({ value, teachCount, onChange, disabled }: { value: Picture[]; teachCount: number; onChange: (v: Picture[]) => void; disabled?: boolean }) {
  const setRow = (i: number, r: Partial<Picture>) => onChange(value.map((x, k) => (k === i ? { ...x, ...r } : x)));
  const places = ["hook", "keywords", ...Array.from({ length: teachCount }, (_, i) => `teach:${i + 1}`)];
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-gold-light p-3">
      <legend className={`${ui.sectionTitle} px-1`}>Pictures (optional)</legend>
      <p className={ui.hint}>2 to 4 real photos, maps or diagrams of the topic, found on Wikimedia Commons when the slides are built. Never people or drawn living beings. To choose a picture yourself, put its Commons file name (File:…) in File.</p>
      <ol className="space-y-2">
        {value.map((r, i) => (
          <li key={i} className="grid gap-2 rounded-lg border border-gold-light/70 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]">
            <input aria-label={`Picture ${i + 1}: search for`} value={r.find} onChange={(e) => setRow(i, { find: e.target.value })} className={ui.input} placeholder="Search for, e.g. Viking longship replica" />
            <input aria-label={`Picture ${i + 1}: what it shows`} value={r.alt} onChange={(e) => setRow(i, { alt: e.target.value })} className={ui.input} placeholder="What it shows" />
            <Select aria-label={`Picture ${i + 1}: slide`} value={r.for} onChange={(e) => setRow(i, { for: e.target.value })} className={ui.select}>
              {places.map((p) => (
                <option key={p} value={p}>
                  {p === "hook" ? "First slide" : p === "keywords" ? "Key words" : `Teaching slide ${p.slice(6)}`}
                </option>
              ))}
            </Select>
            <button type="button" className={ui.btnLinkDanger} onClick={() => onChange(value.filter((_, k) => k !== i))}>
              Remove
            </button>
            <input aria-label={`Picture ${i + 1}: Commons file`} value={r.file || ""} onChange={(e) => setRow(i, { file: e.target.value })} className={`sm:col-span-2 ${ui.input}`} placeholder="File (optional), e.g. File:Leaf cross section.svg" />
          </li>
        ))}
      </ol>
      {value.length < 8 && (
        <button type="button" className={btn} onClick={() => onChange([...value, { find: "", alt: "", for: "keywords" }])}>
          + Add a picture
        </button>
      )}
    </fieldset>
  );
}

/** A slide's block as JSON (checked as you type), with a template for each kind. */
function BlockField({ slide, onChange, onInvalid, disabled }: { slide: Slide; onChange: (kind: string | null, value: unknown) => void; onInvalid: (bad: boolean) => void; disabled?: boolean }) {
  const kind = blockOf(slide) || "";
  const propText = kind ? JSON.stringify(slide[kind], null, 2) : "";
  const [text, setText] = useState(propText);
  const [synced, setSynced] = useState(propText);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // The block changed from outside this box (another version loaded, a template picked): show it,
  // unless the box holds an edit that does not parse yet.
  if (propText !== synced) {
    setSynced(propText);
    if (!invalid) {
      let same = false;
      try {
        same = JSON.stringify(JSON.parse(text || "null")) === JSON.stringify(kind ? slide[kind] : null);
      } catch {
        same = false;
      }
      if (!same) setText(propText);
    }
  }
  const markInvalid = (bad: boolean) => {
    setInvalid(bad);
    onInvalid(bad);
  };
  const pick = (k: string) => {
    markInvalid(false);
    setError(null);
    if (!k) {
      setText("");
      return onChange(null, null);
    }
    const v = k === kind ? slide[k] : BLOCK_TEMPLATE[k];
    setText(JSON.stringify(v, null, 2));
    setOpen(true);
    onChange(k, v);
  };
  const edit = (t: string) => {
    setText(t);
    try {
      const v = JSON.parse(t);
      const problems = blockProblems({ ...withBlock(slide, kind, v), heading: slide.heading }).problems as string[];
      setError(problems.length ? problems.join("; ") : null);
      markInvalid(false);
      onChange(kind, v);
    } catch {
      markInvalid(true);
      setError("This is not valid JSON yet (check the commas, quotes and brackets). The lesson cannot be saved until it is.");
    }
  };
  return (
    <div className="space-y-2 rounded-lg bg-cream/60 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className={ui.label}>Slide block (optional)</span>
          <Select value={kind} disabled={disabled} onChange={(e) => pick(e.target.value)} className={`mt-1 ${ui.select}`}>
            <option value="">None: bullet points only</option>
            {(BLOCKS as string[]).map((k) => (
              <option key={k} value={k}>
                {BLOCK_LABEL[k] ? `${BLOCK_LABEL[k][0].toUpperCase()}${BLOCK_LABEL[k].slice(1)}` : k} ({k})
              </option>
            ))}
          </Select>
        </label>
        {kind && (
          <button type="button" className={btn} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the block" : "Edit the block"}
          </button>
        )}
      </div>
      {kind && open && (
        <label className="block">
          <span className={ui.hint}>The block as JSON. Its shape is in the lesson format guide (content/lessons/README.md).</span>
          <textarea value={text} disabled={disabled} onChange={(e) => edit(e.target.value)} rows={Math.min(16, text.split("\n").length + 1)} spellCheck={false} className={`mt-1 font-mono text-xs ${ui.textarea}`} />
        </label>
      )}
      {error && <p className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
