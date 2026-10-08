"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { renderMarkup } from "@/lib/learn/markup";
import { DEFAULT_CLASS_SETTINGS, fetchClassSettings, type ClassSettings } from "@/lib/learn/classSettings";
import { AttachmentList, cleanAttachments, type Attachment } from "@/components/learn/class/Attachments";
import { AnnouncementComposer } from "@/components/learn/class/AnnouncementComposer";
import { RecordingChip, useRecordingLinks } from "@/components/learn/class/LessonRecordingLinks";

type AnnRow = {
  id: string;
  title: string;
  body: string;
  body_format: "plain" | "markup";
  attachments: unknown;
  allow_comments: boolean;
  publish_at: string | null;
  audience_child_ids: string[] | null;
  created_at: string;
  pinned: boolean;
  recalled_at: string | null;
};
type MatRow = { id: string; title: string; kind: "material" | "question"; body: string | null; resources: unknown; allow_comments: boolean; created_at: string };
type Comment = { id: string; announcement_id: string | null; material_id: string | null; author_id: string; author_name: string; body: string; created_at: string; deleted_at: string | null };

type FeedItem =
  | { type: "announcement"; at: string; row: AnnRow }
  | { type: "material"; at: string; row: MatRow };

type Upcoming = { id: string; title: string; when: string; href: string; kind: "lesson" | "homework" };

const fmtWhen = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: iso.length === 10 ? undefined : "2-digit", minute: iso.length === 10 ? undefined : "2-digit" });

