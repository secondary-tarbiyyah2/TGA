"use client";

import { attachHomework } from "@/lib/learn/homeworkStatus";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { RecordingChip, useRecordingLinks } from "@/components/learn/class/LessonRecordingLinks";
import { ukToday } from "@/lib/learn/ukTime";
import { Icon, type IconName } from "@/components/learn/Icon";
import { EmptyState, Tag, ui, type Tone } from "@/components/learn/ui";

// Moodle's "weekly format" course page: the class laid out week by week,
// each week a section of activities (lessons, assignments, graded work),
// with a course index down the left to jump between weeks. Everything is
// read as the viewer, so RLS decides what appears.

type ActivityKind = "lesson" | "assignment" | "grade" | "announcement";

type Activity = {
  id: string;
  kind: ActivityKind;
  title: string;
  at: string; // ISO date or datetime, used for ordering and the week
  href: string;
  meta: string;
  status?: { label: string; tone: "done" | "todo" | "late" | "live" | "muted" };
  recordingUrl?: string;
};

type Week = { key: string; start: Date; activities: Activity[] };

const KIND_STYLE: Record<ActivityKind, { label: string; icon: IconName; tint: string }> = {
  lesson: { label: "Live lesson", icon: "video", tint: "bg-[var(--tone-ok-bg)] text-[var(--tone-ok)]" },
  assignment: { label: "Assignment", icon: "notebookPen", tint: "bg-[var(--tone-warn-bg)] text-[var(--tone-warn)]" },
  grade: { label: "Assessment", icon: "award", tint: "bg-[var(--tone-info-bg)] text-[var(--tone-info)]" },
  announcement: { label: "Announcement", icon: "megaphone", tint: "bg-[var(--tone-neutral-bg)] text-[var(--tone-neutral)]" },
};

const TONE: Record<NonNullable<Activity["status"]>["tone"], Tone> = {
  done: "good",
  todo: "info",
  late: "bad",
  live: "bad",
  muted: "neutral",
};

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - day);
  return x;
}

function toDate(at: string): Date {
  return new Date(at.length === 10 ? `${at}T00:00:00` : at);
}

function weekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${f(start)} – ${f(end)}`;
}

const dayTime = (at: string) =>
  toDate(at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", ...(at.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}) });

type Routes = { area: string; lessonBase: string; extra: string; classHref: (tab: string) => string };

function useActivities(classId: string, viewer: ClassViewer, routes: Routes): Activity[] | null {
  const [items, setItems] = useState<Activity[] | null>(null);
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const out: Activity[] = [];
      const today = ukToday();

      // Lessons
      const { data: slots } = await supabase.from("timetable_slots").select("id").eq("class_id", classId);
      const slotIds = (slots || []).map((s) => s.id as string);
      if (slotIds.length) {
        const { data } = await supabase
          .from("lesson_instances")
          .select("id, date, objectives, bbb_status, timetable_slots(start_time, end_time)")
          .in("timetable_slot_id", slotIds)
          .order("date")
          .limit(120);
        for (const l of (data as unknown as { id: string; date: string; objectives: string | null; bbb_status: string; timetable_slots?: { start_time: string; end_time: string } | null }[]) || []) {
          const t = l.timetable_slots;
          const past = l.date < today;
          out.push({
            id: `l-${l.id}`,
            kind: "lesson",
            title: l.objectives || "Live lesson",
            at: t ? `${l.date}T${t.start_time}` : l.date,
            href: `${routes.lessonBase}?id=${l.id}${routes.extra}`,
            meta: `${toDate(l.date).toLocaleDateString("en-GB", { weekday: "long" })}${t ? ` · ${t.start_time.slice(0, 5)}–${t.end_time.slice(0, 5)}` : ""}`,
            status:
              l.bbb_status === "live"
                ? { label: "Live now", tone: "live" }
                : past || l.bbb_status === "ended"
                  ? { label: "Finished", tone: "muted" }
                  : l.date === today
                    ? { label: "Today", tone: "todo" }
                    : undefined,
          });
        }
      }

      // Assignments (homework)
      if (childId) {
        const { data } = await supabase
          .from("homework_status")
          .select("homework_id, due_at, status")
          .eq("child_id", childId)
          .eq("class_id", classId);
        const withHw = await attachHomework<{ homework_id: string; due_at: string; status: string }, { title: string }>(supabase, data as unknown as { homework_id: string; due_at: string; status: string }[], "title");
        for (const h of withHw) {
          const s =
            h.status === "on_time"
              ? { label: "Handed in", tone: "done" as const }
              : h.status === "late"
                ? { label: "Handed in late", tone: "done" as const }
                : h.status === "missing"
                  ? { label: "Missing", tone: "late" as const }
                  : { label: "To do", tone: "todo" as const };
          out.push({ id: `h-${h.homework_id}`, kind: "assignment", title: h.homework?.title || "Homework", at: h.due_at, href: routes.classHref("assignments"), meta: `Due ${dayTime(h.due_at)}`, status: s });
        }
      } else {
        const [{ data: hw }, { count }] = await Promise.all([
          supabase.from("homework").select("id, title, due_at").eq("class_id", classId),
          supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("class_id", classId),
        ]);
        const list = (hw as { id: string; title: string; due_at: string }[]) || [];
        const { data: subs } = list.length
          ? await supabase
              .from("homework_submissions")
              .select("homework_id, submitted_at")
              .in(
                "homework_id",
                list.map((h) => h.id),
              )
          : { data: [] };
        const handed = ((subs as { homework_id: string; submitted_at: string | null }[]) || []).filter((s) => s.submitted_at);
        for (const h of list) {
          const n = handed.filter((s) => s.homework_id === h.id).length;
          out.push({
            id: `h-${h.id}`,
            kind: "assignment",
            title: h.title,
            at: h.due_at,
            href: routes.classHref("assignments"),
            meta: `Due ${dayTime(h.due_at)}`,
            status: { label: `${n}/${count ?? 0} handed in`, tone: count && n >= count ? "done" : "muted" },
          });
        }
      }

      // Graded work
      if (childId) {
        const { data } = await supabase.from("assessments_for_family").select("id, title, date, percent, grade_label").eq("class_id", classId).eq("child_id", childId);
        for (const a of (data as { id: string; title: string; date: string; percent: number | null; grade_label: string | null }[]) || []) {
          out.push({
            id: `g-${a.id}`,
            kind: "grade",
            title: a.title,
            at: a.date,
            href: routes.classHref("grades"),
            meta: dayTime(a.date),
            status: { label: a.grade_label || (a.percent != null ? `${a.percent}%` : "Graded"), tone: "done" },
          });
        }
      } else {
        const { data } = await supabase.from("assessments").select("title, date").eq("class_id", classId);
        const seen = new Map<string, { title: string; date: string; n: number }>();
        for (const a of (data as { title: string; date: string }[]) || []) {
          const k = `${a.date}|${a.title}`;
          seen.set(k, { title: a.title, date: a.date, n: (seen.get(k)?.n || 0) + 1 });
        }
        for (const [k, a] of seen) {
          out.push({ id: `g-${k}`, kind: "grade", title: a.title, at: a.date, href: routes.classHref("grades"), meta: dayTime(a.date), status: { label: `${a.n} graded`, tone: "muted" } });
        }
      }

      // Class announcements
      const { data: ann } = await supabase.from("announcements").select("id, title, created_at").eq("class_id", classId);
      for (const a of (ann as { id: string; title: string; created_at: string }[]) || []) {
        out.push({ id: `a-${a.id}`, kind: "announcement", title: a.title, at: a.created_at, href: routes.classHref("announcements"), meta: `Posted ${dayTime(a.created_at)}` });
      }

      out.sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime());
      if (!cancelled) setItems(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routes derive from the same primitives
  }, [classId, childId, isStaff]);

  return items;
}

const dayOf = (iso: string) => {
  const d = toDate(iso);
  return { wd: d.toLocaleDateString("en-GB", { weekday: "short" }), n: d.getDate() };
};

/** One thing in the class's timeline: the day on the left, a card on the right. */
function ActivityRow({ a, now }: { a: Activity; now: boolean }) {
  const k = KIND_STYLE[a.kind];
  const d = dayOf(a.at);
  return (
    <li className="relative flex gap-3 sm:gap-4">
      <span className="w-11 shrink-0 pt-3.5 text-right leading-tight sm:w-14" aria-hidden="true">
        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-ink-500">{d.wd}</span>
        <span className={`block text-lg font-bold tabular-nums ${now ? "text-forest-700" : "text-ink"}`}>{d.n}</span>
      </span>
      <span aria-hidden="true" className={`relative z-[1] mt-[1.125rem] h-3 w-3 shrink-0 rounded-full border-2 ${now ? "border-forest-700 bg-[var(--color-gold-300)]" : "border-[var(--portal-control-line)] bg-white"}`} />
      <div className={`mb-3 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-white p-3.5 shadow-[var(--portal-shadow-card)] transition-colors hover:border-[var(--portal-control-line-hover)] ${now ? "border-forest-200" : "border-[var(--portal-line)]"}`}>
        <Link href={a.href} className="group flex min-w-0 flex-[1_1_14rem] items-center gap-3 rounded-lg">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] ${k.tint}`} aria-hidden="true">
            <Icon name={k.icon} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink group-hover:text-forest-700 group-hover:underline">{a.title}</span>
            <span className="t-meta block truncate">
              {k.label} · {a.meta}
            </span>
          </span>
        </Link>
        {a.status && <Tag tone={TONE[a.status.tone]}>{a.status.label}</Tag>}
        {a.recordingUrl && <RecordingChip url={a.recordingUrl} />}
      </div>
    </li>
  );
}

