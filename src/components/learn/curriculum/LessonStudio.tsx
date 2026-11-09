"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { Icon } from "@/components/learn/Icon";
import { printElement } from "@/components/learn/printScope";
import { problemsOf, type LessonContent } from "@/components/learn/curriculum/LessonEditor";
import { FeedbackItem } from "@/components/learn/curriculum/LessonFeedback";
import { callEdgeFunction } from "@/lib/learn/edge";
import { realEditAt, when } from "@/lib/learn/curriculumUnits";
import { LESSON_COLUMNS, downloadDeck, fileNameFor, pathFor, saveBlob, yearLabel, type CurriculumLesson, type LessonFileKind } from "@/lib/learn/curriculum";
import { answerFeedback, loadFeedback, type LessonFeedback } from "@/lib/learn/lessonFeedback";
import { BLOCKS } from "@/lib/learn/lessonSchema.mjs";

// Edit a lesson directly on its slides (Tafweed T35). Every text box on the slide preview and in
// the lesson plan is edited in place; Save stores the lesson exactly as the form editor does
// (curriculum_save_lesson_content), then the quick build (workflow "Build one lesson") makes the
// new PowerPoint, PDF and lesson plan, and this window offers them as soon as they are ready.
// "Download PDF of this lesson" prints the preview itself, straight away.
//
// The lesson is kept as a plain object and only the text that is edited changes, so fields this
// editor does not show (slide blocks' numbers, routines, pictures and anything a newer lesson
// format adds) are saved back unchanged.

type Json = unknown;
type Obj = Record<string, Json>;
type Item = string | { q?: string; a?: string; mins?: number; [k: string]: Json };
type Slide = { heading?: string; bullets?: string[]; note?: string; [k: string]: Json };
type Content = LessonContent & Obj;
type Build = { status: "queued" | "building" | "ready" | "failed"; requested_at: string; started_at: string | null; finished_at: string | null; message: string | null };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const str = (x: Json) => (typeof x === "string" ? x : x == null ? "" : String(x));
const qOf = (x: Item) => (typeof x === "string" ? x : str(x?.q));
const aOf = (x: Item) => (typeof x === "string" ? "" : str(x?.a));
const listOf = (x: Json): string[] => (Array.isArray(x) ? x.map(str) : typeof x === "string" && x ? [x] : []);
const blockOf = (s: Slide) => (BLOCKS as string[]).find((k) => s[k] != null);
const btn = `${ui.btnSecondary} ${ui.sm}`;
const humanKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** The slides of the preview, in teaching order; `key` is also the part a feedback note names. */
function slideList(c: Content): { key: string; label: string }[] {
  return [
    { key: "title", label: "Title" },
    { key: "objectives", label: "Objectives" },
    ...(c.hook ? [{ key: "hook", label: "Hook" }] : []),
    ...(c.islamicLink && (c.islamicLink as Obj).at !== "end" ? [{ key: "islamic", label: "Islamic foundation" }] : []),
    ...(Array.isArray(c.keywords) && c.keywords.length ? [{ key: "keywords", label: "Key words" }] : []),
    { key: "starter", label: "Starter" },
    ...(c.teach || []).map((t, i) => ({ key: `teach:${i}`, label: (t as Slide).heading || `Teaching slide ${i + 1}` })),
    { key: "practice", label: "Guided practice" },
    { key: "independent", label: "Independent" },
    { key: "exit", label: "Exit ticket" },
    ...(c.islamicLink && (c.islamicLink as Obj).at === "end" ? [{ key: "islamic", label: "Islamic position" }] : []),
    { key: "homework", label: "Homework" },
  ];
}

/** Drop empty lines and questions left behind while editing; everything else is kept as it is. */
function tidyContent(c: Content): Content {
  const out = clone(c);
  const lines = (a: Json) => listOf(a).map((x) => x.trim()).filter(Boolean);
  out.title = str(out.title).trim();
  out.unit = str(out.unit).trim();
  out.objectives = lines(out.objectives);
  if (out.successCriteria) {
    const sc = lines(out.successCriteria);
    if (sc.length) out.successCriteria = sc;
    else delete out.successCriteria;
  }
  for (const k of ["starter", "practice", "independent", "exit"] as const) {
    out[k] = ((out[k] as Item[]) || [])
      .map((x) => (typeof x === "string" ? x.trim() : { ...x, q: str(x.q).trim(), ...(x.a != null ? { a: str(x.a).trim() } : {}) }))
      .filter((x) => qOf(x as Item))
      .map((x) => {
        if (typeof x === "string") return x;
        const o = { ...x } as Obj;
        if (o.a === "") delete o.a;
        return Object.keys(o).length === 1 ? (o.q as string) : o;
      }) as LessonContent["starter"];
  }
  out.keywords = (out.keywords || []).map((k) => ({ ...k, term: str(k.term).trim(), def: str(k.def).trim() })).filter((k) => k.term);
  out.teach = (out.teach || []).map((s0) => {
    const s = { ...(s0 as Slide) };
    s.heading = str(s.heading).trim();
    if (s.bullets) s.bullets = lines(s.bullets);
    if (!s.bullets?.length && blockOf(s)) delete s.bullets;
    if (typeof s.note === "string") {
      s.note = s.note.trim();
      if (!s.note) delete s.note;
    }
    return s;
  });
  out.homework = Array.isArray(out.homework) ? lines(out.homework) : str(out.homework).trim();
  for (const k of ["bigQuestion", "send", "crossCurricular", "smsc"]) {
    if (typeof out[k] === "string") {
      out[k] = (out[k] as string).trim();
      if (!out[k]) delete out[k];
    }
  }
  return out;
}

