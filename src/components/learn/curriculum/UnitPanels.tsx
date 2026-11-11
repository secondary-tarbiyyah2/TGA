"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { yearLabel } from "@/lib/learn/curriculum";
import type { WeekPlan } from "@/lib/learn/curriculumUnits";
import { SidePanel, WorkflowBadge, Loading, type WorkflowStatus } from "@/components/learn/kit";
import { btn } from "@/components/learn/ui";

type LessonRow = { id: string; lesson_no: number; title: string; objectives: string[] | null };

/**
 * A unit's lessons in a panel over the Curriculum map (owner, 11 Nov 2026: no hopping between
 * pages; docs/portal-structure.md, pattern 4). Each lesson shows its review status and opens its
 * own lesson workspace; the library is one link away for anything more (download, share, edit).
 */
export function UnitLessonsPanel({
  area,
  subjectSlug,
  subject,
  year,
  unit,
  libUnit,
  statusOf,
  onClose,
  onBack,
}: {
  area: "admin" | "teach";
  subjectSlug: string;
  subject: string;
  year: string;
  /** The unit's title as the plan has it. */
  unit: string;
  /** The unit's name in the lesson library (it can differ slightly from the plan's). */
  libUnit: string | null;
  statusOf: (lessonNo: number) => WorkflowStatus | null;
  onClose: () => void;
  /** Back to the unit's detail, when the panel was opened from it. */
  onBack?: () => void;
}) {
  const [rows, setRows] = useState<LessonRow[] | null>(libUnit ? null : []);
  useEffect(() => {
    if (!libUnit) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("curriculum_lessons")
      .select("id, lesson_no, title, objectives")
      .eq("year", year)
      .eq("subject_slug", subjectSlug)
      .eq("unit", libUnit)
      .order("lesson_no")
      .then(({ data }) => {
        if (alive) setRows(((data as LessonRow[] | null) || []).sort((a, b) => a.lesson_no - b.lesson_no));
      });
    return () => {
      alive = false;
    };
  }, [year, subjectSlug, libUnit]);
  const libHref = `/${area}/curriculum?year=${year}&subject=${encodeURIComponent(subjectSlug)}${libUnit ? `&unit=${encodeURIComponent(libUnit)}` : ""}`;
  return (
    <SidePanel
      title={unit}
      eyebrow={`${subject} · ${yearLabel(year)} · Lessons`}
      onClose={onClose}
      footer={
        <>
          {onBack && (
            <button type="button" onClick={onBack} className={btn("ghost", "sm")}>
              Back to the unit
            </button>
          )}
          <Link href={libHref} className={`${btn("secondary", "sm")} ml-auto`}>
            Open in the Lesson library
          </Link>
        </>
      }
    >
      <div data-guide="map-unit-lessons">
        {rows === null ? (
          <Loading label="Loading the lessons" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-500">No lessons have been written for this unit yet.</p>
        ) : (
          <ol className="divide-y divide-gold-light">
            {rows.map((l) => (
              <li key={l.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 w-7 shrink-0 text-right text-sm tabular-nums text-ink-500">{l.lesson_no}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{l.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <WorkflowBadge status={statusOf(l.lesson_no) || "draft"} />
                    {l.objectives && l.objectives.length > 0 && <span>{l.objectives.length} objective{l.objectives.length === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                <Link href={`/${area}/curriculum/lesson?id=${encodeURIComponent(l.id)}`} className={btn("secondary", "sm")}>
                  Open
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SidePanel>
  );
}

/** A unit's week-by-week plan in a panel over the map (the planner's own `weeks`), so the
 * syllabus is read in place; the full Syllabus page is one link away. */
export function UnitWeeksPanel({ title, subject, year, weeks, syllabusHref, onClose, onBack }: { title: string; subject: string; year: string; weeks: WeekPlan[]; syllabusHref: string; onClose: () => void; onBack?: () => void }) {
  return (
    <SidePanel
      title={title}
      eyebrow={`${subject} · ${yearLabel(year)} · Weekly plan`}
      onClose={onClose}
      footer={
        <>
          {onBack && (
            <button type="button" onClick={onBack} className={btn("ghost", "sm")}>
              Back to the unit
            </button>
          )}
          <Link href={syllabusHref} className={`${btn("secondary", "sm")} ml-auto`}>
            Open the Syllabus
          </Link>
        </>
      }
    >
      <div data-guide="map-unit-weeks">
        {weeks.length === 0 ? (
          <p className="text-sm text-ink-500">This unit has no week-by-week plan yet. It is added in the Planner.</p>
        ) : (
          <ol className="space-y-5">
            {weeks.map((w) => (
              <li key={w.week}>
                <p className="t-eyebrow">Week {w.week}</p>
                {w.lessons.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
                    {w.lessons.map((x, i) => (
                      <li key={i} className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-1.5">
                        <span aria-hidden="true" className="mt-[0.5rem] h-1 w-1 rounded-full bg-forest-500" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {w.vocabulary.length > 0 && <p className="mt-1.5 text-xs text-ink-500">Vocabulary: {w.vocabulary.join(", ")}</p>}
                {w.home && <p className="mt-1 text-xs text-ink-500">Home learning: {w.home}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </SidePanel>
  );
}
