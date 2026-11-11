"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { renderMarkup } from "@/lib/learn/markup";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";
import { AttachmentList, cleanAttachments } from "@/components/learn/class/Attachments";
import { CreatePicker, useClassworkTypes, MaterialDialog, TopicDialog, type ClassworkType, type CreatePick } from "@/components/learn/class/CreateClasswork";
import { Icon, type IconName } from "@/components/learn/Icon";
import { PostDialog } from "@/components/learn/class/AnnouncementComposer";
import { HomeworkCard } from "@/components/learn/homework/HomeworkCards";
import { type HomeworkKind } from "@/components/learn/homework/HomeworkEditor";
import { CLASSWORK_CHANGED, CLASSWORK_CREATE, SetWorkPanel } from "@/components/learn/class/SetWorkPanel";
import { ReviewQueue } from "@/components/learn/classwork/ReviewQueue";
import { QuizBuilder } from "@/components/learn/quiz/QuizBuilder";
import { Tabs } from "@/components/learn/Tabs";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
import { Button, ui } from "@/components/learn/ui";
import { useFeature } from "@/lib/learn/features";
type Topic = { id: string; name: string; position: number };
type Hw = Homework & { topic_id: string | null; status?: string; kind?: string | null; assigned_child_ids?: string[] | null };
type Mat = { id: string; title: string; kind: "material" | "question"; body: string | null; resources: unknown; topic_id: string | null; allow_comments: boolean; created_at: string };

type Row =
  | { type: "homework"; id: string; title: string; at: string; topicId: string | null; row: Hw }
  | { type: "material"; id: string; title: string; at: string; topicId: string | null; row: Mat };

