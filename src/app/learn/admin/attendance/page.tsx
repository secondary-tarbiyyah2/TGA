"use client";

import { Loading } from "@/components/learn/kit";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { Register } from "@/components/learn/attendance/Register";
import { PageHeader } from "@/components/learn/PageHeader";
import { DataTable } from "@/components/learn/DataTable";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey, shiftDateKey, ukDaysAgo, ukToday } from "@/lib/learn/ukTime";
import { saveCsv, toCsv as buildCsv } from "@/lib/learn/csv";
import { classBannerStyle } from "@/lib/learn/classes";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { Button, StatusChip, btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type Status = "present" | "late" | "absent" | "excused" | "not_engaged" | "technical";
const STATUSES: { value: Status; label: string; dot: string }[] = [
  { value: "present", label: "Present", dot: "bg-green-600" },
  { value: "late", label: "Late", dot: "bg-amber-500" },
  { value: "absent", label: "Absent", dot: "bg-red-600" },
  { value: "excused", label: "Excused", dot: "bg-slate-500" },
  { value: "not_engaged", label: "Not engaged", dot: "bg-amber-800" },
  { value: "technical", label: "Couldn't connect", dot: "bg-slate-300" },
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
  lesson_instance_id: string;
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
  lessonId: string;
  date: string;
  classId: string;
  className: string;
  yearGroupId: string;
};

type YearGroup = { id: string; name: string; sort_order: number };
type ClassOpt = { id: string; name: string; year_group_id: string | null };

// Date ranges are UK school days, whatever zone the browser is in.
const dateKeyDaysAgo = ukDaysAgo;

function pct(part: number, whole: number): string {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

/** Attendance rate counts present, late and "present but not engaged" as
 * attended; excused and couldn't-connect are left out of the denominator
 * (authorised, and recorded separately, per the Attendance Policy). */
function rate(c: Counts): string {
  const attended = c.present + c.late + c.not_engaged;
  return pct(attended, attended + c.absent);
}

/** The same rate as a number for sorting (-1 when there is nothing to rate),
 * so "100%" sorts above "95%" instead of being compared as text. */
function rateValue(c: Counts): number {
  const attended = c.present + c.late + c.not_engaged;
  return attended + c.absent === 0 ? -1 : attended / (attended + c.absent);
}

type Counts = Record<Status, number>;
const zero = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0, not_engaged: 0, technical: 0 });

function toCsv(rows: Row[]): string {
  return buildCsv(
    ["Date", "Class", "Student", "Status", "Marked at"],
    rows.map((r) => [r.date, r.className, r.child, STATUSES.find((s) => s.value === r.status)?.label || r.status, new Date(r.markedAt).toISOString()]),
  );
}

const fieldCls = ui.input;

