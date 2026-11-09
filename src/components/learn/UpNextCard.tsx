"use client";

import { attachHomework } from "@/lib/learn/homeworkStatus";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey, shiftDateKey, ukNowHm, ukTimeOf, ukToday } from "@/lib/learn/ukTime";
import { Icon } from "@/components/learn/Icon";

/**
 * "Up next": the two things a pupil (or their parent) most needs to know,
 * at the very top of the dashboard: the next live lesson and the most
 * urgent piece of homework. Everything else on the dashboard is secondary.
 *
 * Reads the same RLS-scoped tables the rest of the dashboard does
 * (timetable_slots, lesson_instances, homework_status); it never shows
 * anything the viewer couldn't already open.
 */

type LessonRaw = {
  id: string;
  date: string;
  timetable_slots: { start_time: string; end_time: string; classes: { name: string } | null; subjects: { name: string } | null } | null;
};
type NextLesson = { id: string; date: string; start: string; end: string; subject: string; className: string };

type HwRaw = { homework_id: string; due_at: string; status: string; homework: { title: string; archived_at: string | null } | null };
type HwItem = { id: string; title: string; dueAt: string; overdue: boolean };

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function dayLabel(dateKey: string, today: string, tomorrow: string): string {
  if (dateKey === today) return "Today";
  if (dateKey === tomorrow) return "Tomorrow";
  return formatDateKey(dateKey, { weekday: "long", day: "numeric", month: "short" });
}

function isUkZone(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/London";
  } catch {
    return true;
  }
}

