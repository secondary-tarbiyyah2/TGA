"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";

type Lesson = { id: string; start_time: string; registered: number };
type Marks = { present: number; marked: number; absentPupils: number };

/**
 * "The school today" on the head's Today (owner feedback 3, 11 Nov 2026: the idea of a short
 * figures strip; TGA's own look, the same hairline strip as Insights): a handful of live figures, each a link to the page behind it. Registers taken of
 * the lessons started, attendance from today's marks, pupils marked absent and today's cover.
 * Every figure is a query on the same records as its page (attendance_records for today's
 * published lessons, cover_assignments for today); nothing is estimated.
 */
export function SchoolToday({ lessons, now }: { lessons: Lesson[] | null; now: string }) {
  const [marks, setMarks] = useState<Marks | null>(null);
  const [cover, setCover] = useState<{ total: number; open: number } | null>(null);
  const ids = (lessons || []).map((l) => l.id).join(",");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || lessons === null) return;
    let alive = true;
    (async () => {
      const [att, cov] = await Promise.all([
        lessons.length ? supabase.from("attendance_records").select("child_id, status").in("lesson_instance_id", lessons.map((l) => l.id)).limit(10000) : Promise.resolve({ data: [], error: null }),
        supabase.from("cover_assignments").select("covering_teacher_user_id").eq("cover_date", ukToday()),
      ]);
      if (!alive) return;
      const rows = (att.data as { child_id: string; status: string }[] | null) || [];
      setMarks(att.error ? null : { present: rows.filter((r) => r.status === "present" || r.status === "late").length, marked: rows.length, absentPupils: new Set(rows.filter((r) => r.status === "absent").map((r) => r.child_id)).size });
      const c = (cov.data as { covering_teacher_user_id: string | null }[] | null) || [];
      setCover(cov.error ? null : { total: c.length, open: c.filter((x) => !x.covering_teacher_user_id).length });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on today's lesson ids
  }, [ids, lessons === null]);

  const started = (lessons || []).filter((l) => now >= l.start_time.slice(0, 5));
  const taken = started.filter((l) => l.registered > 0).length;
  const pct = marks && marks.marked ? Math.round((marks.present / marks.marked) * 100) : null;
  const wait = "…";

  const figures: { label: string; value: string; note: string; href: string; tone: "good" | "warn" | "plain" }[] = [
    {
      label: "Registers",
      value: lessons === null ? wait : `${taken} of ${started.length}`,
      note: started.length === 0 ? "No lessons started yet" : taken === started.length ? "All taken so far" : `${started.length - taken} not taken`,
      href: "/admin/attendance",
      tone: started.length && taken < started.length ? "warn" : "good",
    },
    {
      label: "Attendance",
      value: marks === null ? wait : pct === null ? "–" : `${pct}%`,
      note: marks && marks.marked ? `${marks.present} of ${marks.marked} marks present or late` : "No marks yet today",
      href: "/admin/attendance",
      tone: pct !== null && pct < 90 ? "warn" : "plain",
    },
    {
      label: "Absent today",
      value: marks === null ? wait : String(marks.absentPupils),
      note: marks && marks.absentPupils ? "Pupils marked absent in a lesson" : "No one marked absent",
      href: "/admin/absences",
      tone: marks && marks.absentPupils ? "warn" : "plain",
    },
    {
      label: "Cover",
      value: cover === null ? wait : String(cover.total),
      note: !cover || cover.total === 0 ? "No lessons need cover" : cover.open ? `${cover.open} without a teacher` : "All covered",
      href: "/admin/absences?tab=cover",
      tone: cover && cover.open ? "warn" : "plain",
    },
  ];

  return (
    <section data-guide="admin-school-today" aria-labelledby="school-today">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="school-today" className="t-section">
          The school today
        </h2>
        <span className="t-meta">So far today</span>
      </div>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-gold-light bg-gold-light lg:grid-cols-4">
        {figures.map((f) => (
          <li key={f.label} className="bg-white">
            <Link href={f.href} className="flex h-full flex-col gap-0.5 px-4 py-3.5 transition-colors hover:bg-[var(--portal-hover)]">
              <span className="text-[0.8125rem] font-medium text-ink-500">{f.label}</span>
              <span className={`text-[1.5rem] font-semibold leading-tight tabular-nums ${f.tone === "warn" ? "text-amber-900" : f.tone === "good" ? "text-forest-800" : "text-ink"}`}>{f.value}</span>
              <span className="text-xs text-ink-500">{f.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
