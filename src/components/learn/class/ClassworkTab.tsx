"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { renderMarkup, safeHttpUrl } from "@/lib/learn/markup";
import { AttachmentList, cleanAttachments, uploadClassFile, type Attachment } from "@/components/learn/class/Attachments";

type Topic = { id: string; name: string; position: number };
type Hw = { id: string; title: string; due_at: string; topic_id: string | null; status?: string };
type Mat = { id: string; title: string; kind: "material" | "question"; body: string | null; resources: unknown; topic_id: string | null; allow_comments: boolean; created_at: string };

type Row =
  | { type: "homework"; id: string; title: string; at: string; topicId: string | null; row: Hw }
  | { type: "material"; id: string; title: string; at: string; topicId: string | null; row: Mat };

const KIND_LABEL = { homework: "Assignment", material: "Material", question: "Question" } as const;

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
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60">
          {busy ? "Working…" : "Post"}
        </button>
      </div>
    </section>
  );
}

function CreateMenu({ onPick, classHref, homeworkHref: hwHref }: { onPick: (k: "material" | "question" | "topic") => void; classHref: (tab: string) => string; homeworkHref: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "block w-full px-4 py-2 text-left text-sm text-ink hover:bg-cream";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900">
        + Create
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-gold-light bg-white py-1 shadow-lg">
          <Link role="menuitem" href={hwHref} className={item}>
            Assignment
          </Link>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onPick("material");
            }}
          >
            Material
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onPick("question");
            }}
          >
            Question
          </button>
          <Link role="menuitem" href={classHref("stream")} className={item}>
            Announcement
          </Link>
          <div className="my-1 border-t border-gold-light/70" />
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onPick("topic");
            }}
          >
            Topic
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Classwork: everything the teacher has set for the class, grouped under
 * collapsible topics. Assignments come from the homework tables (read only
 * here, apart from filing one under a topic); materials and questions are
 * the teacher's non-assessed posts. Pupils and families see the same list
 * with their own hand-in status.
 */
export function ClassworkTab({ classId, viewer, classHref }: { classId: string; viewer: ClassViewer; classHref: (tab: string) => string }) {
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";
  const canEdit = isStaff; // head/admin and the class teacher; the database refuses anyone else
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<"material" | "question" | null>(null);
  const [newTopic, setNewTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const [tp, hw, mat] = await Promise.all([
      supabase.from("class_topics").select("id, name, position").eq("class_id", classId).order("position").order("name"),
      supabase.from("homework").select("id, title, due_at, topic_id").eq("class_id", classId).is("archived_at", null).order("due_at", { ascending: false }),
      supabase.from("class_materials").select("id, title, kind, body, resources, topic_id, allow_comments, created_at").eq("class_id", classId).order("created_at", { ascending: false }),
    ]);
    const hwRows = (hw.data as unknown as Hw[]) || [];
    if (childId && hwRows.length) {
      const { data: st } = await supabase.from("homework_status").select("homework_id, status").eq("child_id", childId).eq("class_id", classId);
      const byId = new Map(((st as unknown as { homework_id: string; status: string }[]) || []).map((s) => [s.homework_id, s.status]));
      for (const h of hwRows) h.status = byId.get(h.id);
    }
    setTopics((tp.data as unknown as Topic[]) || []);
    setRows([
      ...hwRows.map((h): Row => ({ type: "homework", id: h.id, title: h.title, at: h.due_at, topicId: h.topic_id, row: h })),
      ...(((mat.data as unknown as Mat[]) || []).map((m): Row => ({ type: "material", id: m.id, title: m.title, at: m.created_at, topicId: m.topic_id, row: m }))),
    ]);
  }, [classId, childId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

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
        <p className="text-sm text-ink/60">Everything set for this class, grouped by topic.</p>
        {canEdit && <CreateMenu classHref={classHref} homeworkHref={homeworkHref(viewer)} onPick={(k) => (k === "topic" ? setNewTopic("") : setCreating(k))} />}
      </div>

      {newTopic !== null && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-gold-light bg-white p-4">
          <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTopic()} placeholder="Topic name, e.g. Week 3: Tajweed" aria-label="Topic name" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-2 text-sm" />
          <button type="button" onClick={addTopic} disabled={!newTopic.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/60">{canEdit ? "No classwork yet. Use Create to add an assignment, material or question." : "Nothing has been set for this class yet."}</p>
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
                  <button type="button" onClick={() => removeTopic(g.topic as Topic)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                    Delete topic
                  </button>
                )}
              </div>
            ) : (
              <h2 className="px-4 pt-3 text-sm font-semibold text-ink/60">{topics.length > 0 ? "No topic" : "Classwork"}</h2>
            )}
            {!closed && (
              <ul className="divide-y divide-gold-light/60 px-2 pb-2">
                {g.items.length === 0 && <li className="px-3 py-3 text-sm text-ink/55">Nothing in this topic yet.</li>}
                {g.items.map((r) => {
                  const kindKey = r.type === "homework" ? "homework" : (r.row as Mat).kind;
                  const open = expanded === `${r.type}-${r.id}`;
                  const st = r.type === "homework" && r.row.status ? STATUS[r.row.status] : null;
                  return (
                    <li key={`${r.type}-${r.id}`} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/65">{KIND_LABEL[kindKey]}</p>
                          {r.type === "homework" ? (
                            <Link href={homeworkHref(viewer)} className="block truncate text-sm font-medium text-ink hover:text-teal-700 hover:underline">
                              {r.title}
                            </Link>
                          ) : (
                            <button type="button" onClick={() => setExpanded(open ? null : `${r.type}-${r.id}`)} aria-expanded={open} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-teal-700 hover:underline">
                              {r.title}
                            </button>
                          )}
                          <p className="text-xs text-ink/55">{r.type === "homework" ? `Due ${fmtDue(r.at)}` : `Posted ${new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}</p>
                        </div>
                        {st && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${st.cls}`}>{st.label}</span>}
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
                      {open && r.type === "material" && (
                        <div className="mt-2 rounded-lg bg-cream/50 p-3 text-sm text-ink/85">
                          {r.row.body ? <div className="space-y-1">{renderMarkup(r.row.body)}</div> : <p className="text-ink/55">No extra details.</p>}
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
    </div>
  );
}