function untilLabel(mins: number): string {
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

function useNextLesson(classIds: string[] | null): NextLesson | null | undefined {
  const [next, setNext] = useState<NextLesson | null | undefined>(undefined);
  const key = classIds ? classIds.join(",") : null;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || key === null) return;
    const ids = key ? key.split(",") : [];
    let alive = true;
    (async () => {
      if (ids.length === 0) {
        if (alive) setNext(null);
        return;
      }
      // Lesson dates and times are UK time, whatever zone the browser is in.
      const now = new Date();
      const today = ukToday(now);
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, date, timetable_slots!inner(class_id, start_time, end_time, classes(name), subjects(name))")
        .in("timetable_slots.class_id", ids)
        .gte("date", today)
        .lte("date", shiftDateKey(today, 14))
        .order("date", { ascending: true })
        .limit(60);
      if (!alive) return;
      const nowMins = minutes(ukNowHm(now));
      const upcoming = ((data as unknown as LessonRaw[] | null) || [])
        .filter((r) => r.timetable_slots)
        .map((r) => ({
          id: r.id,
          date: r.date,
          start: r.timetable_slots!.start_time.slice(0, 5),
          end: r.timetable_slots!.end_time.slice(0, 5),
          subject: r.timetable_slots!.subjects?.name || "Lesson",
          className: r.timetable_slots!.classes?.name || "",
        }))
        .filter((l) => l.date > today || minutes(l.end) > nowMins)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
      setNext(upcoming[0] || null);
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return next;
}

function useUrgentHomework(childId: string | undefined): HwItem[] | null {
  const [items, setItems] = useState<HwItem[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    let alive = true;
    supabase
      .from("homework_status")
      .select("homework_id, due_at, status")
      .eq("child_id", childId)
      .in("status", ["missing", "not_yet_due"])
      .order("due_at", { ascending: true })
      .then(async ({ data }) => {
        const withHw = (await attachHomework(supabase, data as unknown as { homework_id: string }[], "title")) as unknown as HwRaw[];
        if (!alive) return;
        const rows = withHw.filter((r) => r.homework);
        // Overdue first (oldest first), then what's due soonest.
        const overdue = rows.filter((r) => r.status === "missing");
        const due = rows.filter((r) => r.status === "not_yet_due");
        setItems([...overdue, ...due].map((r) => ({ id: r.homework_id, title: r.homework!.title, dueAt: r.due_at, overdue: r.status === "missing" })));
      });
    return () => {
      alive = false;
    };
  }, [childId]);
  return items;
}

export function UpNextCard({
  classIds,
  childId,
  heading = "Up next",
  lessonHref,
  homeworkHref,
}: {
  /** null while the classes are still loading. */
  classIds: string[] | null;
  childId?: string;
  heading?: string;
  /** Link for a lesson, given its id. */
  lessonHref: (lessonId: string) => string;
  homeworkHref: string;
}) {
  const headingId = useId();
  const lesson = useNextLesson(classIds);
  const homework = useUrgentHomework(childId);
  // Recompute "in 20 min" each minute without refetching.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // The school runs on UK time; say so when the viewer's clock differs.
  const today = ukToday(now);
  const tomorrow = shiftDateKey(today, 1);
  const nowMins = minutes(ukNowHm(now));
  const ukSuffix = isUkZone() ? "" : " (UK time)";

  let when = "";
  let live = false;
  if (lesson) {
    if (lesson.date === today && minutes(lesson.start) <= nowMins) {
      live = true;
      when = `Happening now, until ${lesson.end}${ukSuffix}`;
    } else if (lesson.date === today) {
      when = `Today at ${lesson.start}${ukSuffix}, ${untilLabel(minutes(lesson.start) - nowMins)}`;
    } else {
      when = `${dayLabel(lesson.date, today, tomorrow)} at ${lesson.start}${ukSuffix}`;
    }
  }

  const first = homework?.[0];
  const dueText = (h: HwItem) => {
    const key = ukToday(new Date(h.dueAt));
    const time = `${ukTimeOf(h.dueAt)}${ukSuffix}`;
    if (h.overdue) return `Was due ${dayLabel(key, today, tomorrow).replace(/^Today$/, "today").replace(/^Tomorrow$/, "tomorrow")}`;
    if (key === today) return `Due today at ${time}`;
    if (key === tomorrow) return `Due tomorrow at ${time}`;
    return `Due ${dayLabel(key, today, tomorrow)}`;
  };

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-gold-light bg-white">
      <h2 id={headingId} className="px-5 pt-4 text-sm font-semibold text-ink">
        {heading}
      </h2>
      <div className={`grid gap-px ${childId ? "sm:grid-cols-2" : ""}`}>
        <div className="flex gap-3 px-5 py-4">
          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${live ? "bg-teal-700 text-white" : "bg-teal-100 text-teal-700"}`}>
            <Icon name="presentation" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink/65">Next lesson</p>
            {lesson === undefined ? (
              <div className="mt-1 h-10 w-48 motion-safe:animate-pulse rounded bg-cream" />
            ) : lesson === null ? (
              <p className="mt-0.5 text-sm text-ink/70">No lessons in the next two weeks.</p>
            ) : (
              <>
                <p className="mt-0.5 truncate text-base font-semibold text-ink">{lesson.subject}</p>
                <p className={`text-sm ${live ? "font-medium text-teal-700" : "text-ink/70"}`}>{when}</p>
                <Link href={lessonHref(lesson.id)} className="mt-1 inline-block text-sm font-medium text-teal-700 hover:underline">
                  Lesson details
                </Link>
              </>
            )}
          </div>
        </div>

        {childId && (
          <div className="flex gap-3 border-t border-gold-light px-5 py-4 sm:border-l sm:border-t-0">
            <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${first?.overdue ? "bg-red-50 text-red-700" : "bg-gold-100 text-gold-900"}`}>
              <Icon name="notebookPen" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink/65">Homework</p>
              {homework === null ? (
                <div className="mt-1 h-10 w-48 motion-safe:animate-pulse rounded bg-cream" />
              ) : !first ? (
                <p className="mt-0.5 text-sm text-ink/70">All caught up. Nothing to hand in.</p>
              ) : (
                <>
                  <p className="mt-0.5 truncate text-base font-semibold text-ink">{first.title}</p>
                  <p className={`text-sm ${first.overdue ? "font-medium text-red-700" : "text-ink/70"}`}>{dueText(first)}</p>
                  <Link href={homeworkHref} className="mt-1 inline-block text-sm font-medium text-teal-700 hover:underline">
                    {homework.length > 1 ? `See all ${homework.length} to do` : "Open to do list"}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
