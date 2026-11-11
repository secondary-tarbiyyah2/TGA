"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo, ukToday } from "@/lib/learn/ukTime";
import type { Status } from "@/components/learn/attendance/Register";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { useClassRoster } from "@/components/learn/class/PupilPicker";
import { Avatar, Tag, ui } from "@/components/learn/ui";

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

  // The heat grid: the last ten lessons, oldest on the left.
  const gridLessons = lessons.slice(0, 10).reverse();
  const markOf = (lessonId: string, childId: string) => byLesson.get(lessonId)?.find((m) => m.child_id === childId)?.status;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Attendance" value={overall === null ? "–" : `${overall}%`} sub={`Last ${LOOKBACK_DAYS / 7} weeks, this class`} />
        <Tile label="Registers taken" value={`${taken} of ${lessons.length}`} sub={lessons.length - taken > 0 ? `${lessons.length - taken} still to take` : "All up to date"} alert={lessons.length - taken > 0} />
        <Tile label="Unauthorised absences" value={String(marks.filter((m) => m.status === "absent").length)} sub={`${marks.filter((m) => m.status === "excused").length} authorised, ${marks.filter((m) => m.status === "technical").length} technical, ${marks.filter((m) => m.status === "late").length} late`} />
      </div>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-2 pt-4">
          <div>
            <h2 className="t-section">Pupils</h2>
            <p className="t-meta">The last {gridLessons.length} lesson{gridLessons.length === 1 ? "" : "s"}, oldest first. Lowest attendance at the top.</p>
          </div>
          <HeatLegend />
        </div>
        {pupils.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-ink-500">No pupils are enrolled in this class yet.</p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <table className="portal-heat-table w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold text-ink-500">
                  <th scope="col" className="border-b border-[var(--portal-line)] px-5 py-2.5 font-semibold">
                    Pupil
                  </th>
                  {gridLessons.map((l) => (
                    <th key={l.id} scope="col" className="whitespace-nowrap border-b border-[var(--portal-line)] px-1 py-2.5 text-center font-semibold tabular-nums">
                      {shortDay(l.date)}
                    </th>
                  ))}
                  <th scope="col" className="border-b border-[var(--portal-line)] px-4 py-2.5 text-right font-semibold">
                    Rate
                  </th>
                  <th scope="col" className="border-b border-[var(--portal-line)] px-3 py-2.5 text-right font-semibold" title="Authorised absence">
                    Auth.
                  </th>
                  <th scope="col" className="border-b border-[var(--portal-line)] px-3 py-2.5 text-right font-semibold" title="Unauthorised absence">
                    Unauth.
                  </th>
                  <th scope="col" className="border-b border-[var(--portal-line)] px-3 py-2.5 text-right font-semibold" title="Technical absence: could not connect">
                    Tech.
                  </th>
                  <th scope="col" className="border-b border-[var(--portal-line)] px-5 py-2.5 text-right font-semibold">
                    Late
                  </th>
                </tr>
              </thead>
              <tbody>
                {pupils.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--portal-row-hover)]">
                    <th scope="row" className="whitespace-nowrap border-b border-[var(--portal-line-soft)] px-5 py-2 text-left font-semibold text-ink">
                      <span className="inline-flex items-center gap-2.5">
                        <Avatar name={p.name} seed={p.id} size={30} />
                        <PupilLink id={p.id} name={p.name} />
                      </span>
                    </th>
                    {gridLessons.map((l) => {
                      const st = markOf(l.id, p.id);
                      const h = HEAT[st || "none"] || HEAT.none;
                      return (
                        <td key={l.id} className="border-b border-[var(--portal-line-soft)] px-1 py-1.5 text-center">
                          <span className={`portal-heat ${h.cls}`} title={`${fmtDay(l.date)}: ${h.label}`}>
                            <span aria-hidden="true">{h.code}</span>
                            <span className="sr-only">{h.label}</span>
                          </span>
                        </td>
                      );
                    })}
                    <td className={`border-b border-[var(--portal-line-soft)] px-4 py-2 text-right font-bold tabular-nums ${p.rate !== null && p.rate < 90 ? "text-red-700" : "text-ink"}`}>{p.rate === null ? "–" : `${p.rate}%`}</td>
                    <td className="border-b border-[var(--portal-line-soft)] px-3 py-2 text-right tabular-nums text-ink-700">{p.authorised}</td>
                    <td className="border-b border-[var(--portal-line-soft)] px-3 py-2 text-right tabular-nums text-ink-700">{p.absent}</td>
                    <td className="border-b border-[var(--portal-line-soft)] px-3 py-2 text-right tabular-nums text-ink-700">{p.technical}</td>
                    <td className="border-b border-[var(--portal-line-soft)] px-5 py-2 text-right tabular-nums text-ink-700">{p.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--portal-line-soft)] px-5 py-4">
          <h2 className="t-section">Registers</h2>
          <Link href={absencesHref} className={`${ui.btnSecondary} ${ui.sm}`}>
            Reported absences
          </Link>
        </div>
        {lessons.length === 0 ? (
          <p className="p-5 text-sm text-ink-500">No lessons for this class in the last {LOOKBACK_DAYS / 7} weeks.</p>
        ) : (
          <ul className="divide-y divide-[var(--portal-line-soft)]">
            {shownLessons.map((l) => {
              const n = byLesson.get(l.id)?.length || 0;
              return (
                <li key={l.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold text-ink">{fmtDay(l.date)}</span>
                      {l.start && <span className="text-ink-500"> · {l.start}</span>}
                    </span>
                    <Tag tone={n === 0 ? "warn" : n < total ? "neutral" : "good"}>{n === 0 ? "Not taken" : `${n} of ${total} marked`}</Tag>
                    <Link href={`${registerBase}/register?id=${l.id}&from=class`} className={`${n === 0 ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`}>
                      {n === 0 ? "Take register" : "Open register"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lessons.length > 8 && (
          <div className="border-t border-[var(--portal-line-soft)] px-5 py-2.5">
            <button type="button" onClick={() => setShowAll((s) => !s)} className={ui.btnLink}>
              {showAll ? "Show fewer" : `Show all ${lessons.length} lessons`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

const shortDay = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  return `${x.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2)} ${x.getDate()}`;
};

/** One register mark as a heat cell: its code, colour and name (the name is read out). */
const HEAT: Record<string, { cls: string; code: string; label: string }> = {
  present: { cls: "portal-heat--present", code: "", label: "Present" },
  late: { cls: "portal-heat--late", code: "L", label: "Late" },
  excused: { cls: "portal-heat--authorised", code: "A", label: "Authorised absence" },
  absent: { cls: "portal-heat--absent", code: "U", label: "Unauthorised absence" },
  technical: { cls: "portal-heat--technical", code: "T", label: "Technical absence" },
  not_engaged: { cls: "", code: "N", label: "Not engaged" },
  none: { cls: "portal-heat--none", code: "", label: "Not marked" },
};

function HeatLegend() {
  const items = ["present", "late", "excused", "absent", "technical"] as const;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500" aria-label="Key">
      {items.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`portal-heat ${HEAT[k].cls} !h-3 !w-3 !rounded-[4px]`} />
          {HEAT[k].label}
        </li>
      ))}
    </ul>
  );
}

export function Tile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-5">
      <p className="text-[0.8125rem] font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">{value}</p>
      {sub && <p className={`mt-1 text-xs ${alert ? "font-medium text-amber-800" : "text-ink-500"}`}>{sub}</p>}
    </div>
  );
}
