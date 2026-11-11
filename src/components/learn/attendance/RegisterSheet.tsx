"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey } from "@/lib/learn/ukTime";
import { effectivePeriods } from "@/lib/learn/timetable";
import { useTimetablePeriods } from "@/lib/learn/useTimetablePeriods";
import { periodName } from "@/lib/learn/registers";
import { PageHeader } from "@/components/learn/PageHeader";
import { Register } from "@/components/learn/attendance/Register";
import { EmptyState, LoadingState, ui } from "@/components/learn/ui";

type Lesson = { id: string; date: string; start: string; end: string; classId: string; className: string };

/**
 * One lesson's register on its own focused page (owner feedback 11 Nov 2026, item 9), opened
 * from the registers list: the lesson's date, class and period at the top, Back to the list,
 * then the one-tap register (Present, Late, Absent, Authorised, Other, a note per pupil). Each
 * mark saves as it is chosen, so "Done" simply goes back.
 */
export function RegisterSheet({ lessonId, base, from }: { lessonId: string | null; base: "/teach" | "/admin"; /** "class": opened from a class, so Back returns to its Register section. */ from?: string | null }) {
  const [lesson, setLesson] = useState<Lesson | null | "missing">(null);
  const [progress, setProgress] = useState<{ taken: number; total: number } | null>(null);
  const periods = useTimetablePeriods();
  const classId = lesson && lesson !== "missing" ? lesson.classId : null;
  const fromClass = from === "class" && classId;
  const listHref = fromClass ? `${base}/class?id=${classId}&tab=attendance` : base === "/teach" ? "/teach/today" : "/admin/attendance";
  const listLabel = fromClass ? "The class" : base === "/teach" ? "Lessons and registers" : "Registers";

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !lessonId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no lesson to load
      setLesson("missing");
      return;
    }
    let alive = true;
    supabase
      .from("lesson_instances")
      .select("id, date, timetable_slots(class_id, start_time, end_time, classes(name))")
      .eq("id", lessonId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const l = data as unknown as { id: string; date: string; timetable_slots?: { class_id: string; start_time: string; end_time: string; classes?: { name: string } | null } | null } | null;
        if (!l || !l.timetable_slots) return setLesson("missing");
        const t = l.timetable_slots;
        setLesson({ id: l.id, date: l.date, start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5), classId: t.class_id, className: t.classes?.name || "Class" });
      });
    return () => {
      alive = false;
    };
  }, [lessonId]);

  const crumbs = [{ label: listLabel, href: listHref }, { label: "Register" }];
  if (lesson === null) return <LoadingState label="Loading the register" />;
  if (lesson === "missing")
    return (
      <>
        <PageHeader crumbs={crumbs} title="Register" back={{ label: listLabel, href: listHref }} />
        <EmptyState title="This register could not be found" action={<Link href={listHref} className={ui.btnSecondary}>Back to {listLabel.toLowerCase()}</Link>}>
          The lesson may have been removed from the timetable, or it is not one of yours.
        </EmptyState>
      </>
    );

  const period = periodName(lesson.start, effectivePeriods(periods));
  const day = formatDateKey(lesson.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const classHref = `${base}/class?id=${lesson.classId}`;
  const done = progress && progress.total > 0 && progress.taken >= progress.total;
  return (
    <>
      <PageHeader
        crumbs={crumbs}
        back={{ label: listLabel, href: listHref }}
        title={`Register: ${lesson.className}`}
        subtitle={`${day}, ${period ? `${period}, ` : ""}${lesson.start} to ${lesson.end}.`}
        actions={
          <>
            <Link href={classHref} className={ui.btnSecondary}>
              Class
            </Link>
            <Link href={`${base}/lessons/view?id=${lesson.id}`} className={ui.btnSecondary}>
              Lesson page
            </Link>
          </>
        }
        action={
          <Link href={listHref} className={done ? ui.btnPrimary : ui.btnSecondary}>
            {done ? "Done" : "Back to the list"}
          </Link>
        }
      />
      <p className="mb-3 text-sm text-ink-500">
        Each mark saves as you choose it. Authorised is an absence the school has agreed to; add a note to any mark.
      </p>
      <section className="overflow-hidden rounded-[10px] border border-gold-light bg-white">
        <Register lessonId={lesson.id} classId={lesson.classId} onProgress={(taken, total) => setProgress({ taken, total })} />
      </section>
      <p className="mt-4">
        <Link href={listHref} className={ui.btnLink}>
          Back to {listLabel.toLowerCase()}
        </Link>
      </p>
    </>
  );
}
