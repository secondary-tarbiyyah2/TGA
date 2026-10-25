"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { renderMarkup, safeHttpUrl } from "@/lib/learn/markup";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";
import { AttachmentList, cleanAttachments, uploadClassFile, type Attachment } from "@/components/learn/class/Attachments";
import { HomeworkCard } from "@/components/learn/homework/HomeworkCards";
import { HomeworkEditor, type HomeworkKind } from "@/components/learn/homework/HomeworkEditor";
import { ReviewQueue } from "@/components/learn/classwork/ReviewQueue";
import { Tabs } from "@/components/learn/Tabs";

type Topic = { id: string; name: string; position: number };
type Hw = Homework & { topic_id: string | null; status?: string; kind?: string | null; assigned_child_ids?: string[] | null };
type Mat = { id: string; title: string; kind: "material" | "question"; body: string | null; resources: unknown; topic_id: string | null; allow_comments: boolean; created_at: string };

type Row =
  | { type: "homework"; id: string; title: string; at: string; topicId: string | null; row: Hw }
  | { type: "material"; id: string; title: string; at: string; topicId: string | null; row: Mat };

const KIND_LABEL = { homework: "Assignment", quiz: "Quiz", material: "Material", question: "Question" } as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  missing: { label: "Missing", cls: "bg-red-50 text-red-800 ring-red-600/20" },
  late: { label: "Handed in late", cls: "bg-green-50 text-green-800 ring-green-600/20" },
  on_time: { label: "Handed in", cls: "bg-green-50 text-green-800 ring-green-600/20" },
  not_yet_due: { label: "To do", cls: "bg-teal-100 text-teal-900 ring-teal-700/20" },
};

const fmtDue = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Where an assignment is opened to hand it in / mark it. Homework pages are owned by the homework area. */
function homeworkHref(viewer: ClassViewer): string {
  if (viewer.kind === "teacher") return "/teach/homework";
  if (viewer.kind === "staff") return "/admin/homework";
  if (viewer.kind === "student") return "/student/homework";
  return `/family/homework?child=${viewer.childId}`;
}

