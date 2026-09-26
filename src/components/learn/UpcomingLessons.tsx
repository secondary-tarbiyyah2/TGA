"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

type LessonRow = {
  id: string;
  date: string;
  timetable_slots?: { start_time: string; end_time: string; classes?: { name: string; subjects?: { name: string } | null } | null } | null;
};

/**
 * A short list of upcoming (and just-past, for easy "go back and register
 * attendance") lesson instances, linking through to the full lesson page.
 * Shared across the teacher/parent/student dashboards — each passes its own
 * already-RLS-scoped Supabase query.
 */
export function UpcomingLessons({
  classIds,
  basePath,
  extraQuery,
  emptyLabel,
}: {
  classIds: string[];
  basePath: string; // e.g. "/teach/lessons/view" or "/family/lessons/view"
  extraQuery?: string; // e.g. "&child=<id>" appended to each link (id= is always first)
  emptyLabel: string;
}) {
  const supabase = getSupabaseClient();
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      if (classIds.length === 0) {
        setLessons([]);
        return;
      }
      const { data: slots } = await supabase.from("timetable_slots").select("id").in("class_id", classIds);
      const slotIds = (slots || []).map((s) => s.id);
      if (slotIds.length === 0) {
        setLessons([]);
        return;
      }
      const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, date, timetable_slots(start_time, end_time, classes(name, subjects(name)))")
        .in("timetable_slot_id", slotIds)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      setLessons((data as unknown as LessonRow[]) || []);
    })();
  }, [supabase, classIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (lessons === null) return <p className="text-sm text-ink/60">Loading lessons…</p>;
  if (lessons.length === 0) return <p className="text-sm text-ink/60">{emptyLabel}</p>;

  return (
    <ul className="space-y-2">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link href={`${basePath}?id=${l.id}${extraQuery || ""}`} className="flex items-center justify-between rounded-lg border border-gold-light/40 p-3 text-sm hover:bg-cream">
            <span className="font-medium text-ink">
              {l.timetable_slots?.classes?.subjects?.name} — {l.timetable_slots?.classes?.name}
            </span>
            <span className="text-ink/60">
              {l.date} · {l.timetable_slots?.start_time.slice(0, 5)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