/**
 * Text edited in place on the slide. It looks like the slide's own text; hovering shows it can be
 * edited, and it behaves as a labelled text box for keyboards and screen readers.
 */
function Edit({
  value,
  onChange,
  label,
  canEdit,
  className = "",
  multiline,
  placeholder,
  onEnter,
  onRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  canEdit: boolean;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
  onEnter?: () => void;
  onRemove?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value, canEdit]);
  // Read-only (or while saving) the text is rendered by React; the keys keep the two apart, so the
  // editable box is never emptied by React taking its own text back out.
  if (!canEdit)
    return (
      <span key="ro" className={`whitespace-pre-line ${className}`}>
        {value}
      </span>
    );
  return (
    <span
      key="rw"
      ref={ref}
      role="textbox"
      aria-label={label}
      aria-multiline={multiline ? true : undefined}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      tabIndex={0}
      data-placeholder={placeholder || "Type here"}
      className={`studio-edit block min-h-[1.2em] cursor-text whitespace-pre-line rounded-sm outline-none transition-colors hover:bg-gold-100/60 focus:bg-white focus:ring-2 focus:ring-teal-700 empty:before:text-ink/40 empty:before:content-[attr(data-placeholder)] print:hover:bg-transparent ${className}`}
      onInput={(e) => onChange(e.currentTarget.innerText.replace(/ /g, " ").replace(multiline ? /$^/ : /\n+$/, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          if (!multiline || onEnter) {
            e.preventDefault();
            onEnter?.();
            if (!onEnter) e.currentTarget.blur();
          }
        }
        if (e.key === "Backspace" && onRemove && !e.currentTarget.innerText.trim()) {
          e.preventDefault();
          // Leave the box first, so the boxes below show their new text once this one is gone.
          e.currentTarget.blur();
          onRemove();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, multiline ? t : t.replace(/\s*\n\s*/g, " "));
      }}
    />
  );
}