function CommentThread({
  classId,
  target,
  comments,
  canComment,
  showRemoved,
  isStaff,
  myId,
  onChanged,
}: {
  classId: string;
  target: { announcementId?: string; materialId?: string };
  comments: Comment[];
  canComment: boolean;
  showRemoved: boolean;
  isStaff: boolean;
  myId: string | null;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = comments.filter((c) => !c.deleted_at || (isStaff && showRemoved));

  const add = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !text.trim() || !myId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("class_post_comments").insert({
      class_id: classId,
      announcement_id: target.announcementId ?? null,
      material_id: target.materialId ?? null,
      author_id: myId,
      body: text.trim(),
    });
    setBusy(false);
    if (err) return setError("Could not add your comment.");
    setText("");
    onChanged();
  };

  const remove = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from("class_post_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    onChanged();
  };

  return (
    <div className="mt-3 border-t border-gold-light/60 pt-3">
      {visible.length === 0 && <p className="text-xs text-ink/65">No comments yet.</p>}
      <ul className="space-y-2.5">
        {visible.map((c) => (
          <li key={c.id} className={`text-sm ${c.deleted_at ? "opacity-60" : ""}`}>
            <p className="text-xs text-ink/60">
              <span className="font-semibold text-ink/80">{c.author_name}</span> · {fmtWhen(c.created_at)}
              {c.deleted_at && <span className="ml-1 rounded bg-cream px-1.5 py-0.5 text-[11px] font-medium text-ink/60">Removed</span>}
            </p>
            <p className={`whitespace-pre-wrap text-ink/85 ${c.deleted_at ? "line-through" : ""}`}>{c.body}</p>
            {!c.deleted_at && (isStaff || c.author_id === myId) && (
              <button type="button" onClick={() => remove(c.id)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canComment && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            maxLength={2000}
            placeholder="Add a class comment"
            aria-label="Add a class comment"
            className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm"
          />
          <button type="button" onClick={add} disabled={busy || !text.trim()} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50">
            Post
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/**
 * The class Stream: announcements and newly posted classwork, newest first,
 * with an "Upcoming" side panel (next lessons, homework due). Staff get the
 * announcement composer; pupils and families see only what is addressed to
 * them (RLS) and, where the class allows it, comment on posts.
 */
export function StreamTab({ classId, viewer, area, classHref }: { classId: string; viewer: ClassViewer; area: string; classHref: (tab: string) => string }) {
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";
  const [settings, setSettings] = useState<ClassSettings>(DEFAULT_CLASS_SETTINGS);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
  const recordings = useRecordingLinks(classId);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMyId(user?.id ?? null);
    const [s, ann, mats, com] = await Promise.all([
      fetchClassSettings(classId),
      supabase
        .from("announcements")
        .select("id, title, body, body_format, attachments, allow_comments, publish_at, audience_child_ids, created_at, pinned, recalled_at")
        .eq("class_id", classId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("class_materials").select("id, title, kind, body, resources, allow_comments, created_at").eq("class_id", classId).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("class_comments_for", { p_class_id: classId }),
    ]);
    setSettings(s);
    const feed: FeedItem[] = [
      ...(((ann.data as unknown as AnnRow[]) || []).map((row) => ({ type: "announcement" as const, at: row.publish_at || row.created_at, row }))),
      ...(((mats.data as unknown as MatRow[]) || []).map((row) => ({ type: "material" as const, at: row.created_at, row }))),
    ];
    // Pinned notices first, then newest first.
    feed.sort((a, b) => Number(b.type === "announcement" && b.row.pinned) - Number(a.type === "announcement" && a.row.pinned) || b.at.localeCompare(a.at));
    setItems(feed);
    setComments((com.data as unknown as Comment[]) || []);

    // Upcoming: homework due and the next lessons.
    const out: Upcoming[] = [];
    const nowIso = new Date().toISOString();
    const { data: hw } = await supabase.from("homework").select("id, title, due_at").eq("class_id", classId).is("archived_at", null).gte("due_at", nowIso).order("due_at").limit(4);
    for (const h of (hw as unknown as { id: string; title: string; due_at: string }[]) || []) {
      out.push({ id: `h${h.id}`, title: h.title, when: h.due_at, href: classHref("classwork"), kind: "homework" });
    }
    const { data: slots } = await supabase.from("timetable_slots").select("id").eq("class_id", classId);
    const slotIds = ((slots as unknown as { id: string }[]) || []).map((x) => x.id);
    if (slotIds.length) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: ls } = await supabase.from("lesson_instances").select("id, date, objectives, timetable_slots(start_time)").in("timetable_slot_id", slotIds).gte("date", today).order("date").limit(3);
      for (const l of (ls as unknown as { id: string; date: string; objectives: string | null; timetable_slots: { start_time: string } | null }[]) || []) {
        out.push({
          id: `l${l.id}`,
          title: l.objectives || "Live lesson",
          when: l.timetable_slots ? `${l.date}T${l.timetable_slots.start_time}` : l.date,
          href: `${area}/lessons/view?id=${l.id}${viewer.kind === "parent" ? `&child=${viewer.childId}` : ""}`,
          kind: "lesson",
        });
      }
    }
    out.sort((a, b) => a.when.localeCompare(b.when));
    setUpcoming(out.slice(0, 6));
  }, [classId, area, classHref, viewer]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the class changes
  }, [classId]);

  const recall = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from("announcements").update({ recalled_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  const canComment = isStaff || (viewer.kind === "student" && settings.studentsCanComment);
  const toggleThread = (key: string) =>
    setOpenThreads((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const shown = (items || []).filter((i) => i.type !== "announcement" || !i.row.recalled_at || (isStaff && settings.showDeletedToStaff));
  const latestRecording = recordings.latest;

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4 lg:order-first">
        <section className="rounded-2xl border border-gold-light bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">Nothing coming up.</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {upcoming.map((u) => (
                <li key={u.id}>
                  <Link href={u.href} className="block text-sm hover:underline">
                    <span className="font-medium text-ink">{u.title}</span>
                    <span className="block text-xs text-ink/60">
                      {u.kind === "lesson" ? "Lesson" : "Due"} {fmtWhen(u.when)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {latestRecording && (
          <section className="rounded-2xl border border-gold-light bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">Latest lesson recording</h2>
            <div className="mt-2">
              <RecordingChip url={latestRecording.url} />
            </div>
          </section>
        )}
      </aside>

      <div className="min-w-0 space-y-4">
        {isStaff && <AnnouncementComposer classId={classId} onPosted={load} />}
        {items === null && <div className="h-28 animate-pulse rounded-2xl bg-white" />}
        {items !== null && shown.length === 0 && (
          <p className="rounded-2xl border border-gold-light bg-white px-5 py-8 text-center text-sm text-ink/60">
            {isStaff ? "Nothing here yet. Announce something to your class, or add classwork." : "Nothing has been posted to this class yet."}
          </p>
        )}
        {shown.map((item) => {
          const key = `${item.type}-${item.row.id}`;
          const isAnn = item.type === "announcement";
          const att: Attachment[] = cleanAttachments(isAnn ? (item.row as AnnRow).attachments : (item.row as MatRow).resources);
          const allow = item.row.allow_comments;
          const mine = comments.filter((c) => (isAnn ? c.announcement_id === item.row.id : c.material_id === item.row.id));
          const live = mine.filter((c) => !c.deleted_at).length;
          const recalled = isAnn && (item.row as AnnRow).recalled_at;
          const scheduled = isAnn && (item.row as AnnRow).publish_at && new Date((item.row as AnnRow).publish_at as string).getTime() > Date.now();
          const audience = isAnn ? (item.row as AnnRow).audience_child_ids : null;
          return (
            <article key={key} className={`rounded-2xl border border-gold-light bg-white p-5 ${recalled ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    {isAnn ? item.row.title : <Link href={classHref("classwork")} className="hover:underline">{item.row.title}</Link>}
                  </h3>
                  <p className="text-xs text-ink/55">
                    {isAnn ? "Announcement" : (item.row as MatRow).kind === "question" ? "New question" : "New material"} · {fmtWhen(item.at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {scheduled && <span className="rounded-full bg-gold-light/50 px-2 py-0.5 text-xs font-medium text-gold-700">Scheduled</span>}
                  {recalled && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink/60">Removed</span>}
                  {isStaff && audience && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink/70">{audience.length} selected pupil{audience.length === 1 ? "" : "s"}</span>}
                  {isStaff && isAnn && !recalled && (
                    <button type="button" onClick={() => recall(item.row.id)} className="text-xs text-ink/65 hover:text-red-700 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {item.row.body && (
                <div className="mt-2 space-y-1 text-sm text-ink/85">
                  {isAnn && (item.row as AnnRow).body_format === "markup" ? renderMarkup(item.row.body ?? "") : <p className="whitespace-pre-wrap">{item.row.body}</p>}
                </div>
              )}
              <AttachmentList attachments={att} />
              {allow && (
                <div className="mt-3">
                  <button type="button" onClick={() => toggleThread(key)} aria-expanded={openThreads.has(key)} className="text-xs font-medium text-teal-800 hover:underline">
                    {live} class comment{live === 1 ? "" : "s"}
                  </button>
                  {openThreads.has(key) && (
                    <CommentThread
                      classId={classId}
                      target={isAnn ? { announcementId: item.row.id } : { materialId: item.row.id }}
                      comments={mine}
                      canComment={canComment}
                      showRemoved={settings.showDeletedToStaff}
                      isStaff={isStaff}
                      myId={myId}
                      onChanged={load}
                    />
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