export function CourseTab({ classId, viewer, routes }: { classId: string; viewer: ClassViewer; routes: Routes }) {
  const baseActivities = useActivities(classId, viewer, routes);
  const recordings = useRecordingLinks(classId);
  const activities = useMemo(
    () => (baseActivities === null ? null : baseActivities.map((a) => (a.kind === "lesson" && recordings.byLesson.has(a.id.slice(2)) ? { ...a, recordingUrl: recordings.byLesson.get(a.id.slice(2)) } : a))),
    [baseActivities, recordings.byLesson],
  );
  const thisWeek = mondayOf(new Date()).getTime();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const weeks: Week[] = useMemo(() => {
    const map = new Map<string, Week>();
    for (const a of activities || []) {
      const start = mondayOf(toDate(a.at));
      const key = start.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { key, start, activities: [] });
      map.get(key)!.activities.push(a);
    }
    return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [activities]);

  // Default: weeks more than two weeks back start collapsed, like a long
  // Moodle course where you mostly care about now.
  const isCollapsed = (w: Week) => collapsed[w.key] ?? w.start.getTime() < thisWeek - 14 * 86_400_000;
  const setAll = (value: boolean) => setCollapsed(Object.fromEntries(weeks.map((w) => [w.key, value])));

  if (activities === null) return <div className="h-64 motion-safe:animate-pulse rounded-2xl border border-gold-light bg-white" />;
  if (weeks.length === 0) {
    return (
      <EmptyState title="Nothing in this class yet" icon="calendarDays">
        Lessons, assignments and grades will appear here week by week.
      </EmptyState>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="t-meta">Week by week: lessons, work set and results.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAll(false)} className={`${ui.btnSecondary} ${ui.sm}`}>
            Expand all
          </button>
          <button type="button" onClick={() => setAll(true)} className={`${ui.btnGhost} ${ui.sm}`}>
            Collapse all
          </button>
        </div>
      </div>
      <div className="space-y-5">
        {weeks.map((w) => {
          const current = w.start.getTime() === thisWeek;
          const closed = isCollapsed(w);
          return (
            <section key={w.key} id={`week-${w.key}`} className="scroll-mt-24">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [w.key]: !closed }))}
                aria-expanded={!closed}
                className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1.5 text-left hover:bg-[var(--portal-hover)]"
              >
                <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-ink-500 transition-transform motion-reduce:transition-none ${closed ? "-rotate-90" : ""}`} />
                <h2 className="flex-1 text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">{weekLabel(w.start)}</h2>
                {current && <Tag tone="good">This week</Tag>}
                <span className="t-meta">
                  {w.activities.length} item{w.activities.length === 1 ? "" : "s"}
                </span>
              </button>
              {!closed && (
                <ol className="relative mt-2 before:absolute before:bottom-4 before:left-[calc(2.75rem+0.75rem+5px)] before:top-5 before:w-px before:bg-[var(--portal-line)] sm:before:left-[calc(3.5rem+1rem+5px)]">
                  {w.activities.map((a) => (
                    <ActivityRow key={a.id} a={a} now={current && toDate(a.at).toDateString() === new Date().toDateString()} />
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