/** A slide block (worked example, hinge question, table…): every piece of text in it is editable; its shape stays as it is. */
function BlockView({ value, onChange, canEdit, label }: { value: Json; onChange: (v: Json) => void; canEdit: boolean; label: string }) {
  if (typeof value === "string") return <Edit value={value} onChange={onChange} canEdit={canEdit} label={label} multiline />;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return <span className="text-ink/70">{String(value ?? "")}</span>;
  // A table ({ head, rows }) is shown as a table, each cell edited in place.
  const t = value as { head?: Json; rows?: Json };
  if (t && typeof t === "object" && !Array.isArray(t) && Array.isArray(t.head) && Array.isArray(t.rows) && (t.rows as Json[]).every(Array.isArray)) {
    const head = t.head as Json[];
    const rows = t.rows as Json[][];
    const cell = (v: Json, l: string, set: (nv: Json) => void) => (typeof v === "string" ? <Edit value={v} onChange={set} canEdit={canEdit} label={l} /> : <span>{String(v ?? "")}</span>);
    return (
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b-2 border-gold-500 px-[0.8cqw] py-[0.4cqw] font-semibold">
                {cell(h, `${label}, column ${i + 1} heading`, (nv) => onChange({ ...t, head: head.map((x, j) => (j === i ? nv : x)) }))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-gold-light">
              {r.map((v, ci) => (
                <td key={ci} className="px-[0.8cqw] py-[0.4cqw] align-top">
                  {cell(v, `${label}, row ${ri + 1} column ${ci + 1}`, (nv) => onChange({ ...t, rows: rows.map((x, j) => (j === ri ? x.map((y, k) => (k === ci ? nv : y)) : x)) }))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ol className="space-y-[0.4cqw] pl-[2cqw]">
        {value.map((v, i) => (
          <li key={i} className="list-decimal">
            <BlockView value={v} canEdit={canEdit} label={`${label}, item ${i + 1}`} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} />
          </li>
        ))}
      </ol>
    );
  }
  const o = value as Obj;
  return (
    <div className="space-y-[0.6cqw]">
      {Object.keys(o).map((k) => (
        <div key={k}>
          <span className="block text-[1.3cqw] font-semibold uppercase tracking-wide text-gold-900">{humanKey(k)}</span>
          <BlockView value={o[k]} canEdit={canEdit} label={`${label}, ${humanKey(k)}`} onChange={(nv) => onChange({ ...o, [k]: nv })} />
        </div>
      ))}
    </div>
  );
}

/** One 16:9 slide of the preview: brand bar, kind, and the slide's content. */
function SlideFrame({ id, n, kind, active, notes, children, below, onSelect }: { id: string; n: number; kind: string; active: boolean; notes: number; children: React.ReactNode; below?: React.ReactNode; onSelect: () => void }) {
  return (
    <section id={id} aria-label={`Slide ${n}: ${kind}`} className="studio-slide scroll-mt-4 break-inside-avoid print:break-after-page" onFocusCapture={onSelect} onMouseDown={onSelect}>
      <div className={`@container relative aspect-[16/9] w-full overflow-hidden rounded-lg border bg-white shadow-sm print:rounded-none print:shadow-none ${active ? "border-teal-700 ring-2 ring-teal-700/30" : "border-gold-light"}`}>
        <div className="absolute inset-x-0 top-0 h-[1.2cqw] bg-gold-500" aria-hidden="true" />
        <div className="flex h-full flex-col px-[5cqw] pb-[3cqw] pt-[4cqw] text-[2.2cqw] leading-snug text-ink">
          <p className="mb-[1.5cqw] flex items-center gap-[1cqw] text-[1.4cqw] font-semibold uppercase tracking-widest text-gold-900">
            <span>{kind}</span>
            {notes > 0 && <span className="rounded-full bg-amber-100 px-[0.8cqw] text-amber-900 print:hidden">{notes} note{notes === 1 ? "" : "s"}</span>}
          </p>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          <p className="mt-[1cqw] flex justify-between text-[1.2cqw] text-ink/55">
            <span>Tarbiyyah Global Academy</span>
            <span>{n}</span>
          </p>
        </div>
      </div>
      {below}
    </section>
  );
}

export function LessonStudio({
  lesson,
  canEdit: canEditRole,
  feedback,
  isHead,
  onClose,
  onSaved,
  onOpenForm,
  onFeedback,
}: {
  lesson: CurriculumLesson;
  canEdit: boolean;
  feedback?: LessonFeedback | null;
  isHead?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onOpenForm?: () => void;
  onFeedback?: (part: string, content: Content | null) => void;
}) {
  const supabase = getSupabaseClient();
  const [loaded, setLoaded] = useState<{ content: Content | null; content_updated_at: string | null; content_updated_by_name: string | null; custom_deck: boolean } | null>(null);
  const [c, setC] = useState<Content | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [tab, setTab] = useState<"slides" | "plan">(feedback?.part === "plan" ? "plan" : "slides");
  const [active, setActive] = useState<string>(feedback?.part && feedback.part !== "lesson" ? feedback.part : "title");
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [rebuild, setRebuild] = useState(false);
  const [mayEdit, setMayEdit] = useState(canEditRole);
  const [notes, setNotes] = useState<LessonFeedback[]>(feedback ? [feedback] : []);
  const [build, setBuild] = useState<Build | null>(null);
  const [watching, setWatching] = useState(false);
  const [files, setFiles] = useState<CurriculumLesson>(lesson);
  const [status, setStatus] = useState<string | null>(null);
  // Queued for over four minutes: the quick build is not coming (the hourly build still is).
  const [stale, setStale] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const savedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    (async () => {
      const { data, error: e } = await supabase.from("curriculum_lessons").select("content, content_updated_at, content_updated_by_name, custom_deck").eq("id", lesson.id).maybeSingle();
      if (!live) return;
      if (e || !data) return setError("Couldn't open this lesson for editing. Try again later.");
      const d = data as NonNullable<typeof loaded>;
      setLoaded(d);
      savedAt.current = d.content_updated_at;
      if (d.content) {
        setC(clone(d.content));
        setSavedJson(JSON.stringify(tidyContent(d.content)));
      }
      // The database decides (subject rule, migration 0191); before it is deployed, the role decides.
      if (canEditRole) {
        const r = await supabase.rpc("curriculum_can_edit_lesson", { p_lesson: lesson.id });
        if (live && !r.error && r.data === false) setMayEdit(false);
      }
      if (isHead || canEditRole) {
        const fb = await loadFeedback({ lessonId: lesson.id, openOnly: true });
        if (live) setNotes((n) => [...n, ...fb.filter((f) => !n.some((x) => x.id === f.id))]);
      }
    })();
    return () => {
      live = false;
    };
  }, [supabase, lesson.id, canEditRole, isHead]);

  // Opened from "Accept and edit": the note is accepted, and its slide is shown.
  useEffect(() => {
    if (!feedback || !isHead || feedback.status !== "open") return;
    answerFeedback(feedback.id, "accepted").then((e) => !e && setNotes((n) => n.map((x) => (x.id === feedback.id ? { ...x, status: "accepted" } : x))));
  }, [feedback, isHead]);
  useEffect(() => {
    if (!c || !feedback?.part) return;
    const t = window.setTimeout(() => document.getElementById(`studio-${feedback.part.replace(":", "-")}`)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the lesson has loaded
  }, [!!c]);

  // Watch the quick build until it is ready (or clearly not coming).
  const poll = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("curriculum_lesson_builds").select("status, requested_at, started_at, finished_at, message").eq("lesson_id", lesson.id).maybeSingle();
    const b = (data as Build | null) || null;
    setBuild(b);
    const old = !!b && b.status === "queued" && Date.now() - new Date(b.requested_at).getTime() > 4 * 60_000;
    setStale(old);
    if (old) setWatching(false);
    if (b?.status === "ready" || b?.status === "failed") {
      setWatching(false);
      const { data: row } = await supabase.from("curriculum_lessons").select(LESSON_COLUMNS).eq("id", lesson.id).maybeSingle();
      if (row) setFiles(row as unknown as CurriculumLesson);
    }
  }, [supabase, lesson.id]);
  useEffect(() => {
    if (!watching) return;
    const t = window.setInterval(poll, 5000);
    return () => window.clearInterval(t);
  }, [watching, poll]);

  const dirty = !!c && JSON.stringify(tidyContent(c)) !== savedJson;
  const up = (fn: (x: Content) => void) =>
    setC((x) => {
      if (!x) return x;
      const y = clone(x);
      fn(y);
      return y;
    });
  const slides = useMemo(() => (c ? slideList(c) : []), [c]);
  const notesFor = (key: string) => notes.filter((f) => f.part === key && (f.status === "open" || f.status === "accepted")).length;
  const edit = mayEdit && !busy;

  const close = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };

  const save = async () => {
    if (!supabase || !c || !loaded) return;
    const t = tidyContent(c);
    const p = problemsOf(t);
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    setStatus(null);
    const { data: stamp, error: e } = await supabase.rpc("curriculum_save_lesson_content", { p_lesson: lesson.id, p_content: t, p_note: note, p_rebuild_slides: rebuild, p_expected: savedAt.current });
    if (e) {
      setBusy(false);
      setProblems([
        /edited_elsewhere/.test(e.message)
          ? "Someone else saved this lesson while you were editing it. Copy anything you need, close this window and open the lesson again to see their changes."
          : /not allowed/.test(e.message)
            ? "You can edit lessons in the subjects you teach. Ask the Headteacher if this lesson should be yours."
            : `Couldn't save: ${e.message}`,
      ]);
      return;
    }
    savedAt.current = (stamp as string) || savedAt.current;
    setSavedJson(JSON.stringify(t));
    setC(t);
    setNote("");
    // A note the Headteacher accepted is done once the change is saved.
    const accepted = notes.filter((f) => f.status === "accepted" || (feedback && f.id === feedback.id && f.status === "open"));
    if (isHead && accepted.length) {
      await Promise.all(accepted.map((f) => answerFeedback(f.id, "done", "Changed in the lesson")));
      setNotes((n) => n.map((f) => (accepted.some((a) => a.id === f.id) ? { ...f, status: "done", response: "Changed in the lesson" } : f)));
    }
    const r = await callEdgeFunction("curriculum-sync", { lesson_id: lesson.id });
    const quick = (r as { quick?: { ok: boolean } }).quick;
    setBusy(false);
    if (quick?.ok) {
      setBuild({ status: "queued", requested_at: new Date().toISOString(), started_at: null, finished_at: null, message: null });
      setWatching(true);
      setStatus(`Saved.${accepted.length && isHead ? " The feedback is marked done." : ""}`);
    } else {
      setStatus("Saved. The slides, lesson plan and PDFs are rebuilt automatically within the hour. You can download a PDF of this preview now.");
    }
    onSaved("Lesson saved.");
  };

  const download = async (kind: LessonFileKind) => {
    const p = pathFor(files, kind);
    const blob = p ? await downloadDeck(p) : null;
    if (!blob) return setStatus("Couldn't download that file.");
    saveBlob(blob, fileNameFor({ ...files, title: c?.title || files.title }, kind));
  };


  // ── slide bodies ────────────────────────────────────────────────────
  const itemsSlide = (k: "starter" | "practice" | "independent" | "exit", heading: string) => {
    const items = ((c?.[k] as Item[]) || []) as Item[];
    const setQ = (i: number, v: string) => up((x) => ((x[k] as Item[])[i] = typeof items[i] === "string" ? v : { ...(items[i] as Obj), q: v }));
    const setA = (i: number, v: string) => up((x) => ((x[k] as Item[])[i] = typeof items[i] === "string" ? (v ? { q: items[i] as string, a: v } : v || (items[i] as string)) : { ...(items[i] as Obj), a: v }));
    const add = (at: number) => up((x) => (x[k] as Item[]).splice(at, 0, ""));
    const remove = (i: number) => up((x) => (x[k] as Item[]).splice(i, 1));
    return {
      body: (
        <div>
          <p className="mb-[1.5cqw] font-serif text-[3.4cqw] font-semibold">{heading}</p>
          <ol className="space-y-[1cqw] pl-[3cqw]">
            {items.map((it, i) => (
              <li key={i} className="list-decimal">
                <Edit value={qOf(it)} onChange={(v) => setQ(i, v)} canEdit={edit} label={`${heading} question ${i + 1}`} onEnter={() => add(i + 1)} onRemove={() => remove(i)} placeholder="Question or task" />
              </li>
            ))}
          </ol>
        </div>
      ),
      below: (
        <div className="mt-2 rounded-lg border border-dashed border-gold-light bg-cream/60 p-2 text-sm print:break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Answers (teacher only, in the notes and the plan)</p>
          <ol className="mt-1 space-y-1 pl-5">
            {items.map((it, i) => (
              <li key={i} className="list-decimal">
                <Edit value={aOf(it)} onChange={(v) => setA(i, v)} canEdit={edit} label={`${heading} answer ${i + 1}`} placeholder="No answer given" />
              </li>
            ))}
          </ol>
          {edit && (
            <button type="button" className={`${ui.btnLink} !text-xs print:hidden`} onClick={() => add(items.length)}>
              + Add a question
            </button>
          )}
        </div>
      ),
    };
  };

  const slideBody = (key: string): { body: React.ReactNode; below?: React.ReactNode } => {
    if (!c) return { body: null };
    if (key === "title")
      return {
        body: (
          <div className="flex h-full flex-col justify-center">
            <p className="text-[1.8cqw] text-ink/70">
              {lesson.subject} · {yearLabel(lesson.year)} · Lesson {lesson.lesson_no}
            </p>
            <Edit value={str(c.unit)} onChange={(v) => up((x) => (x.unit = v))} canEdit={edit} label="Unit" className="text-[2cqw] text-gold-900" />
            <Edit value={str(c.title)} onChange={(v) => up((x) => (x.title = v))} canEdit={edit} label="Lesson title" className="mt-[1cqw] font-serif text-[5cqw] font-semibold leading-tight" />
            <div className="mt-[3cqw] border-l-[0.5cqw] border-gold-500 pl-[2cqw]">
              <p className="text-[1.4cqw] font-semibold uppercase tracking-widest text-ink/60">Big question</p>
              <Edit value={str(c.bigQuestion)} onChange={(v) => up((x) => (x.bigQuestion = v))} canEdit={edit} label="Big question" placeholder="No big question" className="text-[2.6cqw]" />
            </div>
          </div>
        ),
      };
    if (key === "objectives") {
      const obj = listOf(c.objectives);
      const sc = listOf(c.successCriteria);
      return {
        body: (
          <div className="grid h-full gap-[3cqw] sm:grid-cols-2 print:grid-cols-2">
            <div>
              <p className="mb-[1cqw] font-serif text-[3.2cqw] font-semibold">Today we will</p>
              <ul className="space-y-[0.8cqw] pl-[3cqw]">
                {obj.map((o, i) => (
                  <li key={i} className="list-disc">
                    <Edit value={o} onChange={(v) => up((x) => ((x.objectives as string[])[i] = v))} canEdit={edit} label={`Objective ${i + 1}`} onEnter={() => up((x) => (x.objectives as string[]).splice(i + 1, 0, ""))} onRemove={() => up((x) => (x.objectives as string[]).splice(i, 1))} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-[1cqw] font-serif text-[3.2cqw] font-semibold">Success looks like</p>
              <ul className="space-y-[0.8cqw] pl-[3cqw]">
                {(sc.length ? sc : [""]).map((o, i) => (
                  <li key={i} className="list-disc">
                    <Edit
                      value={o}
                      onChange={(v) => up((x) => (x.successCriteria = Object.assign([...listOf(x.successCriteria)], { [i]: v })))}
                      canEdit={edit}
                      label={`Success criterion ${i + 1}`}
                      placeholder="All, most, some (optional)"
                      onEnter={() => sc.length < 3 && up((x) => (x.successCriteria = [...listOf(x.successCriteria).slice(0, i + 1), "", ...listOf(x.successCriteria).slice(i + 1)]))}
                      onRemove={() => up((x) => (x.successCriteria = listOf(x.successCriteria).filter((_, j) => j !== i)))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ),
      };
    }
    if (key === "hook" && c.hook) {
      const h = c.hook as Obj;
      return {
        body: (
          <div className="flex h-full flex-col justify-center text-center">
            <Edit value={str(h.text)} onChange={(v) => up((x) => ((x.hook as Obj).text = v))} canEdit={edit} label="Hook" multiline className="font-serif text-[4cqw] font-semibold" />
            {Array.isArray(h.options) && (
              <div className="mt-[2cqw] flex flex-wrap justify-center gap-[1.5cqw]">
                {listOf(h.options).map((o, i) => (
                  <span key={i} className="rounded-lg bg-gold-100 px-[1.5cqw] py-[0.8cqw]">
                    <Edit value={o} onChange={(v) => up((x) => (((x.hook as Obj).options as string[])[i] = v))} canEdit={edit} label={`Hook option ${i + 1}`} />
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
        below:
          h.a != null || edit ? (
            <div className="mt-2 rounded-lg border border-dashed border-gold-light bg-cream/60 p-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">What to draw out (teacher only)</p>
              <Edit value={str(h.a)} onChange={(v) => up((x) => ((x.hook as Obj).a = v))} canEdit={edit} label="Hook answer" multiline placeholder="Nothing noted" />
            </div>
          ) : undefined,
      };
    }
    if (key === "islamic" && c.islamicLink)
      return {
        body: (
          <div className="flex h-full flex-col justify-center">
            <p className="mb-[1.5cqw] font-serif text-[3.4cqw] font-semibold">{(c.islamicLink as Obj).at === "end" ? "The Islamic position" : "The Islamic foundation"}</p>
            <Edit value={str((c.islamicLink as Obj).text)} onChange={(v) => up((x) => ((x.islamicLink as Obj).text = v))} canEdit={edit} label="Islamic link" multiline className="text-[2.6cqw]" />
          </div>
        ),
      };
    if (key === "keywords")
      return {
        body: (
          <div>
            <p className="mb-[1.5cqw] font-serif text-[3.4cqw] font-semibold">Key words</p>
            <dl className="grid gap-x-[3cqw] gap-y-[1cqw] sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              {(c.keywords || []).map((k, i) => (
                <div key={i} className="contents">
                  <dt className="font-semibold text-teal-900">
                    <Edit value={str(k.term)} onChange={(v) => up((x) => (x.keywords[i].term = v))} canEdit={edit} label={`Key word ${i + 1}`} />
                  </dt>
                  <dd>
                    <Edit value={str(k.def)} onChange={(v) => up((x) => (x.keywords[i].def = v))} canEdit={edit} label={`Meaning of key word ${i + 1}`} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ),
      };
    if (key === "starter") return itemsSlide("starter", "Do now");
    if (key === "practice") return itemsSlide("practice", "Guided practice");
    if (key === "independent") return itemsSlide("independent", "Your turn");
    if (key === "exit") return itemsSlide("exit", "Exit ticket");
    if (key === "homework") {
      const hw = c.homework;
      return {
        body: (
          <div>
            <p className="mb-[1.5cqw] font-serif text-[3.4cqw] font-semibold">Homework</p>
            {Array.isArray(hw) ? (
              <ul className="space-y-[0.8cqw] pl-[3cqw]">
                {hw.map((h, i) => (
                  <li key={i} className="list-disc">
                    <Edit value={str(h)} onChange={(v) => up((x) => ((x.homework as string[])[i] = v))} canEdit={edit} label={`Homework ${i + 1}`} onEnter={() => up((x) => (x.homework as string[]).splice(i + 1, 0, ""))} onRemove={() => up((x) => (x.homework as string[]).splice(i, 1))} />
                  </li>
                ))}
              </ul>
            ) : (
              <Edit value={str(hw)} onChange={(v) => up((x) => (x.homework = v))} canEdit={edit} label="Homework" multiline />
            )}
          </div>
        ),
      };
    }
    if (key.startsWith("teach:")) {
      const i = Number(key.slice(6));
      const s = (c.teach[i] || {}) as Slide;
      const block = blockOf(s);
      const bullets = listOf(s.bullets);
      return {
        body: (
          <div className={`grid h-full gap-[3cqw] ${block ? "grid-cols-2" : ""}`}>
            <div>
              <Edit value={str(s.heading)} onChange={(v) => up((x) => ((x.teach[i] as Slide).heading = v))} canEdit={edit} label={`Slide ${i + 1} heading`} className="mb-[1.5cqw] font-serif text-[3.4cqw] font-semibold" placeholder="Heading" />
              <ul className="space-y-[0.8cqw] pl-[3cqw]">
                {(bullets.length || !block ? (bullets.length ? bullets : [""]) : []).map((b, j) => (
                  <li key={j} className="list-disc">
                    <Edit
                      value={b}
                      onChange={(v) => up((x) => ((x.teach[i] as Slide).bullets = Object.assign([...listOf((x.teach[i] as Slide).bullets)], { [j]: v })))}
                      canEdit={edit}
                      label={`Slide ${i + 1} bullet ${j + 1}`}
                      placeholder="Bullet point"
                      onEnter={() => up((x) => ((x.teach[i] as Slide).bullets = [...bullets.slice(0, j + 1), "", ...bullets.slice(j + 1)]))}
                      onRemove={() => up((x) => ((x.teach[i] as Slide).bullets = bullets.filter((_, k) => k !== j)))}
                    />
                  </li>
                ))}
              </ul>
              {block && edit && !bullets.length && (
                <button type="button" className={`${ui.btnLink} !text-xs print:hidden`} onClick={() => up((x) => ((x.teach[i] as Slide).bullets = [""]))}>
                  + Add a bullet point
                </button>
              )}
            </div>
            {block && (
              <div className="min-h-0 overflow-hidden rounded-lg bg-gold-50 p-[2cqw] text-[1.8cqw]">
                <BlockView value={s[block]} canEdit={edit} label={`Slide ${i + 1} ${humanKey(block)}`} onChange={(v) => up((x) => ((x.teach[i] as Slide)[block] = v))} />
              </div>
            )}
          </div>
        ),
        below: (
          <div className="mt-2 rounded-lg border border-dashed border-gold-light bg-cream/60 p-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Teacher note (speaker notes and lesson plan)</p>
            <Edit value={str(s.note)} onChange={(v) => up((x) => ((x.teach[i] as Slide).note = v))} canEdit={edit} label={`Slide ${i + 1} teacher note`} multiline placeholder="What to say and ask" />
          </div>
        ),
      };
    }
    return { body: null };
  };

  // ── the lesson plan, as text you edit in place ───────────────────────
  const plan = c && (
    <article className="mx-auto max-w-3xl space-y-5 rounded-xl border border-gold-light bg-white p-6 text-sm leading-relaxed text-ink print:border-0 print:p-0" aria-label="Lesson plan">
      <header className="border-b border-gold-light pb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-900">Lesson plan</p>
        <h3 className="font-serif text-2xl font-semibold">
          <Edit value={str(c.title)} onChange={(v) => up((x) => (x.title = v))} canEdit={edit} label="Lesson title" />
        </h3>
        <p className="text-ink/70">
          {lesson.subject} · {yearLabel(lesson.year)} · Lesson {lesson.lesson_no}
          {c.duration ? ` · ${c.duration} minutes` : ""}
        </p>
      </header>
      <PlanSection title="Objectives">
        <ul className="list-disc space-y-1 pl-5">
          {listOf(c.objectives).map((o, i) => (
            <li key={i}>
              <Edit value={o} onChange={(v) => up((x) => ((x.objectives as string[])[i] = v))} canEdit={edit} label={`Objective ${i + 1}`} onEnter={() => up((x) => (x.objectives as string[]).splice(i + 1, 0, ""))} onRemove={() => up((x) => (x.objectives as string[]).splice(i, 1))} />
            </li>
          ))}
        </ul>
      </PlanSection>
      <PlanSection title="Resources">
        <Edit value={listOf(c.resources).join("\n")} onChange={(v) => up((x) => (x.resources = v.split("\n")))} canEdit={edit} label="Resources, one per line" multiline placeholder="Slides, mini-whiteboard and pen, exercise book" />
      </PlanSection>
      <PlanSection title="Teaching sequence">
        <ol className="space-y-3">
          {(c.teach || []).map((t, i) => (
            <li key={i} className="rounded-lg bg-cream/60 p-3">
              <p className="font-semibold">
                Slide {i + 1}: {str((t as Slide).heading)}
              </p>
              <Edit value={str((t as Slide).note)} onChange={(v) => up((x) => ((x.teach[i] as Slide).note = v))} canEdit={edit} label={`Teacher note for slide ${i + 1}`} multiline placeholder="What to say and ask" />
            </li>
          ))}
        </ol>
      </PlanSection>
      <PlanSection title="SEND, EAL and stretch">
        <Edit value={str(c.send)} onChange={(v) => up((x) => (x.send = v))} canEdit={edit} label="SEND, EAL and stretch" multiline placeholder="How to adapt the lesson" />
      </PlanSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <PlanSection title="Cross-curricular link">
          <Edit value={str(c.crossCurricular)} onChange={(v) => up((x) => (x.crossCurricular = v))} canEdit={edit} label="Cross-curricular link" multiline placeholder="None noted" />
        </PlanSection>
        <PlanSection title="SMSC">
          <Edit value={str(c.smsc)} onChange={(v) => up((x) => (x.smsc = v))} canEdit={edit} label="SMSC" multiline placeholder="None noted" />
        </PlanSection>
      </div>
      <PlanSection title="Homework">
        <Edit
          value={Array.isArray(c.homework) ? c.homework.join("\n") : str(c.homework)}
          onChange={(v) => up((x) => (x.homework = Array.isArray(x.homework) ? v.split("\n") : v))}
          canEdit={edit}
          label="Homework"
          multiline
        />
      </PlanSection>
      <p className="text-xs text-ink/60 print:hidden">The downloadable lesson plan (Word and PDF) is built from this text and the slides, with timings, routines and answers added.</p>
    </article>
  );

  const openNotes = notes.filter((f) => f.status === "open" || f.status === "accepted");
  const activeNotes = openNotes.filter((f) => f.part === active || f.part === "lesson" || (tab === "plan" && f.part === "plan"));

  return (
    <div role="dialog" aria-modal="true" aria-label={`Edit lesson ${lesson.lesson_no}: ${lesson.title}`} className="fixed inset-0 z-50 flex bg-ink/60 p-0 sm:p-3">
      {tab === "slides" && <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>}
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:rounded-xl">
        {/* Top bar: what this is, the two views, and the actions. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gold-light px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              Lesson {lesson.lesson_no}: {c ? str(c.title) : lesson.title}
            </p>
            <p className="truncate text-xs text-ink/65">
              {lesson.subject} · {yearLabel(lesson.year)}
              {loaded?.content_updated_by_name && realEditAt(loaded.content_updated_by_name, loaded.content_updated_at) ? ` · last changed by ${loaded.content_updated_by_name}, ${when(loaded.content_updated_at!)}` : ""}
            </p>
          </div>
          <div role="tablist" aria-label="Show" className="inline-flex rounded-lg border border-gold-light p-0.5">
            {(["slides", "plan"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-teal-700 text-white" : "text-ink/75 hover:bg-cream"}`}>
                {t === "slides" ? "Slides" : "Lesson plan"}
              </button>
            ))}
          </div>
          <button type="button" className={btn} onClick={() => printElement(printRef.current)} disabled={!c}>
            <Icon name="printer" size="sm" /> Download PDF of this lesson
          </button>
          {onFeedback && (
            <button type="button" className={btn} onClick={() => onFeedback(tab === "plan" ? "plan" : active, c)}>
              Feedback
            </button>
          )}
          {onOpenForm && mayEdit && (
            <button type="button" className={btn} onClick={() => (!dirty || window.confirm("Open the full form without saving these changes?")) && onOpenForm()}>
              Full form
            </button>
          )}
          {mayEdit && (
            <button type="button" className={`${ui.btnPrimary} ${ui.sm}`} onClick={save} disabled={busy || !c || (!dirty && !rebuild)}>
              {busy ? "Saving…" : "Save"}
            </button>
          )}
          <button type="button" className={btn} onClick={close}>
            Close
          </button>
        </div>

        {/* Messages: save problems, build progress and downloads. */}
        {(error || problems.length > 0 || status || build || (loaded && !loaded.content) || !mayEdit) && (
          <div className="space-y-2 border-b border-gold-light bg-cream/50 px-4 py-2 text-sm" aria-live="polite">
            {error && <p className="text-amber-900">{error}</p>}
            {loaded && !loaded.content && <p className="text-amber-900">This lesson has not been loaded into the editor yet. It is filled in from the lesson files automatically within the hour; try again later.</p>}
            {!mayEdit && loaded?.content && <p className="text-ink/75">You can read this lesson and leave feedback. Editing is for teachers of this subject and the Headteacher.</p>}
            {problems.length > 0 && (
              <ul role="alert" className="list-disc pl-5 text-red-800">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {status && <p className="font-medium text-teal-900">{status}</p>}
            {build && (
              <BuildPanel
                build={build}
                stale={stale}
                files={files}
                customDeck={!!loaded?.custom_deck && !rebuild}
                onDownload={download}
                onPrint={() => printElement(printRef.current)}
              />
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Slide list */}
          {tab === "slides" && c && (
            <nav aria-label="Slides" className="hidden w-52 shrink-0 overflow-y-auto border-r border-gold-light bg-cream/40 p-2 md:block">
              <ol className="space-y-1">
                {slides.map((s, n) => (
                  <li key={s.key}>
                    <a
                      href={`#studio-${s.key.replace(":", "-")}`}
                      onClick={() => setActive(s.key)}
                      aria-current={active === s.key ? "true" : undefined}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${active === s.key ? "bg-white font-semibold text-ink ring-1 ring-teal-700" : "text-ink/75 hover:bg-white"}`}
                    >
                      <span className="w-5 shrink-0 text-right tabular-nums text-ink/55">{n + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {notesFor(s.key) > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Has feedback" />}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {/* The editable preview (also what "Download PDF" prints) */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-gold-50/60 p-3 sm:p-5">
            {!c && !error && <p className="text-sm text-ink/65">Opening…</p>}
            {openNotes.length > 0 && (
              <details className="mx-auto mb-4 max-w-4xl rounded-xl border border-amber-200 bg-white p-3 lg:hidden" open={!!feedback}>
                <summary className="cursor-pointer text-sm font-semibold text-ink">Feedback on this lesson ({openNotes.length})</summary>
                <ul className="mt-2 space-y-2">
                  {openNotes.map((f) => (
                    <FeedbackItem key={f.id} f={f} compact onChanged={(nf) => setNotes((n) => n.map((x) => (x.id === nf.id ? nf : x)))} />
                  ))}
                </ul>
              </details>
            )}
            <div ref={printRef} className="mx-auto max-w-4xl space-y-6">
              {c && tab === "slides" && (
                <>
                  {mayEdit && <p className="text-xs text-ink/65 print:hidden">Click any text on a slide to change it. Press Enter for a new bullet point or question; Backspace on an empty one removes it. Worked examples, tables and other blocks are edited the same way.</p>}
                  {slides.map((s, n) => {
                    const { body, below } = slideBody(s.key);
                    return (
                      <SlideFrame key={s.key} id={`studio-${s.key.replace(":", "-")}`} n={n + 1} kind={s.key.startsWith("teach:") ? "Learn" : s.label} active={active === s.key} notes={notesFor(s.key)} onSelect={() => setActive(s.key)} below={below}>
                        {body}
                      </SlideFrame>
                    );
                  })}
                </>
              )}
              {c && tab === "plan" && plan}
            </div>
            {c && mayEdit && (
              <div className="mx-auto mt-6 max-w-4xl space-y-3 rounded-xl border border-gold-light bg-white p-3 print:hidden">
                <label className="block">
                  <span className={ui.label}>What did you change? (optional)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${ui.input}`} placeholder="e.g. Added a picture prompt to slide 3" />
                </label>
                {loaded?.custom_deck && (
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" checked={rebuild} onChange={(e) => setRebuild(e.target.checked)} className="mt-1" />
                    <span>This lesson uses slides that were uploaded. Tick to replace them with new slides built from this lesson; leave it to keep them (the lesson plan is rebuilt either way).</span>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Feedback beside the slide */}
          {openNotes.length > 0 && (
            <aside aria-label="Feedback on this lesson" className="hidden w-80 shrink-0 overflow-y-auto border-l border-gold-light bg-white p-3 lg:block">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/65">Feedback {activeNotes.length ? "on this slide" : `(${openNotes.length})`}</p>
              <ul className="space-y-2">
                {(activeNotes.length ? activeNotes : openNotes).map((f) => (
                  <FeedbackItem key={f.id} f={f} compact onChanged={(nf) => setNotes((n) => n.map((x) => (x.id === nf.id ? nf : x)))} />
                ))}
              </ul>
              {activeNotes.length > 0 && openNotes.length > activeNotes.length && <p className="mt-2 text-xs text-ink/65">{openNotes.length - activeNotes.length} more on other slides (amber dot in the list).</p>}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold-900">{title}</h4>
      {children}
    </section>
  );
}

/** "Building your slides…" then the downloads. */
function BuildPanel({ build, stale, files, customDeck, onDownload, onPrint }: { build: Build; stale: boolean; files: CurriculumLesson; customDeck: boolean; onDownload: (k: LessonFileKind) => void; onPrint: () => void }) {
  if (build.status === "ready") {
    const kinds: [LessonFileKind, string][] = [
      ["slides-pptx", "PowerPoint"],
      ["slides-pdf", "Slides PDF"],
      ["plan-docx", "Lesson plan (Word)"],
      ["plan-pdf", "Lesson plan PDF"],
    ];
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
        <Icon name="circleCheck" className="h-4 w-4 text-green-800" />
        <span className="font-semibold text-green-900">{customDeck ? "Your lesson plan is ready." : "Your new slides are ready."}</span>
        {build.message && <span className="text-green-900">{build.message}</span>}
        <span className="flex flex-wrap gap-1.5">
          {kinds
            .filter(([k]) => pathFor(files, k))
            .map(([k, label]) => (
              <button key={k} type="button" className={btn} onClick={() => onDownload(k)}>
                <Icon name="download" size="sm" /> {label}
              </button>
            ))}
        </span>
      </div>
    );
  }
  if (build.status === "failed" || stale)
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
        {build.message || "The quick build hasn't started. Your changes are saved, and the slides will still be rebuilt within the hour."}{" "}
        <button type="button" className={`${ui.btnLink} !text-sm`} onClick={onPrint}>
          Download a PDF of the preview now
        </button>
      </p>
    );
  return (
    <p className="flex items-center gap-2 rounded-lg border border-teal-700/20 bg-teal-100 px-3 py-2 text-teal-900" role="status">
      <span className="h-3 w-3 motion-safe:animate-spin rounded-full border-2 border-teal-700 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
      {build.status === "queued" ? "Saved. Building your slides…" : "Building your slides and lesson plan…"} Usually under two minutes. You can keep working; the downloads appear here.
    </p>
  );
}
