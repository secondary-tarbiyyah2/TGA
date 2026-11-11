"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";
import { Status, ui } from "@/components/learn/ui";

type CoverRow = { id: string; covering_teacher_user_id: string | null; reason: string | null; timetable_slots?: { start_time: string; classes?: { name: string } | null } | null };

/**
 * Today's cover on the head's Today (cover_assignments for today; RLS: staff who manage cover),
 * each lesson with whether a teacher is covering it. Shown beside today's lessons. This and the
 * lessons list replace the old row of "Today at a glance" figures, which repeated them and
 * Waiting for you.
 */
export function CoverToday() {
  const [rows, setRows] = useState<CoverRow[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("cover_assignments")
      .select("id, covering_teacher_user_id, reason, timetable_slots(start_time, classes(name))")
      .eq("cover_date", ukToday())
      .then(({ data, error }) => {
        if (alive) setRows(error ? [] : ((data as unknown as CoverRow[]) || []).sort((a, b) => (a.timetable_slots?.start_time || "").localeCompare(b.timetable_slots?.start_time || "")));
      });
    return () => {
      alive = false;
    };
  }, []);
  const uncovered = (rows || []).filter((c) => !c.covering_teacher_user_id).length;

  return (
    <section data-guide="admin-cover-today" aria-labelledby="cover-today" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gold-light px-5 py-3.5">
        <h2 id="cover-today" className="text-sm font-semibold text-ink">
          Cover today
          {rows && rows.length > 0 && <span className={`ml-1.5 font-normal ${uncovered ? "text-amber-900" : "text-ink/60"}`}>· {uncovered ? `${uncovered} without a teacher` : "all covered"}</span>}
        </h2>
        <Link href="/admin/absences" className={`${ui.btnLink} !text-xs`}>
          Staff cover
        </Link>
      </div>
      {rows === null ? (
        <div className="m-5 h-16 motion-safe:animate-pulse rounded-xl bg-cream" aria-label="Loading" />
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink/65">No lessons need cover today.</p>
      ) : (
        <ul className="divide-y divide-gold-light/70">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="w-12 shrink-0 tabular-nums text-ink-500">{c.timetable_slots?.start_time?.slice(0, 5) || ""}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{c.timetable_slots?.classes?.name || "A lesson"}</span>
                {c.reason && <span className="block truncate text-ink-500">{c.reason}</span>}
              </span>
              {c.covering_teacher_user_id ? <Status kind="completed">Covered</Status> : <Status kind="attention">Needs a teacher</Status>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