const KIND_GROUP: Record<ClassworkType, string> = { assignment: "Assignments", quiz: "Quizzes", question: "Questions", material: "Materials" };
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
  const [allRows, setRows] = useState<Row[]>([]);
  // Quizzes switched off by the Headteacher (School features): no Quiz to create and no quizzes listed; nothing is deleted.
  const quizzesOn = useFeature("quizzes");
  const kinds = useClassworkTypes();
  const rows = quizzesOn ? allRows : allRows.filter((r) => !(r.type === "homework" && r.row.kind === "quiz"));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState<"material" | "question" | null>(null);
  // `at` says where the editor opens: at the top (Create menu), under a
  // topic's heading (its "+ Assignment"), or in place of the item being edited,
  // so nobody is thrown to the top of a long list.
  const [setting, setSetting] = useState<{ kind: HomeworkKind; editing: Hw | null; topicId: string; at: string } | null>(null);
  // "Create" opens the kinds of classwork as cards; ?create=1 (the class header's "Set work") opens it on arrival.
  const [picker, setPicker] = useState(canEdit && params.get("create") === "1");
  const [newTopic, setNewTopic] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Classwork by kind (owner, 11 Nov 2026, item 6): a filter for each of the four kinds, and the
  // list grouped by kind (Assignments, Quizzes, Questions, Materials) or by topic.
  const [kindFilter, setKindFilter] = useState<"all" | ClassworkType>("all");
  const [groupBy, setGroupBy] = useState<"kind" | "topic">("kind");
  const [view, setView] = useState<"all" | "review">(isStaff && params.get("view") === "review" ? "review" : "all");
  const [reviewHw, setReviewHw] = useState<string | undefined>(undefined);
  const [toReview, setToReview] = useState<Record<string, number>>({});

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

  // The class header's "Set work" while this section is already open.
  useEffect(() => {
    if (!canEdit) return;
    const open = () => setPicker(true);
    window.addEventListener(CLASSWORK_CREATE, open);
    return () => window.removeEventListener(CLASSWORK_CREATE, open);
  }, [canEdit]);

  // Work set from the class header's "Set work" panel (or anywhere else on the page): refresh.
  useEffect(() => {
    const onChanged = (e: Event) => {
      const id = (e as CustomEvent<{ classId: string | null }>).detail?.classId;
      if (!id || id === classId) load();
    };
    window.addEventListener(CLASSWORK_CHANGED, onChanged);
    return () => window.removeEventListener(CLASSWORK_CHANGED, onChanged);
  }, [load, classId]);

  const reviewTotal = Object.values(toReview).reduce((a, b) => a + b, 0);
  const onReviewCount = useCallback(() => {
    // Work returned in the To review view: refresh the counts on the list.
    load();
  }, [load]);

  const startSetting = (kind: HomeworkKind, editing: Hw | null = null, topicId = "", fromTopic = false) => {
    setCreating(null);
    setNote(null);
    const at = editing ? `item:${editing.id}` : fromTopic && topicId ? `topic:${topicId}` : "top";
    setSetting({ kind, editing, topicId, at });
    if (at.startsWith("topic:")) setCollapsed((c) => ({ ...c, [topicId]: false }));
    setView("all");
  };

  const openReview = (homeworkId?: string) => {
    setReviewHw(homeworkId);
    setView("review");
  };
  const addTopic = async (name: string): Promise<string | null> => {
    const supabase = getSupabaseClient();
    if (!supabase || !name) return "Not connected.";
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_topics").insert({ class_id: classId, name, position: (topics?.length ?? 0) + 1, created_by: user?.id ?? null });
    if (err) return err.code === "23505" ? "There is already a topic with that name." : "Could not add the topic.";
    setError(null);
    load();
    return null;
  };

  // Arrived with ?create=1: drop it once the cards close, so a refresh doesn't reopen them.
  const closePicker = () => {
    setPicker(false);
    if (params.get("create")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };

  const pick = (k: CreatePick) => {
    closePicker();
    setView("all");
    if (k === "topic") setNewTopic(true);
    else if (k === "post") setPosting(true);
    else if (k === "assignment" || k === "quiz") startSetting(k);
    else {
      setSetting(null);
      setCreating(k);
    }
  };

  // ?create=assignment|quiz|question|material (the Stream's "Or set classwork" links) opens that
  // kind's own form once, straight away, instead of the cards.
  const createKind = canEdit ? params.get("create") : null;
  // Each request is handled once; `n` lets the class header ask again while you are already here.
  const createKey = createKind ? `${createKind}:${params.get("n") || ""}` : "";
  const [createHandled, setCreateHandled] = useState("");
  useEffect(() => {
    if (!createKey || createHandled === createKey || topics === null) return;
    if (createKind === "assignment" || createKind === "quiz" || createKind === "question" || createKind === "material") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off: open the form the link asked for
      setCreateHandled(createKey);
      pick(createKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when the list has loaded
  }, [topics, createKind, createKey, createHandled]);

  const removeTopic = async (t: Topic) => {
    const supabase = getSupabaseClient();
    if (!supabase || !(await askConfirm(`Delete the topic "${t.name}"? Its items stay in the class, just without a topic.`))) return;
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
    if (!supabase || !(await askConfirm("Delete this item? Pupils will no longer see it."))) return;
    await supabase.from("class_materials").delete().eq("id", id);
    load();
  };

  if (topics === null) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;

  // Setting or editing work opens in a panel over the list (owner, 11 Nov 2026: actions open in
  // place, never as a page of their own); closing it leaves the list exactly where it was.
  // A quiz is built in its own full-screen builder (questions, settings, AI draft, results);
  // an assignment opens in the side panel.
  const editor = setting?.kind === "quiz" ? (
    <QuizBuilder
      classId={classId}
      className={classTitle}
      homeworkId={setting.editing?.id ?? null}
      topics={topics}
      initialTopicId={setting.topicId}
      onClose={() => setSetting(null)}
      onSaved={(n) => setNote(n ?? null)}
    />
  ) : setting ? (
    <SetWorkPanel
      classId={classId}
      className={classTitle}
      kind={setting.kind}
      editing={setting.editing}
      topicId={setting.topicId}
      onClose={() => setSetting(null)}
      onSaved={(n) => {
        setNote(n ?? null);
        setSetting(null);
      }}
    />
  ) : null;

  const kindOf = (r: Row): ClassworkType => (r.type === "homework" ? (r.row.kind === "quiz" ? "quiz" : "assignment") : r.row.kind);
  const counts = Object.fromEntries(kinds.map((t) => [t.kind, rows.filter((r) => kindOf(r) === t.kind).length])) as Record<ClassworkType, number>;
  const filtered = kindFilter === "all" ? rows : rows.filter((r) => kindOf(r) === kindFilter);
  const groups: { key: string; topic: Topic | null; items: Row[]; label?: string; icon?: IconName }[] =
    groupBy === "kind"
      ? kinds.map((t) => ({ key: `kind-${t.kind}`, topic: null, label: KIND_GROUP[t.kind], icon: t.icon, items: filtered.filter((r) => kindOf(r) === t.kind) }))
      : [
          { key: "none", topic: null, items: filtered.filter((r) => !r.topicId || !topics.some((t) => t.id === r.topicId)) },
          ...topics.map((t) => ({ key: t.id, topic: t, items: filtered.filter((r) => r.topicId === t.id) })),
        ];
  const visibleGroups = groups.filter((g) => (g.topic && kindFilter === "all") || g.items.length > 0 || (rows.length === 0 && !isStaff && groupBy === "topic"));

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
          <Button variant="primary" icon="plus" onClick={() => setPicker(true)} data-guide="classwork-create">
            Create
          </Button>
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
      {editor}

      {picker && <CreatePicker onPick={pick} onClose={closePicker} />}
      {newTopic && <TopicDialog onClose={() => setNewTopic(false)} onSave={addTopic} />}
      {posting && <PostDialog classId={classId} onClose={() => setPosting(false)} onPosted={() => setNote("Posted to the class stream.")} />}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {creating && (
        <MaterialDialog
          classId={classId}
          kind={creating}
          topics={topics}
          onClose={() => setCreating(null)}
          onDone={() => {
            setCreating(null);
            load();
          }}
        />
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-guide="classwork-kinds">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            <button type="button" aria-pressed={kindFilter === "all"} onClick={() => setKindFilter("all")} className={kindFilter === "all" ? ui.chipOn : ui.chip}>
              All {rows.length}
            </button>
            {kinds.map((t) => (
              <button key={t.kind} type="button" aria-pressed={kindFilter === t.kind} onClick={() => setKindFilter(t.kind)} className={kindFilter === t.kind ? ui.chipOn : ui.chip} disabled={!counts[t.kind] && kindFilter !== t.kind}>
                <Icon name={t.icon} size="sm" />
                {KIND_GROUP[t.kind]} {counts[t.kind]}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <div role="radiogroup" aria-label="Group by" className="inline-flex rounded-xl bg-cream p-1">
            {(["kind", "topic"] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={groupBy === g} onClick={() => setGroupBy(g)} className={`min-h-11 rounded-lg px-3 text-[0.8125rem] font-medium sm:min-h-8 ${groupBy === g ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/70 hover:text-ink"}`}>
                {g === "kind" ? "By kind" : "By topic"}
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && topics.length === 0 && (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">{canEdit ? "No classwork yet. Press Create to add an assignment, a quiz, a question or a material." : "Nothing has been set for this class yet."}</p>
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
                    <button type="button" onClick={() => startSetting("assignment", null, (g.topic as Topic).id, true)} className="text-xs font-medium text-teal-800 hover:underline">
                      + Assignment
                    </button>
                    <button type="button" onClick={() => removeTopic(g.topic as Topic)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                      Delete topic
                    </button>
                  </>
                )}
              </div>
            ) : (
              g.label ? (
                <h2 className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-ink">
                  {g.icon && <Icon name={g.icon} className="h-4 w-4 text-ink/60" />}
                  {g.label}
                  <span className="text-xs font-normal text-ink/65">{g.items.length}</span>
                </h2>
              ) : (
                <h2 className="px-4 pt-3 text-sm font-semibold text-ink/65">{topics.length > 0 ? "No topic" : "Classwork"}</h2>
              )
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
                          {groupBy !== "kind" && <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/65">{KIND_LABEL[kindKey]}</p>}
                          {hw && !isStaff ? (
                            <Link href={homeworkHref(viewer)} className="block truncate text-sm font-medium text-ink hover:text-teal-700 hover:underline">
                              {r.title}
                            </Link>
                          ) : (
                            <button type="button" onClick={() => (hw?.kind === "quiz" && canEdit ? startSetting("quiz", hw) : setExpanded(open ? null : `${r.type}-${r.id}`))} aria-expanded={hw?.kind === "quiz" && canEdit ? undefined : open} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-teal-700 hover:underline">
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
                          <Select aria-label={`Topic for ${r.title}`} value={r.topicId ?? ""} onChange={(e) => moveItem(r, e.target.value)} className="max-w-[10rem] rounded-lg border border-gold-light/70 px-2 py-1 text-xs text-ink/70">
                            <option value="">No topic</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        )}
                        {canEdit && r.type === "material" && (
                          <button type="button" onClick={() => removeMaterial(r.id)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                            Delete
                          </button>
                        )}
                      </div>
                      {open && hw && isStaff && setting?.at !== `item:${hw.id}` && (
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