function StatTile({ label, value, sub, dot }: { label: string; value: string | number; sub?: string; dot?: string }) {
  return (
    <div className="rounded-2xl border border-gold-light bg-white p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink/65">
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

const th = "whitespace-nowrap border-b border-gold-light/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/65";
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
          .select("id, status, marked_at, child_id, lesson_instance_id, children(name), lesson_instances!inner(date, timetable_slots(class_id, classes(name, year_group_id)))")
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
        lessonId: r.lesson_instance_id,
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
      // Count lessons, not days: a class can have two lessons on one day.
      e.lessons.add(r.lessonId);
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
    saveCsv(`attendance-${from}-to-${to}.csv`, toCsv(filtered));
  };

  const badRange = Boolean(from && to && from > to);
  const total = filtered.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/65">Whole-school register, filtered by lesson date (UK).</p>
        {canExport ? (
          filtered.length > 0 && (
            <Button icon="download" onClick={exportCsv}>
              Export CSV ({filtered.length})
            </Button>
          )
        ) : (
          <p className="text-xs text-ink/65">Exporting needs the &quot;Can export data&quot; permission.</p>
        )}
      </div>

      <div className="space-y-5">
        <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key, p.days)}
                aria-pressed={preset === p.key}
                className={preset === p.key ? ui.chipOn : ui.chip}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink/65">
              {from && to ? `${formatDateKey(from)} to ${formatDateKey(to)}` : ""}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs font-medium text-ink/65">
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
            <label className="text-xs font-medium text-ink/65">
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
            <label className="text-xs font-medium text-ink/65">
              Year group
              <Select
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
              </Select>
            </label>
            <label className="text-xs font-medium text-ink/65">
              Class
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} className={`mt-1 ${fieldCls}`}>
                <option value="">{yearGroupId ? "All classes in year group" : "All classes"}</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium text-ink/65">
              Status
              <Select value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} className={`mt-1 ${fieldCls}`}>
                <option value="">Any status</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium text-ink/65">
              Student
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name" className={`mt-1 ${fieldCls}`} />
            </label>
          </div>
          {filtersActive && (
            <button type="button" onClick={reset} className={ui.btnLink}>
              Clear filters
            </button>
          )}
          {badRange && <p className="text-sm text-red-700">The start date must be on or before the end date.</p>}
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load attendance just now. Please refresh the page or try a shorter date range.</p>}
        {rows === null && !error && !badRange && <Loading label="Loading attendance…" />}
        {truncated && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Showing the first {MAX_ROWS.toLocaleString()} records for this date range. Narrow the dates to see everything.
          </p>
        )}

        {rows !== null && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <StatTile label="Attendance rate" value={rate(totals)} sub={`${total} record${total === 1 ? "" : "s"}`} />
              {STATUSES.map((s) => (
                <StatTile key={s.value} label={s.label} value={totals[s.value]} dot={s.dot} />
              ))}
            </div>

            {total === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold-light bg-white p-10 text-center">
                <p className="font-medium text-ink">No attendance records match</p>
                <p className="mt-1 text-sm text-ink/65">{filtersActive ? "Try clearing a filter or widening the date range." : "No registers were marked in this date range."}</p>
                {filtersActive && (
                  <Button onClick={reset} className="mt-3">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Section title="By class" hint="Lessons with at least one mark. Click a class to filter.">
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                        <thead className="sticky top-0 bg-white">
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
                    <div className="p-4">
                      <DataTable
                        caption="Attendance by student"
                        rows={byStudent}
                        rowKey={(st) => st.id}
                        initialSort={{ key: "absent", dir: "desc" }}
                        pageSize={25}
                        columns={[
                          {
                            key: "student",
                            header: "Student",
                            sort: (st) => st.name,
                            cell: (st) => (
                              <button type="button" onClick={() => setSearch(st.name)} className="text-left font-medium text-ink hover:text-teal-700 hover:underline">
                                {st.name}
                              </button>
                            ),
                          },
                          { key: "present", header: "P", align: "right", sort: (st) => st.counts.present, className: "tabular-nums text-ink/70", cell: (st) => st.counts.present },
                          { key: "late", header: "L", align: "right", sort: (st) => st.counts.late, className: "tabular-nums text-ink/70", cell: (st) => st.counts.late },
                          {
                            key: "absent",
                            header: "A",
                            align: "right",
                            sort: (st) => st.counts.absent,
                            className: "tabular-nums",
                            cell: (st) => <span className={st.counts.absent > 0 ? "font-medium text-red-700" : "text-ink/70"}>{st.counts.absent}</span>,
                          },
                          { key: "excused", header: "E", align: "right", sort: (st) => st.counts.excused, className: "tabular-nums text-ink/70", cell: (st) => st.counts.excused },
                          { key: "not_engaged", header: "NE", align: "right", sort: (st) => st.counts.not_engaged, className: "tabular-nums text-ink/70", cell: (st) => st.counts.not_engaged },
                          { key: "technical", header: "T", align: "right", sort: (st) => st.counts.technical, className: "tabular-nums text-ink/70", cell: (st) => st.counts.technical },
                          { key: "rate", header: "Rate", align: "right", sort: (st) => rateValue(st.counts), className: "font-semibold tabular-nums", cell: (st) => rate(st.counts) },
                        ]}
                      />
                    </div>
                    <p className="px-4 py-2 text-xs text-ink/65">P present, L late, A absent, E excused, NE present but not engaged, T couldn&apos;t connect. Rate = (present + late + not engaged) / (those + absent); excused and couldn&apos;t connect are not counted against attendance.</p>
                  </Section>
                </div>

                <Section title="Register" hint={`${total} record${total === 1 ? "" : "s"}, newest lesson first.`}>
                  <div className="p-4">
                    <DataTable
                      caption="Register"
                      rows={filtered}
                      rowKey={(r) => r.id}
                      initialSort={{ key: "date", dir: "desc" }}
                      columns={[
                        { key: "date", header: "Date", sort: (r) => r.date, className: "whitespace-nowrap text-ink/70", cell: (r) => formatDateKey(r.date) },
                        { key: "class", header: "Class", sort: (r) => r.className, className: "text-ink/70", cell: (r) => r.className },
                        { key: "student", header: "Student", sort: (r) => r.child, cell: (r) => <span className="font-medium">{r.child}</span> },
                        {
                          key: "status",
                          header: "Status",
                          sort: (r) => r.status,
                          cell: (r) => {
                            const st = STATUSES.find((x) => x.value === r.status);
                            return (
                              <span className="inline-flex items-center gap-1.5 text-ink/80">
                                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${st?.dot || "bg-ink/30"}`} />
                                {st?.label || r.status}
                              </span>
                            );
                          },
                        },
                      ]}
                    />
                  </div>
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
type Progress = { taken: number; total: number };

const isDone = (p: Progress | undefined) => Boolean(p && p.total > 0 && p.taken >= p.total);

function DayLessonCard({ lesson, open, onToggle, progress, onProgress }: { lesson: DayLesson; open: boolean; onToggle: () => void; progress: Progress | undefined; onProgress: (id: string, taken: number, total: number) => void }) {
  const report = useCallback((taken: number, total: number) => onProgress(lesson.id, taken, total), [onProgress, lesson.id]);
  const done = isDone(progress);
  const empty = progress !== undefined && progress.total === 0;
  const partial = progress !== undefined && progress.taken > 0 && !done;
  const panelId = `register-${lesson.id}`;
  return (
    <section className="overflow-hidden rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="h-10 w-10 shrink-0 rounded-xl" style={classBannerStyle(lesson.classId)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink/65">
            {lesson.start} to {lesson.end}
          </p>
          <Link href={`/admin/class?id=${lesson.classId}`} className="block truncate text-base font-semibold text-ink hover:text-teal-700">
            {lesson.className}
          </Link>
        </div>
        <StatusChip tone={progress === undefined || empty ? "neutral" : done ? "good" : partial ? "warn" : "bad"}>
          {progress === undefined ? "Checking…" : empty ? "No pupils enrolled" : done ? "Register taken" : partial ? `Part taken (${progress.taken} of ${progress.total})` : "Register not taken"}
        </StatusChip>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className={btn(open || done ? "secondary" : "primary", "sm")}>
          {open ? "Hide register" : done ? "Review" : "Take register"}
        </button>
      </div>
      {/* Kept mounted while hidden so the status badge stays live. */}
      <div id={panelId} hidden={!open} className="border-t border-gold-light">
        <Register lessonId={lesson.id} classId={lesson.classId} onProgress={report} />
      </div>
    </section>
  );
}

const navBtn = btn("secondary");

function TakeRegister() {
  const [date, setDate] = useState(ukToday());
  const [lessons, setLessons] = useState<DayLesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  // Open/closed per lesson. Until a register reports in it follows the
  // default; then it opens only if the register still needs taking.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("lesson_instances")
        .select("id, timetable_slots(class_id, start_time, end_time, classes(name), timetable_runs(status))")
        .eq("date", date);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLessons([]);
        return;
      }
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

  const lessonCount = useRef(0);
  useEffect(() => {
    lessonCount.current = lessons?.length ?? 0;
  }, [lessons]);
  const onProgress = useCallback((id: string, taken: number, total: number) => {
    setProgress((p) => (p[id]?.taken === taken && p[id]?.total === total ? p : { ...p, [id]: { taken, total } }));
    // Decide open/closed once, when the register first loads, so a card
    // doesn't snap shut under the admin's cursor as they finish it.
    setToggled((t) => (id in t ? t : { ...t, [id]: lessonCount.current <= 2 || (total > 0 && taken < total) }));
  }, []);

  const go = (d: string) => {
    if (!d) return;
    setLessons(null);
    setError(null);
    setProgress({});
    setToggled({});
    setDate(d);
  };
  const today = ukToday();
  const label = formatDateKey(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const list = lessons || [];
  // With only a couple of lessons, open them all; otherwise open only the
  // ones still to take, so a busy day isn't one very long page.
  const isOpen = (l: DayLesson) => toggled[l.id] ?? list.length <= 2;
  const doneCount = list.filter((l) => isDone(progress[l.id])).length;
  const known = list.filter((l) => progress[l.id] !== undefined).length;
  const shown = onlyOutstanding ? list.filter((l) => !isDone(progress[l.id])) : list;
  const setAll = (open: boolean) => setToggled(Object.fromEntries(list.map((l) => [l.id, open])));

  return (
    <>
      <div data-guide="registers-day" className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gold-light bg-white p-3">
        <button type="button" onClick={() => go(shiftDateKey(date, -1))} className={navBtn} aria-label="Previous day">
          ‹ Previous
        </button>
        <input type="date" value={date} onChange={(e) => go(e.target.value)} className={`${fieldCls} !w-auto`} aria-label="Register date" />
        <button type="button" onClick={() => go(shiftDateKey(date, 1))} className={navBtn} aria-label="Next day">
          Next ›
        </button>
        {date !== today && (
          <button type="button" onClick={() => go(today)} className={btn("ghost")}>
            Today
          </button>
        )}
        <span className="w-full text-sm text-ink/65 sm:ml-auto sm:w-auto">
          {label}
          {date === today ? " (today)" : ""}
        </span>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load this day&apos;s lessons. Please refresh the page and try again.</p>}
      {lessons === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : lessons.length === 0 ? (
        !error && (
          <div className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">
            No published lessons on this day.{" "}
            <Link href="/admin/lessons" className="font-medium text-teal-700 underline">
              Check the timetable
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="font-medium text-ink" aria-live="polite">
              {known < list.length ? "Checking registers…" : `${doneCount} of ${list.length} register${list.length === 1 ? "" : "s"} taken`}
            </p>
            <label className="flex items-center gap-2 text-ink/70">
              <input type="checkbox" checked={onlyOutstanding} onChange={(e) => setOnlyOutstanding(e.target.checked)} />
              Only show registers still to take
            </label>
            {list.length > 2 && (
              <span className="flex gap-3 sm:ml-auto">
                <button type="button" onClick={() => setAll(true)} className={ui.btnLink}>
                  Open all
                </button>
                <button type="button" onClick={() => setAll(false)} className={ui.btnLink}>
                  Close all
                </button>
              </span>
            )}
          </div>
          {onlyOutstanding && shown.length === 0 && <div className="mb-4 rounded-2xl border border-dashed border-green-300 bg-green-50 p-6 text-center text-sm text-green-900">Every register for this day is taken.</div>}
          <div className="space-y-4">
            {list.map((l) => (
              // Hidden rather than unmounted when filtered out, so progress stays known.
              <div key={l.id} hidden={!shown.includes(l)}>
                <DayLessonCard lesson={l} open={isOpen(l)} onToggle={() => setToggled((t) => ({ ...t, [l.id]: !isOpen(l) }))} progress={progress[l.id]} onProgress={onProgress} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

type AttendanceTab = "register" | "reports";

function AttendanceContent() {
  const [tab, setTab] = useState<AttendanceTab>("register");
  const tabs: { key: AttendanceTab; label: string }[] = [
    { key: "register", label: "Take register" },
    { key: "reports", label: "Reports" },
  ];
  return (
    <>
      <PageHeader crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Attendance" }]} title="Attendance" subtitle="Take or correct any lesson's register, or report across a date range." />
      <Tabs items={tabs} value={tab} onChange={setTab} label="Attendance sections" guide="registers-filters" idBase="attendance" className="mb-5" />
      <div {...tabPanelProps("attendance", tab)}>{tab === "register" ? <TakeRegister /> : <ReportsContent />}</div>
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
