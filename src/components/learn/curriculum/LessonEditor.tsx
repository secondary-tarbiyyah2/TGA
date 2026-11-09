"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { LinesField, Modal, TextField } from "@/components/learn/curriculum/Modal";
import { problemsFor, syncNotes, triggerCurriculumSync, when, type SyncNote } from "@/lib/learn/curriculumUnits";
import type { CurriculumLesson } from "@/lib/learn/curriculum";

// The lesson as stored in curriculum_lessons.content: the lesson object from
// content/lessons/<subject>/<year>.json (content/lessons/README.md). Fields this form does not
// show (slide blocks such as worked examples, board, anything else) are kept as they are.
type Slide = { heading?: string; bullets?: string[]; note?: string; [block: string]: unknown };
type Keyword = { term: string; def: string };
export type LessonContent = {
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
  starter: string[];
  teach: Slide[];
  practice: string[];
  independent: string[];
  exit: string[];
  homework: string | string[];
  send?: string;
  [key: string]: unknown;
};

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
};
const blockOf = (s: Slide) => Object.keys(BLOCK_LABEL).find((k) => s[k] != null);
const btn = `${ui.btnSecondary} ${ui.sm}`;
const lines = (a: unknown) => (Array.isArray(a) ? a.map(String) : typeof a === "string" && a ? [a] : []);
const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);

