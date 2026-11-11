"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey, ukToday } from "@/lib/learn/ukTime";
import { effectivePeriods } from "@/lib/learn/timetable";
import { useTimetablePeriods } from "@/lib/learn/useTimetablePeriods";
import { REGISTER_RANGES, REGISTER_STATE_LABEL, needsAction, periodName, rangeDates, registerState, type RegisterRange, type RegisterState } from "@/lib/learn/registers";
import { Select } from "@/components/learn/Select";
import { Tabs } from "@/components/learn/Tabs";
import { Status, ui, type StatusKind } from "@/components/learn/ui";
import { EmptyState, LoadingState, Notice } from "@/components/learn/ui";

export type RegisterRow = {
  id: string;
  date: string;
  start: string;
  end: string;
  classId: string;
  className: string;
  marked: number;
  total: number;
  firstMarkedAt: string | null;
  absent: number;
  late: number;
};

const STATE_KIND: Record<RegisterState, StatusKind> = {
  upcoming: "pending",
  not_taken: "overdue",
  partial: "attention",
  late: "attention",
  taken: "completed",
};

type Filter = "all" | "todo" | RegisterState;

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type RawLesson = { id: string; date: string; timetable_slot_id: string; timetable_slots?: { class_id: string; start_time: string; end_time: string; classes?: { name: string } | null; timetable_runs?: { status: string } | null } | null };
const LESSON_COLS = "id, date, timetable_slot_id, timetable_slots(class_id, start_time, end_time, classes(name), timetable_runs(status))";

/**
 * Every lesson in a date range with its register's state, mine (a teacher's own and covered
 * lessons) or the whole school's. RLS decides what each person can read.
 */
async function loadRegisters(scope: "mine" | "all", from: string, to: string): Promise<RegisterRow[] | string> {
  const supabase = getSupabaseClient();
  if (!supabase) return "The portal is not connected.";
  let raw: RawLesson[] = [];
  if (scope === "mine") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: slots } = await supabase.from("timetable_slots").select("id").eq("teacher_user_id", user.id);
    const slotIds = ((slots as { id: string }[] | null) || []).map((s) => s.id);
    const parts = await Promise.all([
      ...chunk(slotIds, 150).map((ids) => supabase.from("lesson_instances").select(LESSON_COLS).in("timetable_slot_id", ids).gte("date", from).lte("date", to)),
      supabase.from("lesson_instances").select(LESSON_COLS).eq("teacher_user_id", user.id).gte("date", from).lte("date", to),
    ]);
    const seen = new Map<string, RawLesson>();
    for (const p of parts) for (const l of (p.data as unknown as RawLesson[]) || []) seen.set(l.id, l);
    raw = [...seen.values()];
  } else {
    const { data, error } = await supabase.from("lesson_instances").select(LESSON_COLS).gte("date", from).lte("date", to).limit(3000);
    if (error) return error.message;
    raw = (data as unknown as RawLesson[]) || [];
  }
  const lessons = raw
    .filter((l) => l.timetable_slots && l.timetable_slots.timetable_runs?.status === "published")
    .map((l) => {
      const t = l.timetable_slots!;
      return { id: l.id, date: l.date, start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5), classId: t.class_id, className: t.classes?.name || "Class" };
    });
  if (lessons.length === 0) return [];
  const classIds = [...new Set(lessons.map((l) => l.classId))];
  const [enrolParts, markParts] = await Promise.all([
    Promise.all(chunk(classIds, 150).map((ids) => supabase.from("enrolments").select("class_id").in("class_id", ids))),
    Promise.all(chunk(lessons.map((l) => l.id), 150).map((ids) => supabase.from("attendance_records").select("lesson_instance_id, status, marked_at").in("lesson_instance_id", ids))),
  ]);
  const size = new Map<string, number>();
  for (const p of enrolParts) for (const e of (p.data as { class_id: string }[]) || []) size.set(e.class_id, (size.get(e.class_id) || 0) + 1);
  const marks = new Map<string, { n: number; first: string | null; absent: number; late: number }>();
  for (const p of markParts)
    for (const m of (p.data as { lesson_instance_id: string; status: string; marked_at: string }[]) || []) {
      const x = marks.get(m.lesson_instance_id) || { n: 0, first: null, absent: 0, late: 0 };
      x.n++;
      if (!x.first || m.marked_at < x.first) x.first = m.marked_at;
      if (m.status === "absent") x.absent++;
      if (m.status === "late") x.late++;
      marks.set(m.lesson_instance_id, x);
    }
  return lessons
    .map((l) => {
      const m = marks.get(l.id);
      return { ...l, marked: m?.n || 0, total: size.get(l.classId) || 0, firstMarkedAt: m?.first || null, absent: m?.absent || 0, late: m?.late || 0 };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start) || a.className.localeCompare(b.className));
}

/**
 * Registers, SIMS-style (owner feedback 11 Nov 2026, item 9): one list of sessions with the
 * date, class, period and where each register stands, filtered by date range, class and state.
 * Nothing expands in place: pressing a row opens that register on its own page
 * (`<base>/register?id=`), which has a Back link to here.
 */
