"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { Register } from "@/components/learn/attendance/Register";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { classBannerStyle } from "@/lib/learn/classes";

type Status = "present" | "late" | "absent" | "excused";
const STATUSES: { value: Status; label: string; dot: string }[] = [
  { value: "present", label: "Present", dot: "bg-green-600" },
  { value: "late", label: "Late", dot: "bg-amber-500" },
  { value: "absent", label: "Absent", dot: "bg-red-600" },
  { value: "excused", label: "Excused", dot: "bg-slate-500" },
];

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "7 days", days: 6 },
  { key: "14", label: "14 days", days: 13 },
  { key: "30", label: "30 days", days: 29 },
  { key: "90", label: "90 days", days: 89 },
];

type RawRow = {
  id: string;
  status: Status;
  marked_at: string;
  child_id: string;
  children?: { name: string } | null;
  lesson_instances?: {
    date: string;
    timetable_slots?: { class_id: string; classes?: { name: string; year_group_id: string | null } | null } | null;
  } | null;
};

type Row = {
  id: string;
  status: Status;
  markedAt: string;
  childId: string;
  child: string;
  date: string;
  classId: string;
  className: string;
  yearGroupId: string;
};

type YearGroup = { id: string; name: string; sort_order: number };
type ClassOpt = { id: string; name: string; year_group_id: string | null };

function dateKeyDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateKey(d);
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

/** Attendance rate counts present + late as attended; excused is left out of
 * the denominator because the absence is authorised. */
function rate(c: Counts): string {
  return pct(c.present + c.late, c.present + c.late + c.absent);
}

type Counts = Record<Status, number>;
const zero = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });

function toCsv(rows: Row[]): string {
  const header = ["Date", "Class", "Student", "Status", "Marked at"];
  const lines = rows.map((r) =>
    [r.date, r.className, r.child, r.status, new Date(r.markedAt).toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

const fieldCls = "w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

function StatTile({ label, value, sub, dot }: { label: string; value: string | number; sub?: string; dot?: string }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink/60">
        {dot && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/65">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light/60 px-4 py-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-ink/65">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const th = "whitespace-nowrap border-b border-gold-light/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/55";
const td = "border-b border-gold-light/20 px-3 py-2";

function ReportsContent() {
  const canExport = useLearnPermission("can_export_data");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);

  const [preset, setPreset] = useState<string>("14");
  const [from, setFrom] = useState(dateKeyDaysAgo(13));
  const [to, setTo] = useState(dateKeyDaysAgo(0));
  const [yearGroupId, setYearGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const [{ data: yg }, { data: cl }] = await Promise.all([
        supabase.from("year_groups").select("id, name, sort_order").order("sort_order"),
        supabase.from("classes").select("id, name, year_group_id").order("name"),
      ]);
      setYearGroups((yg as unknown as YearGroup[]) || []);
      setClasses((cl as unknown as ClassOpt[]) || []);
    })();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !from || !to || from > to) return;
    let cancelled = false;
    (async () => {
      setRows(null);
      setError(null);
      const out: RawRow[] = [];
      let hitCap = false;
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
        const { data, error: err } = await supabase
          .from("attendance_records")
          .select("id, status, marked_at, child_id, children(name), lesson_instances!inner(date, timetable_slots(class_id, classes(name, year_group_id)))")
          .gte("lesson_instances.date", from)
          .lte("lesson_instances.date", to)
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);
        if (cancelled) return;
        if (err) {
          setError(err.message);
          break;
        }
        const page = (data as unknown as RawRow[]) || [];
        out.push(...page);
        if (page.length < PAGE_SIZE) break;
        if (offset + PAGE_SIZE >= MAX_ROWS) hitCap = true;
      }
      if (cancelled) return;
      const mapped: Row[] = out.map((r) => ({
        id: r.id,
        status: r.status,
        markedAt: r.marked_at,
        childId: r.child_id,
        child: r.children?.name || "Unknown student",
        date: r.lesson_instances?.date || "",
        classId: r.lesson_instances?.timetable_slots?.class_id || "",
        className: r.lesson_instances?.timetable_slots?.classes?.name || "Unknown class",
        yearGroupId: r.lesson_instances?.timetable_slots?.classes?.year_group_id || "",
      }));
      mapped.sort((a, b) => b.date.localeCompare(a.date) || a.className.localeCompare(b.className) || a.child.localeCompare(b.child));
      setRows(mapped);
      setTruncated(hitCap);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const classOptions = useMemo(() => classes.filter((c) => !yearGroupId || c.year_group_id === yearGroupId), [classes, yearGroupId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        (!yearGroupId || r.yearGroupId === yearGroupId) &&
        (!classId || r.classId === classId) &&
        (!status || r.status === status) &&
        (!q || r.child.toLowerCase().includes(q)),
    );
  }, [rows, yearGroupId, classId, status, search]);

  const totals = useMemo(() => {
    const c = zero();
    filtered.forEach((r) => (c[r.status] += 1));
    return c;
  }, [filtered]);

  const byClass = useMemo(() => {
    const m = new Map<string, { name: string; counts: Counts; lessons: Set<string> }>();
    filtered.forEach((r) => {
      const key = r.classId || r.className;
      const e = m.get(key) || { name: r.className, counts: zero(), lessons: new Set<string>() };
      e.counts[r.status] += 1;
      e.lessons.add(`${r.date}`);
      m.set(key, e);
    });
    return [...m.entries()].map(([id, e]) => ({ id, name: e.name, counts: e.counts, lessons: e.lessons.size })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const byStudent = useMemo(() => {
    const m = new Map<string, { name: string; counts: Counts }>();
    filtered.forEach((r) => {
      const e = m.get(r.childId) || { name: r.child, counts: zero() };
      e.counts[r.status] += 1;
      m.set(r.childId, e);
    });
    return [...m.entries()]
      .map(([id, e]) => ({ id, name: e.name, counts: e.counts }))
      .sort((a, b) => b.counts.absent - a.counts.absent || a.name.localeCompare(b.name));
  }, [filtered]);

  const filtersActive = Boolean(yearGroupId || classId || status || search.trim());

  const applyPreset = (key: string, days: number) => {
    setPreset(key);
    setFrom(dateKeyDaysAgo(days));
    setTo(dateKeyDaysAgo(0));
  };

  const reset = () => {
    setYearGroupId("");
    setClassId("");
    setStatus("");
    setSearch("");
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const badRange = Boolean(from && to && from > to);
  const total = filtered.length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Attendance" }]}
        title="Attendance"
        subtitle="Whole-school register, filtered by lesson date."
        actions={
          canExport && filtered.length > 0 ? (
            <button type="button" onClick={exportCsv} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-semibold text-ink/80 transition-colors hover:bg-cream">
              Export CSV ({filtered.length})
            </button>
          ) : undefined
        }
      />
      {!canExport && <p className="-mt-3 mb-4 text-xs text-ink/65">Exporting requires the &quot;Can export data&quot; permission. Ask a Headteacher to grant it.</p>}

      <div className="space-y-5">
        <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key, p.days)}
                aria-pressed={preset === p.key}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${preset === p.key ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink/65">
              {from} to {to}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs font-medium text-ink/60">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className={`mt-1 ${fieldCls}`}
              />
            </label>
            <label className="text-xs font-medium text-ink/60">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className={`mt-1 ${fieldCls}`}
              />
            </label>
            <label className="text-xs font-medium text-ink/60">
              Year group
              <select
                value={yearGroupId}
                onChange={(e) => {
                  setYearGroupId(e.target.value);
                  setClassId("");
                }}
                className={`mt-1 ${fieldCls}`}
              >
                <option value="">All year groups</option>
                {yearGroups.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink/60">
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`mt-1 ${fieldCls}`}>
                <option value="">{yearGroupId ? "All classes in year group" : "All classes"}</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink/60">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} className={`mt-1 ${fieldCls}`}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-ink/60">
              Student
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name" className={`mt-1 ${fieldCls}`} />
            </label>
          </div>
          {filtersActive && (
            <button type="button" onClick={reset} className="text-sm font-medium text-teal-700 hover:underline">
              Clear filters
            </button>
          )}
          {badRange && <p className="text-sm text-red-700">The start date must be on or before the end date.</p>}
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load attendance: {error}</p>}
        {rows === null && !error && !badRange && <p className="rounded-2xl border border-gold-light bg-white p-6 text-sm text-ink/60">Loading attendance…</p>}
        {truncated && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Showing the first {MAX_ROWS.toLocaleString()} records for this date range. Narrow the dates to see everything.
          </p>
        )}

        {rows !== null && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatTile label="Attendance rate" value={rate(totals)} sub={`${total} record${total === 1 ? "" : "s"}`} />
              {STATUSES.map((s) => (
                <StatTile key={s.value} label={s.label} value={totals[s.value]} dot={s.dot} />
              ))}
            </div>

            {total === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold-light bg-white p-10 text-center">
                <p className="font-medium text-ink">No attendance records match</p>
                <p className="mt-1 text-sm text-ink/60">{filtersActive ? "Try clearing a filter or widening the date range." : "No registers were marked in this date range."}</p>
                {filtersActive && (
                  <button type="button" onClick={reset} className="mt-3 rounded-lg border border-gold-light px-4 py-2 text-sm font-semibold text-ink/80 hover:bg-cream">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="By class" hint="Lessons = days with a marked register. Click a class to filter.">
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Class</th>
                            <th className={`${th} text-right`}>Lessons</th>
                            <th className={`${th} text-right`}>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byClass.map((c) => (
                            <tr key={c.id} className="hover:bg-cream/50">
                              <td className={td}>
                                <button type="button" onClick={() => setClassId(classes.some((x) => x.id === c.id) ? c.id : "")} className="text-left font-medium text-ink hover:text-teal-700 hover:underline">
                                  {c.name}
                                </button>
                              </td>
                              <td className={`${td} text-right tabular-nums text-ink/70`}>{c.lessons}</td>
                              <td className={`${td} text-right font-semibold tabular-nums text-ink`}>{rate(c.counts)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>

                  <Section title="By student" hint="Most absences first. Click a student to filter.">
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Student</th>
                            <th className={`${th} text-right`}>P</th>
                            <th className={`${th} text-right`}>L</th>
                            <th className={`${th} text-right`}>A</th>
                            <th className={`${th} text-right`}>E</th>
                            <th className={`${th} text-right`}>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byStudent.map((s) => (
                            <tr key={s.id} className="hover:bg-cream/50">
                              <td className={td}>
                                <button type="button" onClick={() => setSearch(s.name)} className="text-left font-medium text-ink hover:text-teal-700 hover:underline">
                                  {s.name}
                                </button>
                              </td>
                              <td className={`${td} text-right tabular-nums text-ink/70`}>{s.counts.present}</td>
                              <td className={`${td} text-right tabular-nums text-ink/70`}>{s.counts.late}</td>
                              <td className={`${td} text-right tabular-nums ${s.counts.absent > 0 ? "font-medium text-red-700" : "text-ink/70"}`}>{s.counts.absent}</td>
                              <td className={`${td} text-right tabular-nums text-ink/70`}>{s.counts.excused}</td>
                              <td className={`${td} text-right font-semibold tabular-nums text-ink`}>{rate(s.counts)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="px-4 py-2 text-xs text-ink/65">P present, L late, A absent, E excused. Rate = (present + late) / (present + late + absent); excused is not counted against attendance.</p>
                  </Section>
                </div>

                <Section title="Register" hint={`${total} record${total === 1 ? "" : "s"}, newest lesson first.`}>
                  <div className="max-h-[32rem] overflow-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr>
                          <th className={th}>Date</th>
                          <th className={th}>Class</th>
                          <th className={th}>Student</th>
                          <th className={th}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 1000).map((r) => {
                          const s = STATUSES.find((x) => x.value === r.status);
                          return (
                            <tr key={r.id}>
                              <td className={`${td} whitespace-nowrap text-ink/70`}>{r.date}</td>
                              <td className={`${td} text-ink/70`}>{r.className}</td>
                              <td className={`${td} font-medium text-ink`}>{r.child}</td>
                              <td className={td}>
                                <span className="inline-flex items-center gap-1.5 text-ink/80">
                                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s?.dot || "bg-ink/30"}`} />
                                  {s?.label || r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length > 1000 && <p className="px-4 py-2 text-xs text-ink/65">Showing the first 1,000 rows. Export CSV includes all {filtered.length.toLocaleString()}.</p>}
                </Section>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

type DayLesson = { id: string; classId: string; className: string; start: string; end: string };
type RawDayLesson = {
  id: string;
  timetable_slots?: { class_id: string; start_time: string; end_time: string; classes?: { name: string } | null; timetable_runs?: { status: string } | null } | null;
};

function shiftDate(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function DayLessonCard({ lesson }: { lesson: DayLesson }) {
  const [progress, setProgress] = useState<{ taken: number; total: number } | null>(null);
  const [open, setOpen] = useState(true);
  const onProgress = useCallback((taken: number, total: number) => setProgress({ taken, total }), []);
  const done = progress !== null && progress.total > 0 && progress.taken >= progress.total;
  const partial = progress !== null && progress.taken > 0 && !done;
  return (
    <section className="overflow-hidden rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="h-10 w-10 shrink-0 rounded-xl" style={classBannerStyle(lesson.classId)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink/60">
            {lesson.start}–{lesson.end}
          </p>
          <Link href={`/admin/class?id=${lesson.classId}`} className="block truncate text-base font-semibold text-ink hover:text-teal-700">
            {lesson.className}
          </Link>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${done ? "bg-green-100 text-green-800" : partial ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"}`}
        >
          {done ? "Register taken" : partial ? `Register part taken (${progress?.taken}/${progress?.total})` : "Register not taken"}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-cream">
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="border-t border-gold-light">
          <Register lessonId={lesson.id} classId={lesson.classId} onProgress={onProgress} />
        </div>
      )}
    </section>
  );
}

function TakeRegister() {
  const [date, setDate] = useState(localDateKey(new Date()));
  const [lessons, setLessons] = useState<DayLesson[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, timetable_slots(class_id, start_time, end_time, classes(name), timetable_runs(status))")
        .eq("date", date);
      if (cancelled) return;
      const rows = ((data as unknown as RawDayLesson[]) || [])
        .filter((l) => l.timetable_slots && l.timetable_slots.timetable_runs?.status === "published")
        .map((l) => {
          const t = l.timetable_slots!;
          return { id: l.id, classId: t.class_id, className: t.classes?.name || "Class", start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5) };
        })
        .sort((a, b) => a.start.localeCompare(b.start) || a.className.localeCompare(b.className));
      setLessons(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const go = (d: string) => {
    if (!d) return;
    setLessons(null);
    setDate(d);
  };
  const label = new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Attendance" }]} title="Take register" subtitle="Take or correct the register for any lesson in the school." />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-gold-light bg-white p-3">
        <button type="button" onClick={() => go(shiftDate(date, -1))} className="rounded-lg border border-gold-light px-3 py-2 text-sm font-medium text-ink/80 hover:bg-cream" aria-label="Previous day">
          ‹ Prev
        </button>
        <input type="date" value={date} onChange={(e) => go(e.target.value)} className={`${fieldCls} !w-auto`} aria-label="Register date" />
        <button type="button" onClick={() => go(shiftDate(date, 1))} className="rounded-lg border border-gold-light px-3 py-2 text-sm font-medium text-ink/80 hover:bg-cream" aria-label="Next day">
          Next ›
        </button>
        <button type="button" onClick={() => go(localDateKey(new Date()))} className="rounded-lg border border-gold-light px-3 py-2 text-sm font-medium text-teal-700 hover:bg-cream">
          Today
        </button>
        <span className="w-full text-sm text-ink/60 sm:ml-auto sm:w-auto">{label}</span>
      </div>
      {lessons === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/60">No lessons on this day.</div>
      ) : (
        <div className="space-y-4">
          {lessons.map((l) => (
            <DayLessonCard key={l.id} lesson={l} />
          ))}
        </div>
      )}
    </>
  );
}

function AttendanceContent() {
  const [tab, setTab] = useState<"register" | "reports">("register");
  const tabs: { key: "register" | "reports"; label: string }[] = [
    { key: "register", label: "Take register" },
    { key: "reports", label: "Reports & filters" },
  ];
  return (
    <>
      <div role="tablist" aria-label="Attendance sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-gold-light">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-[3px] px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? "border-teal-700 text-ink" : "border-transparent text-ink/60 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "register" ? <TakeRegister /> : <ReportsContent />}
    </>
  );
}

export default function AdminAttendancePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AttendanceContent />
      </LearnGate>
    </section>
  );
}
