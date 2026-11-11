"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo, ukToday } from "@/lib/learn/ukTime";
import type { Status } from "@/components/learn/attendance/Register";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { useClassRoster } from "@/components/learn/class/PupilPicker";

export type ClassLesson = { id: string; date: string; start: string | null };
export type ClassMark = { lesson_instance_id: string; child_id: string; status: Status };
type Lesson = ClassLesson;
type Mark = ClassMark;

export const LOOKBACK_DAYS = 70;
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Present and late (and the older "not engaged" mark) count as attended; authorised and technical absences are left out (as the Attendance page does). */
export function rateOf(marks: Mark[]): number | null {
  const attended = marks.filter((m) => m.status === "present" || m.status === "late" || m.status === "not_engaged").length;
  const absent = marks.filter((m) => m.status === "absent").length;
  return attended + absent === 0 ? null : Math.round((attended / (attended + absent)) * 100);
}

/** This class's lessons up to today (last ten weeks) and their register marks. */
export async function loadClassAttendance(classId: string): Promise<{ lessons: Lesson[]; marks: Mark[] } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const today = ukToday();
  const { data: slots } = await supabase.from("timetable_slots").select("id").eq("class_id", classId);
  const slotIds = ((slots as { id: string }[] | null) || []).map((s) => s.id);
  if (!slotIds.length) return { lessons: [], marks: [] };
  const { data } = await supabase
    .from("lesson_instances")
    .select("id, date, timetable_slots(start_time)")
    .in("timetable_slot_id", slotIds)
    .gte("date", ukDaysAgo(LOOKBACK_DAYS))
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(80);
  const lessons = ((data as unknown as { id: string; date: string; timetable_slots?: { start_time: string } | null }[]) || []).map((l) => ({ id: l.id, date: l.date, start: l.timetable_slots?.start_time?.slice(0, 5) || null }));
  if (!lessons.length) return { lessons, marks: [] };
  const { data: m } = await supabase.from("attendance_records").select("lesson_instance_id, child_id, status").in("lesson_instance_id", lessons.map((l) => l.id));
  return { lessons, marks: (m as unknown as Mark[]) || [] };
}

/**
 * The class's register, Teams-style: this class's lessons from the last ten
 * weeks with how much of each register is taken (open one to take or fix
 * it, using the same one-tap Register as Today), and each pupil's
 * attendance in this class. School-wide reports stay on the Attendance page.
 */
export function ClassAttendanceTab({ classId, area }: { classId: string; area: string }) {
  const roster = useClassRoster(classId);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const r = await loadClassAttendance(classId);
    if (!r) return;
    setLessons(r.lessons);
    setMarks(r.marks);
  }, [classId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const byLesson = useMemo(() => {
    const m = new Map<string, Mark[]>();
    for (const r of marks) m.set(r.lesson_instance_id, [...(m.get(r.lesson_instance_id) || []), r]);
    return m;
  }, [marks]);

  const pupils = useMemo(
    () =>
      (roster || [])
        .map((p) => {
          const mine = marks.filter((m) => m.child_id === p.id);
          return { ...p, rate: rateOf(mine), absent: mine.filter((m) => m.status === "absent").length, authorised: mine.filter((m) => m.status === "excused").length, technical: mine.filter((m) => m.status === "technical").length, late: mine.filter((m) => m.status === "late").length };
        })
        .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name)),
    [roster, marks],
  );

  if (lessons === null || roster === null) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;

  const total = roster.length;
  const taken = lessons.filter((l) => (byLesson.get(l.id)?.length || 0) > 0).length;
  const overall = rateOf(marks);
  const shownLessons = showAll ? lessons : lessons.slice(0, 8);
  const absencesHref = area === "/admin" ? "/admin/absences" : "/teach/absences";
  // Each register opens on its own page with a Back link (owner, 11 Nov 2026), never expanded here.
  const registerBase = area === "/admin" ? "/admin" : "/teach";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Attendance" value={overall === null ? "–" : `${overall}%`} sub={`Last ${LOOKBACK_DAYS / 7} weeks, this class`} />
        <Tile label="Registers taken" value={`${taken} of ${lessons.length}`} sub={lessons.length - taken > 0 ? `${lessons.length - taken} still to take` : "All up to date"} alert={lessons.length - taken > 0} />
        <Tile label="Unauthorised absences" value={String(marks.filter((m) => m.status === "absent").length)} sub={`${marks.filter((m) => m.status === "excused").length} authorised, ${marks.filter((m) => m.status === "technical").length} technical, ${marks.filter((m) => m.status === "late").length} late`} />
      </div>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Lessons</h2>
          <Link href={absencesHref} className="text-sm text-teal-800 hover:underline">
            Reported absences
          </Link>
        </div>
        {lessons.length === 0 ? (
          <p className="p-5 text-sm text-ink/65">No lessons for this class in the last {LOOKBACK_DAYS / 7} weeks.</p>
        ) : (
          <ul className="divide-y divide-gold-light/60">
            {shownLessons.map((l) => {
              const n = byLesson.get(l.id)?.length || 0;
              return (
                <li key={l.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-ink">{fmtDay(l.date)}</span>
                      {l.start && <span className="text-ink/65"> · {l.start}</span>}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${n === 0 ? "bg-amber-50 text-amber-900 ring-amber-600/20" : n < total ? "bg-cream text-ink/75 ring-gold-light" : "bg-green-50 text-green-800 ring-green-600/20"}`}>
                      {n === 0 ? "Not taken" : `${n} of ${total} marked`}
                    </span>
                    <Link href={`${registerBase}/register?id=${l.id}&from=class`} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
                      {n === 0 ? "Take register" : "Open register"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lessons.length > 8 && (
          <div className="border-t border-gold-light/60 px-5 py-2.5">
            <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm font-medium text-teal-800 hover:underline">
              {showAll ? "Show fewer" : `Show all ${lessons.length} lessons`}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="border-b border-gold-light px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Pupils</h2>
          <p className="text-xs text-ink/65">Lowest attendance first.</p>
        </div>
        {pupils.length === 0 ? (
          <p className="p-5 text-sm text-ink/65">No pupils are enrolled in this class yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-gold-light text-xs uppercase tracking-wide text-ink/65">
                  <th className="px-5 py-2 font-semibold">Pupil</th>
                  <th className="px-5 py-2 text-right font-semibold">Attendance</th>
                  <th className="px-5 py-2 text-right font-semibold" title="Authorised absence">Authorised</th>
                  <th className="px-5 py-2 text-right font-semibold" title="Unauthorised absence">Unauthorised</th>
                  <th className="px-5 py-2 text-right font-semibold" title="Technical absence: could not connect">Technical</th>
                  <th className="px-5 py-2 text-right font-semibold">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/60">
                {pupils.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 font-medium text-ink">
                      <PupilLink id={p.id} name={p.name} />
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${p.rate !== null && p.rate < 90 ? "text-red-700" : "text-ink"}`}>{p.rate === null ? "–" : `${p.rate}%`}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink/80">{p.authorised}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink/80">{p.absent}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink/80">{p.technical}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink/80">{p.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function Tile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <p className="text-sm font-medium text-ink/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${alert ? "text-amber-800" : "text-ink/65"}`}>{sub}</p>}
    </div>
  );
}