function MaterialForm({ classId, kind, topics, defaultTopic, onDone, onCancel }: { classId: string; kind: "material" | "question"; topics: Topic[]; defaultTopic: string; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topicId, setTopicId] = useState(defaultTopic);
  const [allowComments, setAllowComments] = useState(kind === "question");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [links, setLinks] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setBusy(true);
    for (const f of Array.from(list)) {
      const r = await uploadClassFile(classId, f);
      if ("error" in r) setError(r.error);
      else setFiles((x) => [...x, r.attachment]);
    }
    setBusy(false);
  };
  const addLink = () => {
    const u = safeHttpUrl(link);
    if (!u) return setError("That doesn't look like a web address.");
    setError(null);
    setLinks((l) => [...l, { label: u.replace(/^https?:\/\//, "").slice(0, 60), url: u }]);
    setLink("");
  };

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!title.trim()) return setError("Add a title.");
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_materials").insert({
      class_id: classId,
      topic_id: topicId || null,
      kind,
      title: title.trim(),
      body: body.trim() || null,
      resources: [...files, ...links],
      allow_comments: allowComments,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (err) return setError("Could not save. Try again.");
    onDone();
  };

  return (
    <section aria-label={kind === "question" ? "New question" : "New material"} className="rounded-2xl border border-gold-light bg-white p-5">
      <h3 className="text-sm font-semibold text-ink">{kind === "question" ? "New question" : "New material"}</h3>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "question" ? "Question" : "Title"} aria-label="Title" maxLength={200} className="mt-3 w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "question" ? "Instructions (optional)" : "Notes (optional)"} aria-label="Details" rows={4} maxLength={8000} className="mt-3 w-full rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
      {(files.length > 0 || links.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2 text-sm text-ink/80">
          {[...files, ...links].map((a, i) => (
            <li key={i} className="rounded-lg bg-cream px-2.5 py-1">
              {a.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
          Attach file
          <input type="file" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        </label>
        <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a link" aria-label="Link address" className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm" />
        <button type="button" onClick={addLink} disabled={!link.trim()} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
          Add link
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="text-sm text-ink/80">
          Topic{" "}
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="ml-1 rounded-lg border border-gold-light/70 px-2 py-1.5 text-sm">
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} />
          Allow class comments
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-ink/70 hover:bg-cream">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-gold-700 px-5 py-2 text-sm font-medium text-white hover:bg-gold-900 disabled:opacity-60">
          {busy ? "Working…" : "Post"}
        </button>
      </div>
    </section>
  );
}

type CreateKind = HomeworkKind | "material" | "question" | "topic";

/** Google Classroom's "+ Create": assignment, quiz, question, material, then announcement and topic. */
function CreateMenu({ onPick, classHref }: { onPick: (k: CreateKind) => void; classHref: (tab: string) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  const item = "flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-ink hover:bg-cream focus:bg-cream focus:outline-none";
  const pick = (k: CreateKind) => {
    setOpen(false);
    onPick(k);
  };
  const entries: { k: CreateKind; label: string; hint: string }[] = [
    { k: "assignment", label: "Assignment", hint: "Work to hand in, marked by you" },
    { k: "quiz", label: "Quiz assignment", hint: "Questions with a mark out of" },
    { k: "question", label: "Question", hint: "One question; pupils answer in comments" },
    { k: "material", label: "Material", hint: "Notes, files and links to read" },
  ];
  return (
    <div ref={ref} className="relative">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900">
        + Create
      </button>
      {open && (
        <div role="menu" aria-label="Create" onKeyDown={onMenuKey} className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gold-light bg-white py-1 shadow-lg">
          {entries.map((e) => (
            <button key={e.k} role="menuitem" type="button" className={item} onClick={() => pick(e.k)}>
              <span className="min-w-0">
                <span className="block font-medium">{e.label}</span>
                <span className="block text-xs text-ink/65">{e.hint}</span>
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-gold-light/70" />
          <Link role="menuitem" href={classHref("stream")} className={item}>
            Announcement
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => pick("topic")}>
            Topic
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Classwork: everything set for the class, grouped under collapsible topics,
 * like Google Classroom. Staff create assignments, quizzes, questions and
 * materials here ("+ Create"), choose who each is for (the whole class or
 * chosen pupils), open an assignment to see who has handed in and mark it,
 * and switch to "To review" for everything in this class waiting to be
 * marked. Pupils and families see the same list with their own hand-in
 * status.
 */
export function ClassworkTab({ classId, classTitle, viewer, classHref }: { classId: string; classTitle: string; viewer: ClassViewer; classHref: (tab: string) => string }) {
  const params = useSearchParams();
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";
  const canEdit = isStaff; // head/admin and the class teacher; the database refuses anyone else
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<"material" | "question" | null>(null);
  const [setting, setSetting] = useState<{ kind: HomeworkKind; editing: Hw | null; topicId: string } | null>(null);
  const [newTopic, setNewTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "review">(isStaff && params.get("view") === "review" ? "review" : "all");
  const [reviewHw, setReviewHw] = useState<string | undefined>(undefined);
  const [toReview, setToReview] = useState<Record<string, number>>({});
  const editorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    // Staff get the full assignment (to edit and mark it in place). The 0125
    // columns are asked for first, then left out if the database is older.
    const base = isStaff ? `${HOMEWORK_COLUMNS}, topic_id` : "id, class_id, title, instructions, due_at, topic_id";
    const fetchHw = async () => {
      const q = (cols: string) => supabase.from("homework").select(cols).eq("class_id", classId).is("archived_at", null).order("due_at", { ascending: false });
      const first = await q(`${base}, kind, assigned_child_ids`);
      return first.error ? q(base) : first;
    };
    const [tp, hw, mat, rq] = await Promise.all([
      supabase.from("class_topics").select("id, name, position").eq("class_id", classId).order("position").order("name"),
      fetchHw(),
      supabase.from("class_materials").select("id, title, kind, body, resources, topic_id, allow_comments, created_at").eq("class_id", classId).order("created_at", { ascending: false }),
      isStaff ? supabase.from("homework_review_queue").select("homework_id").eq("class_id", classId).limit(2000) : Promise.resolve({ data: [] as { homework_id: string }[] }),
    ]);
    const hwRows = (hw.data as unknown as Hw[]) || [];
    if (childId && hwRows.length) {
      const { data: st } = await supabase.from("homework_status").select("homework_id, status").eq("child_id", childId).eq("class_id", classId);
      const byId = new Map(((st as unknown as { homework_id: string; status: string }[]) || []).map((s) => [s.homework_id, s.status]));
      for (const h of hwRows) h.status = byId.get(h.id);
    }
    const counts: Record<string, number> = {};
    for (const r of (rq.data as { homework_id: string }[] | null) || []) counts[r.homework_id] = (counts[r.homework_id] || 0) + 1;
    setToReview(counts);
    setTopics((tp.data as unknown as Topic[]) || []);
    setRows([
      ...hwRows.map((h): Row => ({ type: "homework", id: h.id, title: h.title, at: h.due_at, topicId: h.topic_id, row: h })),
      ...(((mat.data as unknown as Mat[]) || []).map((m): Row => ({ type: "material", id: m.id, title: m.title, at: m.created_at, topicId: m.topic_id, row: m }))),
    ]);
  }, [classId, childId, isStaff]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const reviewTotal = Object.values(toReview).reduce((a, b) => a + b, 0);
  const onReviewCount = useCallback(() => {
    // Work returned in the To review view: refresh the counts on the list.
    load();
  }, [load]);

  const startSetting = (kind: HomeworkKind, editing: Hw | null = null, topicId = "") => {
    setCreating(null);
    setNote(null);
    setSetting({ kind, editing, topicId });
    setView("all");
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const openReview = (homeworkId?: string) => {
    setReviewHw(homeworkId);
    setView("review");
  };
  const addTopic = async () => {
    const supabase = getSupabaseClient();
    const name = (newTopic || "").trim();
    if (!supabase || !name) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_topics").insert({ class_id: classId, name, position: (topics?.length ?? 0) + 1, created_by: user?.id ?? null });
    if (err) return setError(err.code === "23505" ? "There is already a topic with that name." : "Could not add the topic.");
    setError(null);
    setNewTopic(null);
    load();
  };

  const removeTopic = async (t: Topic) => {
    const supabase = getSupabaseClient();
    if (!supabase || !window.confirm(`Delete the topic "${t.name}"? Its items stay in the class, just without a topic.`)) return;
    await supabase.from("class_topics").delete().eq("id", t.id);
    load();
  };

  const moveItem = async (r: Row, topicId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const table = r.type === "homework" ? "homework" : "class_materials";
    await supabase.from(table).update({ topic_id: topicId || null }).eq("id", r.id);
    load();
  };

  const removeMaterial = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !window.confirm("Delete this item? Pupils will no longer see it.")) return;
    await supabase.from("class_materials").delete().eq("id", id);
    load();
  };

  if (topics === null) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  const groups: { key: string; topic: Topic | null; items: Row[] }[] = [
    { key: "none", topic: null, items: rows.filter((r) => !r.topicId || !topics.some((t) => t.id === r.topicId)) },
    ...topics.map((t) => ({ key: t.id, topic: t, items: rows.filter((r) => r.topicId === t.id) })),
  ];
  const visibleGroups = groups.filter((g) => g.topic || g.items.length > 0 || (rows.length === 0 && !isStaff));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isStaff ? (
          <Tabs
            variant="switch"
            label="Classwork views"
            value={view}
            onChange={(v) => {
              setReviewHw(undefined);
              setView(v);
            }}
            items={[
              { key: "all", label: "Classwork" },
              { key: "review", label: "To review", count: reviewTotal },
            ]}
          />
        ) : (
          <p className="text-sm text-ink/65">Everything set for this class, grouped by topic.</p>
        )}
        {canEdit && (
          <CreateMenu
            classHref={classHref}
            onPick={(k) => {
              if (k === "topic") {
                setView("all");
                setNewTopic("");
              }
              else if (k === "assignment" || k === "quiz") startSetting(k);
              else {
                setSetting(null);
                setView("all");
                setCreating(k);
              }
            }}
          />
        )}
      </div>

      {view === "review" && isStaff ? (
        <ReviewQueue key={reviewHw || "all"} classId={classId} homeworkId={reviewHw} embedded onCount={onReviewCount} />
      ) : (
      <>
      {note && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {note}
        </p>
      )}
      {setting && (
        <section ref={editorRef} aria-label={setting.editing ? `Edit ${setting.editing.title}` : setting.kind === "quiz" ? "New quiz assignment" : "New assignment"} className="scroll-mt-24 rounded-2xl border border-gold-light bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">{setting.editing ? `Edit “${setting.editing.title}”` : setting.kind === "quiz" ? "New quiz assignment" : "New assignment"}</h3>
            <button type="button" onClick={() => setSetting(null)} className="text-sm text-ink/65 hover:text-ink">
              Close
            </button>
          </div>
          <HomeworkEditor
            key={setting.editing?.id || `new-${setting.kind}`}
            classes={[{ id: classId, name: classTitle }]}
            initialClassId={classId}
            lockClass
            topics={topics}
            initialTopicId={setting.editing?.topic_id || setting.topicId}
            kind={setting.kind}
            editing={setting.editing}
            onCancel={() => setSetting(null)}
            onSaved={(n) => {
              setNote(n ?? null);
              setSetting(null);
              load();
            }}
          />
        </section>
      )}

      {newTopic !== null && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-gold-light bg-white p-4">
          <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTopic()} placeholder="Topic name, e.g. Week 3: Tajweed" aria-label="Topic name" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
          <button type="button" onClick={addTopic} disabled={!newTopic.trim()} className="rounded-lg bg-gold-700 hover:bg-gold-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add topic
          </button>
          <button type="button" onClick={() => setNewTopic(null)} className="rounded-lg px-3 py-2 text-sm text-ink/70 hover:bg-cream">
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {creating && (
        <MaterialForm
          classId={classId}
          kind={creating}
          topics={topics}
          defaultTopic=""
          onCancel={() => setCreating(null)}
          onDone={() => {
            setCreating(null);
            load();
          }}
        />
      )}

      {rows.length === 0 && topics.length === 0 && (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">{canEdit ? "No classwork yet. Use Create to add an assignment, quiz, question or material." : "Nothing has been set for this class yet."}</p>
      )}

      {visibleGroups.map((g) => {
        const closed = collapsed[g.key] ?? false;
        return (
          <section key={g.key} className="rounded-2xl border border-gold-light bg-white">
            {g.topic ? (
              <div className="flex items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !closed }))} aria-expanded={!closed} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-ink/65 transition-transform ${closed ? "-rotate-90" : ""}`}>
                    <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h2 className="truncate text-base font-semibold text-ink">{g.topic.name}</h2>
                  <span className="text-xs text-ink/65">{g.items.length}</span>
                </button>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => startSetting("assignment", null, (g.topic as Topic).id)} className="text-xs font-medium text-teal-800 hover:underline">
                      + Assignment
                    </button>
                    <button type="button" onClick={() => removeTopic(g.topic as Topic)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                      Delete topic
                    </button>
                  </>
                )}
              </div>
            ) : (
              <h2 className="px-4 pt-3 text-sm font-semibold text-ink/65">{topics.length > 0 ? "No topic" : "Classwork"}</h2>
            )}
            {!closed && (
              <ul className="divide-y divide-gold-light/60 px-2 pb-2">
                {g.items.length === 0 && <li className="px-3 py-3 text-sm text-ink/65">Nothing in this topic yet.</li>}
                {g.items.map((r) => {
                  const hw = r.type === "homework" ? r.row : null;
                  const kindKey = hw ? (hw.kind === "quiz" ? "quiz" : "homework") : (r.row as Mat).kind;
                  const open = expanded === `${r.type}-${r.id}`;
                  const st = hw?.status ? STATUS[hw.status] : null;
                  const forSome = hw?.assigned_child_ids?.length || 0;
                  const waiting = hw ? toReview[hw.id] || 0 : 0;
                  return (
                    <li key={`${r.type}-${r.id}`} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/65">{KIND_LABEL[kindKey]}</p>
                          {hw && !isStaff ? (
                            <Link href={homeworkHref(viewer)} className="block truncate text-sm font-medium text-ink hover:text-teal-700 hover:underline">
                              {r.title}
                            </Link>
                          ) : (
                            <button type="button" onClick={() => setExpanded(open ? null : `${r.type}-${r.id}`)} aria-expanded={open} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-teal-700 hover:underline">
                              {r.title}
                            </button>
                          )}
                          <p className="text-xs text-ink/65">
                            {hw ? `Due ${fmtDue(r.at)}` : `Posted ${new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                            {isStaff && forSome > 0 && ` · For ${forSome} pupil${forSome === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        {st && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${st.cls}`}>{st.label}</span>}
                        {isStaff && waiting > 0 && (
                          <button type="button" onClick={() => openReview(hw?.id)} className="shrink-0 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-900 ring-1 ring-inset ring-teal-700/20 hover:bg-teal-700 hover:text-white">
                            {waiting} to review
                          </button>
                        )}
                        {canEdit && (
                          <select aria-label={`Topic for ${r.title}`} value={r.topicId ?? ""} onChange={(e) => moveItem(r, e.target.value)} className="max-w-[10rem] rounded-lg border border-gold-light/70 px-2 py-1 text-xs text-ink/70">
                            <option value="">No topic</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {canEdit && r.type === "material" && (
                          <button type="button" onClick={() => removeMaterial(r.id)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                            Delete
                          </button>
                        )}
                      </div>
                      {open && hw && isStaff && (
                        <div className="mt-2">
                          <HomeworkCard
                            hw={hw}
                            onEdit={(h) => startSetting(hw.kind === "quiz" ? "quiz" : "assignment", { ...hw, ...h })}
                            onChanged={load}
                            actions={
                              waiting > 0 ? (
                                <button type="button" onClick={() => openReview(hw.id)} className="text-sm font-semibold text-teal-800 underline">
                                  Mark {waiting}
                                </button>
                              ) : undefined
                            }
                          />
                        </div>
                      )}
                      {open && r.type === "material" && (
                        <div className="mt-2 rounded-lg bg-cream/50 p-3 text-sm text-ink/85">
                          {r.row.body ? <div className="space-y-1">{renderMarkup(r.row.body)}</div> : <p className="text-ink/65">No extra details.</p>}
                          <AttachmentList attachments={cleanAttachments(r.row.resources)} />
                          {r.row.allow_comments && (
                            <p className="mt-3 text-xs">
                              <Link href={classHref("stream")} className="font-medium text-teal-800 hover:underline">
                                Open the class comments in Stream
                              </Link>
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      </>
      )}
    </div>
  );
}
