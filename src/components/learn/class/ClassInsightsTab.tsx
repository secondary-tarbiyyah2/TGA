"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClassRoster } from "@/components/learn/class/PupilPicker";
import { LOOKBACK_DAYS, Tile, loadClassAttendance, rateOf, type ClassMark } from "@/components/learn/class/ClassAttendanceTab";

type StatusRow = { child_id: string; status: string; homework_id: string };
type Grade = { child_id: string; percent: number | null };

/**
 * A class at a glance, like Teams for Education's Insights: attendance,
 * homework handed in, work waiting to be marked and average results, then the
 * pupils who may need a word. Read from the same sources as the Attendance,
 * Classwork and Grades tabs; each figure links to the tab it comes from.
 */
export function ClassInsightsTab({ classId, classHref }: { classId: string; classHref: (tab: string) => string }) {
  const roster = useClassRoster(classId);
  const [marks, setMarks] = useState<ClassMark[] | null>(null);
  const [hw, setHw] = useState<StatusRow[] | null>(null);
  const [review, setReview] = useState<number | null>(null);
  const [grades, setGrades] = useState<Grade[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    (async () => {
      const [att, st, rq, gr] = await Promise.all([
        loadClassAttendance(classId),
        supabase.from("homework_status").select("child_id, status, homework_id").eq("class_id", classId).gte("due_at", since).limit(5000),
        supabase.from("homework_review_queue").select("submission_id", { count: "exact", head: true }).eq("class_id", classId),
        supabase.from("assessments").select("child_id, percent").eq("class_id", classId).gte("date", since.slice(0, 10)).limit(5000),
      ]);
      if (!alive) return;
      setMarks(att?.marks || []);
      setHw((st.data as unknown as StatusRow[]) || []);
      setReview(rq.count ?? 0);
      setGrades((gr.data as unknown as Grade[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [classId]);

  const pupils = useMemo(() => {
    if (!roster || !marks || !hw || !grades) return null;
    return roster
      .map((p) => {
        const att = rateOf(marks.filter((m) => m.child_id === p.id));
        const mine = hw.filter((h) => h.child_id === p.id);
        const missing = mine.filter((h) => h.status === "missing").length;
        const scores = grades.filter((g) => g.child_id === p.id && g.percent != null).map((g) => Number(g.percent));
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const reasons: string[] = [];
        if (att !== null && att < 90) reasons.push(`attendance ${att}%`);
        if (missing >= 2) reasons.push(`${missing} homework missing`);
        if (avg !== null && avg < 50) reasons.push(`average ${avg}%`);
        return { ...p, reasons };
      })
      .filter((p) => p.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));
  }, [roster, marks, hw, grades]);

  if (!roster || !marks || !hw || review === null || !grades || !pupils) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  const due = hw.filter((h) => h.status !== "not_yet_due");
  const handedIn = due.filter((h) => h.status === "on_time" || h.status === "late").length;
  const missing = due.filter((h) => h.status === "missing").length;
  const scored = grades.filter((g) => g.percent != null).map((g) => Number(g.percent));
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const att = rateOf(marks);
  const weeks = LOOKBACK_DAYS / 7;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/65">
        The last {weeks} weeks for this class: {roster.length} pupil{roster.length === 1 ? "" : "s"}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={classHref("attendance")} className="block rounded-2xl hover:ring-2 hover:ring-teal-700/30">
          <Tile label="Attendance" value={att === null ? "–" : `${att}%`} sub="Present, late or not engaged" alert={att !== null && att < 90} />
        </Link>
        <Link href={classHref("classwork")} className="block rounded-2xl hover:ring-2 hover:ring-teal-700/30">
          <Tile label="Homework handed in" value={due.length ? `${Math.round((handedIn / due.length) * 100)}%` : "–"} sub={missing ? `${missing} missing` : "Nothing missing"} alert={missing > 0} />
        </Link>
        <Link href={`${classHref("classwork")}&view=review`} className="block rounded-2xl hover:ring-2 hover:ring-teal-700/30">
          <Tile label="To review" value={String(review)} sub={review ? "Handed in, not yet returned" : "All marked"} alert={review > 0} />
        </Link>
        <Link href={classHref("grades")} className="block rounded-2xl hover:ring-2 hover:ring-teal-700/30">
          <Tile label="Average result" value={avg === null ? "–" : `${avg}%`} sub={`${scored.length} result${scored.length === 1 ? "" : "s"} recorded`} />
        </Link>
      </div>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="border-b border-gold-light px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Pupils who may need a word</h2>
          <p className="text-xs text-ink/65">Attendance under 90%, two or more pieces of homework missing, or an average under 50%.</p>
        </div>
        {pupils.length === 0 ? (
          <p className="p-5 text-sm text-ink/65">No one stands out. Everyone is attending, handing work in and doing well.</p>
        ) : (
          <ul className="divide-y divide-gold-light/60">
            {pupils.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">{p.name}</span>
                {p.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-600/20">
                    {r}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