/** Tidy the form for saving, so the lesson always passes the content checks the slide builder runs. */
function tidy(c: LessonContent): LessonContent {
  const out: LessonContent = { ...c, title: c.title.trim(), unit: c.unit.trim() };
  const lists = ["objectives", "starter", "practice", "independent", "exit"] as const;
  lists.forEach((k) => (out[k] = clean(out[k])));
  out.keywords = c.keywords.map((k) => ({ ...k, term: k.term.trim(), def: k.def.trim() })).filter((k) => k.term);
  out.teach = c.teach.map((s) => {
    const t: Slide = { ...s, heading: (s.heading || "").trim(), bullets: clean(s.bullets || []) };
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
  return out;
}

function problemsOf(c: LessonContent): string[] {
  const p: string[] = [];
  if (!c.title) p.push("Give the lesson a title.");
  if (!c.unit) p.push("Say which unit the lesson belongs to.");
  if (!c.objectives.length) p.push("Add at least one objective.");
  if (!c.starter.length) p.push("Add at least one starter question.");
  if (c.teach.length < 3 || c.teach.length > 7) p.push("A lesson needs 3 to 7 teaching slides.");
  c.teach.forEach((s, i) => {
    if (!s.heading || (!blockOf(s) && !(s.bullets || []).length)) p.push(`Teaching slide ${i + 1} needs a heading and at least one bullet point.`);
  });
  if (!c.practice.length) p.push("Add at least one practice question.");
  if (!c.independent.length) p.push("Add at least one independent task.");
  if (!c.exit.length) p.push("Add at least one exit ticket question.");
  if (!(Array.isArray(c.homework) ? c.homework.length : c.homework)) p.push("Add the homework.");
  if ((c.successCriteria || []).length > 3) p.push("Success criteria are at most three lines (all, most, some).");
  return p;
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
  const [c, setC] = useState<LessonContent | null>(null);
  const [note, setNote] = useState("");
  const [rebuild, setRebuild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
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
  const notesHere = problemsFor(allNotes, [`lesson:${lesson.subject_slug}/${lesson.year}/${lesson.lesson_no}`], loaded?.content_updated_at);
  const dirty = !!(c && loaded?.content && JSON.stringify(tidy(c)) !== JSON.stringify(tidy(normalise(loaded.content))));
  const set = <K extends keyof LessonContent>(k: K, v: LessonContent[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const setSlide = (i: number, s: Partial<Slide>) => setC((x) => (x ? { ...x, teach: x.teach.map((t, k) => (k === i ? { ...t, ...s } : t)) } : x));
  const moveSlide = (i: number, dir: -1 | 1) =>
    setC((x) => {
      if (!x) return x;
      const t = [...x.teach];
      [t[i], t[i + dir]] = [t[i + dir], t[i]];
      return { ...x, teach: t };
    });

  const close = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };

  const save = async () => {
    if (!supabase || !c || !loaded) return;
    const t = tidy(c);
    const p = problemsOf(t);
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
    const msg = await triggerCurriculumSync("lesson");
    onSaved(loaded.custom_deck && !rebuild ? `${msg.split(".")[0]}. This lesson uses slides you uploaded, so they stay as they are; its lesson plan is rebuilt from your changes.` : msg);
  };

  const showHistory = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("curriculum_lesson_content_versions").select("id, content, note, edited_by_name, edited_at, replaced_at").eq("lesson_id", lesson.id).order("replaced_at", { ascending: false }).limit(30);
    setVersions((data as Version[]) || []);
  };

  const dis = !canEdit || busy;
  return (
    <Modal title={`Edit lesson ${lesson.lesson_no}: ${lesson.title}`} onClose={close} wide>
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
              <div className="sm:col-span-2">
                <TextField label="Big question (optional)" hint="Gets its own slide and comes back on the exit ticket" value={c.bigQuestion || ""} onChange={(v) => set("bigQuestion", v)} />
              </div>
              <LinesField label="Objectives" hint="One per line." value={c.objectives} onChange={(v) => set("objectives", v)} />
              <LinesField label="Success criteria (optional)" hint="Up to three lines: All, Most, Some." value={c.successCriteria || []} onChange={(v) => set("successCriteria", v)} />
              <div className="sm:col-span-2">
                <LinesField label="Starter" hint="Retrieval questions, one per line." value={c.starter} onChange={(v) => set("starter", v)} />
              </div>
            </fieldset>

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
                    <li key={i} className="rounded-xl border border-gold-light p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Slide {i + 1}</p>
                      <fieldset disabled={dis} className="grid gap-3">
                        <TextField label="Heading" value={s.heading || ""} onChange={(v) => setSlide(i, { heading: v })} />
                        <LinesField label={block ? "Bullet points (optional)" : "Bullet points"} hint="One per line." value={s.bullets || []} onChange={(v) => setSlide(i, { bullets: v })} rows={3} />
                        <TextField label="Teacher note" hint="What to say and ask; shown in the speaker notes and the lesson plan" value={s.note || ""} onChange={(v) => setSlide(i, { note: v })} multiline />
                        {block && <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/75">This slide also shows {BLOCK_LABEL[block]}. It is kept as it is.</p>}
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
                <button type="button" className={btn} disabled={busy} onClick={() => set("teach", [...c.teach, { heading: "", bullets: [] }])}>
                  + Add a slide
                </button>
              )}
            </section>

            <fieldset disabled={dis} className="grid gap-4 sm:grid-cols-2">
              <LinesField label="Practice (guided questions)" hint="One per line." value={c.practice} onChange={(v) => set("practice", v)} />
              <LinesField label="Independent tasks" hint="One per line, e.g. core, extend, stretch." value={c.independent} onChange={(v) => set("independent", v)} />
              <LinesField label="Exit ticket" hint="One question per line." value={c.exit} onChange={(v) => set("exit", v)} />
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

/** Fill in any list the form expects but the stored lesson lacks. */
function normalise(raw: LessonContent): LessonContent {
  return {
    ...raw,
    title: String(raw.title || ""),
    unit: String(raw.unit || ""),
    objectives: lines(raw.objectives),
    starter: lines(raw.starter),
    practice: lines(raw.practice),
    independent: lines(raw.independent),
    exit: lines(raw.exit),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map((k) => ({ ...k, term: String(k?.term ?? ""), def: String(k?.def ?? "") })) : [],
    teach: Array.isArray(raw.teach) ? raw.teach.map((s) => ({ ...s, bullets: lines(s?.bullets) })) : [],
    homework: Array.isArray(raw.homework) ? raw.homework.map(String) : String(raw.homework ?? ""),
  };
}