export function RegisterList({ scope, base }: { scope: "mine" | "all"; base: "/teach" | "/admin" }) {
  const [range, setRange] = useState<RegisterRange>(scope === "mine" ? "this_week" : "today");
  const [cls, setCls] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const periods = useTimetablePeriods();
  const today = ukToday();
  const { from, to } = rangeDates(range, today);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading while a new range loads
    setRows(null);
    loadRegisters(scope, from, to).then((r) => {
      if (!alive) return;
      if (typeof r === "string") {
        setError(r);
        setRows([]);
      } else {
        setError(null);
        setRows(r);
      }
    });
    return () => {
      alive = false;
    };
  }, [scope, from, to]);

  const withState = useMemo(() => {
    const now = new Date();
    return (rows || []).map((r) => ({ ...r, state: registerState(r, now) }));
  }, [rows]);
  const classes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) m.set(r.classId, r.className);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const inClass = withState.filter((r) => !cls || r.classId === cls);
  const count = (f: Filter) => inClass.filter((r) => f === "all" || (f === "todo" ? needsAction(r.state) : r.state === f)).length;
  const shown = inClass.filter((r) => filter === "all" || (filter === "todo" ? needsAction(r.state) : r.state === filter));
  const dayPeriods = effectivePeriods(periods);
  const lessonHref = (id: string) => `${base}/register?id=${id}`;

  // Group by date so a long range reads like a register book.
  const grouped = new Map<string, typeof shown>();
  for (const r of shown) grouped.set(r.date, [...(grouped.get(r.date) || []), r]);
  const byDate = [...grouped];

  const todo = count("todo");
  return (
    <div className="space-y-4">
      <div data-guide="registers-filters" className={ui.toolbar}>
        <Select value={range} onChange={(e) => setRange(e.target.value as RegisterRange)} aria-label="Dates" className={`${ui.select} !w-auto`}>
          {REGISTER_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" className={`${ui.select} !w-auto`}>
          <option value="">{scope === "mine" ? "All my classes" : "All classes"}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <span className="t-meta sm:ml-auto">
          {range === "today" ? formatDateKey(today, { weekday: "long", day: "numeric", month: "long" }) : `${formatDateKey(from, { day: "numeric", month: "short" })} to ${formatDateKey(to, { day: "numeric", month: "short" })}`}
        </span>
      </div>
      <Tabs
        variant="switch"
        label="Show"
        value={filter}
        onChange={setFilter}
        items={[
          { key: "all" as const, label: "All", count: count("all") },
          { key: "todo" as const, label: "To take", count: todo, countAlert: todo > 0 },
          { key: "late" as const, label: "Taken late", count: count("late") },
          { key: "taken" as const, label: "Taken", count: count("taken") },
          { key: "upcoming" as const, label: "Not due yet", count: count("upcoming") },
        ]}
      />
      {error && <Notice tone="bad">These registers could not load. Please refresh the page and try again.</Notice>}
      {rows === null ? (
        <LoadingState label="Loading registers" />
      ) : shown.length === 0 ? (
        <EmptyState title={rows.length === 0 ? "No lessons in these dates" : filter === "todo" ? "Every register here is taken" : "Nothing matches these filters"} icon="calendarCheck">
          {rows.length === 0 ? "Choose other dates, or check the published timetable." : "Try All, or other dates."}
        </EmptyState>
      ) : (
        <div data-guide="registers-list" className="overflow-hidden rounded-2xl border border-gold-light bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registers, newest first</caption>
            <thead className="hidden border-b border-gold-light text-xs text-ink-500 sm:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Lesson
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Period
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Register
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            {byDate.map(([date, list]) => (
              <tbody key={date} className="divide-y divide-gold-light/60 border-b border-gold-light/60 last:border-b-0">
                <tr className="bg-[var(--portal-sunken)]">
                  <th scope="rowgroup" colSpan={4} className="px-4 py-1.5 text-xs font-semibold text-ink-700">
                    {formatDateKey(date, { weekday: "long", day: "numeric", month: "long" })}
                    {date === today ? " (today)" : ""}
                  </th>
                </tr>
                {list.map((r) => {
                  const period = periodName(r.start, dayPeriods);
                  return (
                    <tr key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-[var(--portal-hover)] sm:table-row sm:p-0">
                      <td className="min-w-0 flex-1 sm:px-4 sm:py-2.5">
                        <Link href={lessonHref(r.id)} className="font-medium text-ink hover:text-forest-700 hover:underline">
                          {r.className}
                        </Link>
                        <span className="block text-xs text-ink-500 sm:hidden">
                          {period ? `${period}, ` : ""}
                          {r.start} to {r.end}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap text-ink-700 sm:table-cell sm:px-4 sm:py-2.5">
                        {period ? <span className="block">{period}</span> : null}
                        <span className={period ? "text-xs text-ink-500" : ""}>
                          {r.start} to {r.end}
                        </span>
                      </td>
                      <td className="sm:px-4 sm:py-2.5">
                        <Status kind={STATE_KIND[r.state]}>{REGISTER_STATE_LABEL[r.state]}</Status>
                        {r.marked > 0 && (
                          <span className="block text-xs text-ink-500">
                            {r.marked} of {r.total} marked
                            {r.absent ? `, ${r.absent} absent` : ""}
                            {r.late ? `, ${r.late} late` : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-right sm:px-4 sm:py-2.5">
                        <Link href={lessonHref(r.id)} className={`${needsAction(r.state) ? ui.btnPrimary : ui.btnSecondary} ${ui.sm}`} aria-label={`${needsAction(r.state) ? "Take" : "Open"} the register for ${r.className}, ${formatDateKey(r.date, { weekday: "long", day: "numeric", month: "long" })} at ${r.start}`}>
                          {needsAction(r.state) ? "Take register" : "Open"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
