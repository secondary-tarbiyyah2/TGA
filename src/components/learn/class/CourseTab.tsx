"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ClassViewer } from "@/lib/learn/classes";
import { RecordingChip, useRecordingLinks } from "@/components/learn/class/LessonRecordingLinks";

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

const KIND_STYLE: Record<ActivityKind, { bg: string; label: string; path: string }> = {
  lesson: {
    bg: "#1f6f6b",
    label: "Live lesson",
    path: "M3 5.5A1.5 1.5 0 014.5 4h7A1.5 1.5 0 0113 5.5v1.3l3.2-2A.5.5 0 0117 5.2v9.6a.5.5 0 01-.8.4L13 13.2v1.3a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 14.5v-9z",
  },
  assignment: {
    bg: "#6b3f69",
    label: "Assignment",
    path: "M6 2h6l4 4v11a1 1 0 01-1 1H6a2 2 0 01-2-2V4a2 2 0 012-2zm5 1.5V7h3.5L11 3.5zM7 10h6v1.5H7V10zm0 3h6v1.5H7V13z",
  },
  grade: {
    bg: "#9a4b2f",
    label: "Assessment",
    path: "M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.3l-4.8 2.6.9-5.4L2.2 7.7l5.4-.8L10 2z",
  },
  announcement: {
    bg: "#2d5f86",
    label: "Announcement",
    path: "M15 3v12l-4-2.5H6.5l.9 3.5H5.3l-1-3.6A2.5 2.5 0 013 10V8a2.5 2.5 0 012.5-2.5H11L15 3z",
  },
};

const TONE: Record<NonNullable<Activity["status"]>["tone"], string> = {
  done: "bg-green-50 text-green-800 ring-green-600/20",
  todo: "bg-teal-100 text-teal-900 ring-teal-700/20",
  late: "bg-red-50 text-red-800 ring-red-600/20",
  live: "bg-red-600 text-white ring-red-600",
  muted: "bg-cream text-ink/60 ring-ink/10",
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
      const today = new Date().toISOString().slice(0, 10);

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
          .select("homework_id, due_at, status, homework:homework_id(title)")
          .eq("child_id", childId)
          .eq("class_id", classId);
        for (const h of (data as unknown as { homework_id: string; due_at: string; status: string; homework?: { title: string } | null }[]) || []) {
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

function ActivityRow({ a }: { a: Activity }) {
  const k = KIND_STYLE[a.kind];
  return (
    <li className="flex items-center gap-2 rounded-lg pr-3 transition-colors hover:bg-cream">
      <Link href={a.href} className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: k.bg }} title={k.label}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
            <path d={k.path} fill="currentColor" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink/45">{k.label}</span>
          <span className="block truncate text-sm font-medium text-ink group-hover:text-teal-700 group-hover:underline">{a.title}</span>
          <span className="block truncate text-xs text-ink/55">{a.meta}</span>
        </span>
        {a.status && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE[a.status.tone]}`}>{a.status.label}</span>}
      </Link>
      {a.recordingUrl && <RecordingChip url={a.recordingUrl} />}
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

  if (activities === null) return <div className="h-64 animate-pulse rounded-2xl border border-gold-light bg-white" />;
  if (weeks.length === 0) {
    return <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/60">Nothing in this class yet. Lessons, assignments and grades will appear here week by week.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Course index (Moodle's left drawer) */}
      <nav aria-label="Course index" className="hidden lg:block">
        <div className="sticky top-[76px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl border border-gold-light bg-white p-2">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/45">Course index</p>
          <ul>
            {weeks.map((w) => {
              const current = w.start.getTime() === thisWeek;
              return (
                <li key={w.key}>
                  <a
                    href={`#week-${w.key}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [w.key]: false }))}
                    className={`block rounded-lg px-2 py-1.5 text-sm ${current ? "bg-teal-100 font-semibold text-teal-900" : "text-ink/75 hover:bg-cream"}`}
                  >
                    {weekLabel(w.start)}
                  </a>
                  {current && (
                    <ul className="mb-1 ml-3 border-l border-gold-light pl-2">
                      {w.activities.map((a) => (
                        <li key={a.id} className="truncate py-0.5 text-xs text-ink/60">
                          {a.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="min-w-0">
        <div className="mb-3 flex justify-end gap-3 text-sm">
          <button type="button" onClick={() => setAll(false)} className="font-medium text-teal-700 hover:underline">
            Expand all
          </button>
          <button type="button" onClick={() => setAll(true)} className="font-medium text-teal-700 hover:underline">
            Collapse all
          </button>
        </div>
        <div className="space-y-4">
          {weeks.map((w) => {
            const current = w.start.getTime() === thisWeek;
            const closed = isCollapsed(w);
            return (
              <section
                key={w.key}
                id={`week-${w.key}`}
                className={`scroll-mt-20 rounded-2xl border bg-white ${current ? "border-teal-500 ring-1 ring-teal-500/30" : "border-gold-light"}`}
              >
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [w.key]: !closed }))}
                  aria-expanded={!closed}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-ink/50 transition-transform ${closed ? "-rotate-90" : ""}`}>
                    <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h2 className="flex-1 text-base font-semibold text-ink">{weekLabel(w.start)}</h2>
                  {current && <span className="rounded-full bg-teal-700 px-2.5 py-0.5 text-xs font-semibold text-white">This week</span>}
                  <span className="text-xs text-ink/50">
                    {w.activities.length} item{w.activities.length === 1 ? "" : "s"}
                  </span>
                </button>
                {!closed && (
                  <ul className="border-t border-gold-light/70 p-2">
                    {w.activities.map((a) => (
                      <ActivityRow key={a.id} a={a} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
