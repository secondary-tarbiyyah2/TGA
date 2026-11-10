"use client";

import { Icon } from "@/components/learn/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { StatTile } from "@/components/learn/Card";
import { csvEscape, round2 } from "@/components/learn/fees/shared";
import { PrintHeader, PrintSheet } from "@/components/learn/print";
import { useLearnPermission, useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatGBP } from "@/lib/format";
import { saveCsv } from "@/lib/learn/csv";
import { formatDateKey, shiftDateKey, ukDaysAgo, ukToday, ukWallToDate } from "@/lib/learn/ukTime";
import { Button, EmptyState, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

const shortDate = (key: string) => formatDateKey(key, { day: "numeric", month: "short", year: "numeric" });

type Term = { id: string; name: string; starts_on: string; ends_on: string };
type ClassRow = { id: string; name: string; year_group_id: string | null; year_groups: { name: string } | null };
type ChildRow = { id: string; year_group_id: string | null };
type EnrolRow = { class_id: string; child_id: string };
type LessonRow = { id: string; date: string; timetable_slots: { class_id: string; timetable_runs: { status: string } | null } | null };
type AttRow = { status: string; lesson_instances: { date: string; timetable_slots: { class_id: string } | null } | null };
type HwRow = { id: string; class_id: string; due_at: string };
type SubRow = { homework_id: string; submitted_at: string | null };
type ChargeRow = { id: string; child_id: string | null; amount: number; due_date: string; fee_payments: { amount: number }[] | null };

type Raw = {
  terms: Term[];
  classes: ClassRow[];
  children: ChildRow[];
  enrolments: EnrolRow[];
  lessons: LessonRow[];
  attendance: AttRow[];
  homework: HwRow[];
  submissions: SubRow[];
  charges: ChargeRow[];
};

type Agg = {
  key: string;
  name: string;
  yearGroup: string;
  students: number;
  attended: number;
  marked: number;
  hwDone: number;
  hwExpected: number;
  billed: number;
  collected: number;
};

type PeriodKey = "term" | "30" | "90" | "all";
type GroupBy = "class" | "year";
type SortKey = "name" | "yearGroup" | "students" | "attendance" | "homework" | "collected" | "outstanding";

const PAGE = 1000;
const NO_YEAR = "No year group";

type PageResult = { data: unknown; error: { message: string } | null };

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data as T[] | null) || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// UK school days, whatever zone the browser is in.
const isoDay = (d: Date): string => ukToday(d);
const daysAgo = ukDaysAgo;
/** The UK-midnight instant that starts a day, for timestamp columns. */
const dayStartIso = (key: string): string => ukWallToDate(key).toISOString();

function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

function fmtPct(v: number | null): string {
  return v === null ? "–" : `${v}%`;
}

function emptyAgg(key: string, name: string, yearGroup: string): Agg {
  return { key, name, yearGroup, students: 0, attended: 0, marked: 0, hwDone: 0, hwExpected: 0, billed: 0, collected: 0 };
}

function SummaryContent() {
  const canExport = useLearnPermission("can_export_data");
  const { session } = useLearnSession();
  const generatedBy = session && session !== "loading" ? session.user.email : null;
  const [raw, setRaw] = useState<Raw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [termId, setTermId] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("class");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // Terms and the static lookups load once.
  const [base, setBase] = useState<Pick<Raw, "terms" | "classes" | "children" | "enrolments"> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const [terms, classes, children, enrolments] = await Promise.all([
          fetchAll<Term>((a, b) => supabase.from("terms").select("id, name, starts_on, ends_on").order("starts_on", { ascending: false }).range(a, b)),
          fetchAll<ClassRow>((a, b) => supabase.from("classes").select("id, name, year_group_id, year_groups(name)").order("name").range(a, b)),
          fetchAll<ChildRow>((a, b) => supabase.from("children").select("id, year_group_id").order("id").range(a, b)),
          fetchAll<EnrolRow>((a, b) => supabase.from("enrolments").select("class_id, child_id").order("id").range(a, b)),
        ]);
        if (cancelled) return;
        setBase({ terms, classes, children, enrolments });
        const today = isoDay(new Date());
        const current = terms.find((t) => t.starts_on <= today && t.ends_on >= today) || terms[0];
        if (current) setTermId(current.id);
        else setPeriod("30");
      } catch {
        if (!cancelled) setError("Couldn't load the summary. Refresh the page and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo((): { from: string | null; to: string | null } => {
    // "Last 30 days" is today and the 29 days before it (was 31 days).
    if (period === "30") return { from: daysAgo(29), to: isoDay(new Date()) };
    if (period === "90") return { from: daysAgo(89), to: isoDay(new Date()) };
    if (period === "term" && base) {
      const t = base.terms.find((x) => x.id === termId);
      if (t) return { from: t.starts_on, to: t.ends_on };
    }
    return { from: null, to: null };
  }, [period, termId, base]);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !base) return;
    const { from, to } = range;
    setRaw(null);
    setError(null);
    try {
      const lessons = await fetchAll<LessonRow>((a, b) => {
        let q = supabase.from("lesson_instances").select("id, date, timetable_slots(class_id, timetable_runs(status))");
        if (from) q = q.gte("date", from);
        if (to) q = q.lte("date", to);
        return q.order("id").range(a, b);
      });
      const attendance = await fetchAll<AttRow>((a, b) => {
        let q = supabase.from("attendance_records").select("status, lesson_instances!inner(date, timetable_slots(class_id))");
        if (from) q = q.gte("lesson_instances.date", from);
        if (to) q = q.lte("lesson_instances.date", to);
        return q.order("id").range(a, b);
      });
      const nowIso = new Date().toISOString();
      const homework = await fetchAll<HwRow>((a, b) => {
        let q = supabase.from("homework").select("id, class_id, due_at").lte("due_at", nowIso);
        if (from) q = q.gte("due_at", dayStartIso(from));
        if (to) q = q.lt("due_at", dayStartIso(shiftDateKey(to, 1)));
        return q.order("id").range(a, b);
      });
      const submissions = await fetchAll<SubRow>((a, b) => {
        let q = supabase.from("homework_submissions").select("homework_id, submitted_at, homework!inner(due_at)").not("submitted_at", "is", null).lte("homework.due_at", nowIso);
        if (from) q = q.gte("homework.due_at", dayStartIso(from));
        if (to) q = q.lt("homework.due_at", dayStartIso(shiftDateKey(to, 1)));
        return q.order("id").range(a, b);
      });
      const charges = await fetchAll<ChargeRow>((a, b) => {
        let q = supabase.from("fee_charges").select("id, child_id, amount, due_date, fee_payments(amount)").is("voided_at", null);
        if (from) q = q.gte("due_date", from);
        if (to) q = q.lte("due_date", to);
        return q.order("id").range(a, b);
      });
      setRaw({ ...base, lessons, attendance, homework, submissions, charges });
    } catch {
      setError("Couldn't load the summary. Refresh the page and try again.");
    }
  }, [base, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const calc = useMemo(() => {
    if (!raw) return null;
    const ygName = new Map<string, string>();
    raw.classes.forEach((c) => {
      if (c.year_group_id && c.year_groups) ygName.set(c.year_group_id, c.year_groups.name);
    });

    const classAgg = new Map<string, Agg>();
    raw.classes.forEach((c) => classAgg.set(c.id, emptyAgg(c.id, c.name, c.year_groups?.name || NO_YEAR)));

    const enrolledByClass = new Map<string, Set<string>>();
    const classesByChild = new Map<string, string[]>();
    raw.enrolments.forEach((e) => {
      if (!enrolledByClass.has(e.class_id)) enrolledByClass.set(e.class_id, new Set());
      enrolledByClass.get(e.class_id)?.add(e.child_id);
      classesByChild.set(e.child_id, [...(classesByChild.get(e.child_id) || []), e.class_id]);
    });
    enrolledByClass.forEach((set, id) => {
      const a = classAgg.get(id);
      if (a) a.students = set.size;
    });

    let attended = 0;
    let marked = 0;
    raw.attendance.forEach((r) => {
      if (r.status === "excused" || r.status === "technical") return;
      const ok = r.status === "present" || r.status === "late" || r.status === "not_engaged";
      marked += 1;
      if (ok) attended += 1;
      const cid = r.lesson_instances?.timetable_slots?.class_id;
      const a = cid ? classAgg.get(cid) : undefined;
      if (a) {
        a.marked += 1;
        if (ok) a.attended += 1;
      }
    });

    const hwClass = new Map<string, string>();
    let hwExpected = 0;
    raw.homework.forEach((h) => {
      hwClass.set(h.id, h.class_id);
      const n = enrolledByClass.get(h.class_id)?.size || 0;
      hwExpected += n;
      const a = classAgg.get(h.class_id);
      if (a) a.hwExpected += n;
    });
    // Count submissions per piece of homework, capped at the class size, so
    // work handed in by a pupil who has since left can't push past 100%.
    const subsByHw = new Map<string, number>();
    raw.submissions.forEach((s) => subsByHw.set(s.homework_id, (subsByHw.get(s.homework_id) || 0) + 1));
    let hwDone = 0;
    subsByHw.forEach((n, hid) => {
      const cid = hwClass.get(hid);
      if (!cid) return;
      const done = Math.min(n, enrolledByClass.get(cid)?.size || 0);
      hwDone += done;
      const a = classAgg.get(cid);
      if (a) a.hwDone += done;
    });

    // Fees belong to a child. Classes use enrolments (a child in several
    // classes counts in each); year groups use the child's own year group.
    const ygAgg = new Map<string, Agg>();
    const childYg = new Map<string, string>();
    raw.children.forEach((c) => {
      const name = (c.year_group_id && ygName.get(c.year_group_id)) || NO_YEAR;
      childYg.set(c.id, name);
      if (!ygAgg.has(name)) ygAgg.set(name, emptyAgg(name, name, name));
      const y = ygAgg.get(name);
      if (y) y.students += 1;
    });

    let billed = 0;
    let collected = 0;
    raw.charges.forEach((c) => {
      const paid = Math.min(c.amount, (c.fee_payments || []).reduce((s, p) => s + p.amount, 0));
      billed += c.amount;
      collected += paid;
      if (!c.child_id) return;
      (classesByChild.get(c.child_id) || []).forEach((cid) => {
        const a = classAgg.get(cid);
        if (a) {
          a.billed += c.amount;
          a.collected += paid;
        }
      });
      const yName = childYg.get(c.child_id);
      const y = yName ? ygAgg.get(yName) : undefined;
      if (y) {
        y.billed += c.amount;
        y.collected += paid;
      }
    });

    // Year group rows take attendance and homework from their classes.
    classAgg.forEach((a) => {
      if (!ygAgg.has(a.yearGroup)) ygAgg.set(a.yearGroup, emptyAgg(a.yearGroup, a.yearGroup, a.yearGroup));
      const y = ygAgg.get(a.yearGroup);
      if (y) {
        y.attended += a.attended;
        y.marked += a.marked;
        y.hwDone += a.hwDone;
        y.hwExpected += a.hwExpected;
      }
    });

    return {
      students: raw.children.length,
      // Held = on the published timetable and not in the future.
      lessons: raw.lessons.filter((l) => l.date <= isoDay(new Date()) && l.timetable_slots?.timetable_runs?.status === "published").length,
      attendance: pct(attended, marked),
      collected: round2(collected),
      outstanding: round2(Math.max(0, billed - collected)),
      billed,
      collection: pct(collected, billed),
      homework: pct(hwDone, hwExpected),
      classRows: [...classAgg.values()],
      yearRows: [...ygAgg.values()].filter((y) => y.students > 0 || y.marked > 0 || y.hwExpected > 0),
    };
  }, [raw]);

  const periodLabel = useMemo(() => {
    if (period === "all") return "All time";
    if (period === "30") return "Last 30 days";
    if (period === "90") return "Last 90 days";
    const t = base?.terms.find((x) => x.id === termId);
    return t ? `${t.name} (${shortDate(t.starts_on)} to ${shortDate(t.ends_on)})` : "Term";
  }, [period, base, termId]);

  const rows = useMemo(() => {
    if (!calc) return [];
    const src = groupBy === "class" ? calc.classRows : calc.yearRows;
    const val = (a: Agg): number | string => {
      switch (sortKey) {
        case "name":
          return a.name.toLowerCase();
        case "yearGroup":
          return a.yearGroup.toLowerCase();
        case "students":
          return a.students;
        case "attendance":
          return pct(a.attended, a.marked) ?? -1;
        case "homework":
          return pct(a.hwDone, a.hwExpected) ?? -1;
        case "collected":
          return a.collected;
        default:
          return Math.max(0, a.billed - a.collected);
      }
    };
    return [...src].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : Number(x) - Number(y);
      return c * sortDir || a.name.localeCompare(b.name);
    });
  }, [calc, groupBy, sortKey, sortDir]);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "yearGroup" ? 1 : -1);
    }
  };

  const exportCsv = () => {
    if (!calc) return;
    const lines: string[] = [];
    lines.push(["Period", periodLabel].map(csvEscape).join(","));
    lines.push(["Total students", calc.students].map(csvEscape).join(","));
    lines.push(["Lessons held", calc.lessons].map(csvEscape).join(","));
    lines.push(["Attendance rate", fmtPct(calc.attendance)].map(csvEscape).join(","));
    lines.push(["Fees collected", calc.collected.toFixed(2)].map(csvEscape).join(","));
    lines.push(["Fees outstanding", calc.outstanding.toFixed(2)].map(csvEscape).join(","));
    lines.push(["Collection rate", fmtPct(calc.collection)].map(csvEscape).join(","));
    lines.push(["Homework completion", fmtPct(calc.homework)].map(csvEscape).join(","));
    lines.push("");
    lines.push([groupBy === "class" ? "Class" : "Year group", "Year group", "Students", "Attendance %", "Homework completion %", "Fees collected", "Fees outstanding"].map(csvEscape).join(","));
    rows.forEach((r) => {
      lines.push(
        [
          r.name,
          r.yearGroup,
          r.students,
          pct(r.attended, r.marked) ?? "",
          pct(r.hwDone, r.hwExpected) ?? "",
          r.collected.toFixed(2),
          Math.max(0, r.billed - r.collected).toFixed(2),
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    saveCsv(`summary-${isoDay(new Date())}.csv`, lines.join("\r\n"));
  };

  const field = `${ui.select} !w-auto`;
  const hasTerms = !!base && base.terms.length > 0;

  const th = (k: SortKey, label: string, align: "left" | "right" = "right") => (
    <th scope="col" aria-sort={sortKey === k ? (sortDir === 1 ? "ascending" : "descending") : "none"} className={`px-4 py-3 ${align === "left" ? "text-left" : "text-right"}`}>
      <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 font-semibold hover:text-ink">
        {label}
        <span aria-hidden="true" className={sortKey === k ? "text-teal-700" : "text-ink/25"}>
          <Icon name={sortKey === k ? (sortDir === 1 ? "chevronUp" : "chevronDown") : "chevronDown"} size="sm" />
        </span>
      </button>
    </th>
  );

  return (
    <div>
      <PrintSheet />
      <div className="print:hidden">
      <PageHeader
        crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "School summary" }]}
        title="School summary"
        subtitle="School-wide attendance, fees, homework and lessons, with a per-class breakdown."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {canExport && (
              <Button icon="download" onClick={exportCsv} disabled={!calc}>
                Download CSV
              </Button>
            )}
            <Button icon="printer" onClick={() => window.print()} disabled={!calc}>
              Print or save as PDF
            </Button>
          </div>
        }
      />
      </div>

      <div className="no-print mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-ink/70">
          <span className="mb-1 block">Period</span>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className={field}>
            {hasTerms && <option value="term">Term</option>}
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </Select>
        </label>
        {period === "term" && hasTerms && (
          <label className="text-sm font-medium text-ink/70">
            <span className="mb-1 block">Term</span>
            <Select value={termId} onChange={(e) => setTermId(e.target.value)} className={field}>
              {base?.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({shortDate(t.starts_on)} to {shortDate(t.ends_on)})
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
      <PrintHeader title="School Summary" period={periodLabel} generatedBy={generatedBy} />

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {!calc && !error && <div role="status" aria-label="Loading summary" className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />}

      {calc && (
        <>
          <div className="print-tiles mb-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total students" value={calc.students} />
            <StatTile label="Lessons held" value={calc.lessons} />
            <StatTile label="Attendance rate" value={fmtPct(calc.attendance)} />
            <StatTile label="Homework completion" value={fmtPct(calc.homework)} />
            <StatTile label="Fees collected" value={formatGBP(calc.collected)} />
            <StatTile label="Fees outstanding" value={formatGBP(calc.outstanding)} status={calc.outstanding > 0 ? "warning" : calc.billed > 0 ? "ok" : undefined} />
            <StatTile label="Collection %" value={fmtPct(calc.collection)} />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className={ui.sectionTitle}>{groupBy === "class" ? "By class" : "By year group"}</h2>
            <label className="no-print flex shrink-0 items-center gap-2 text-sm font-medium text-ink/70">
              Group by
              <Select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as GroupBy);
                  if (sortKey === "yearGroup") setSortKey("name");
                }}
                className={field}
              >
                <option value="class">Class</option>
                <option value="year">Year group</option>
              </Select>
            </label>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No classes to show yet" icon="layers">
              Add classes under Academic setup and they will appear here.
            </EmptyState>
          ) : (
            <div className="print-scroll overflow-x-auto rounded-2xl border border-gold-light bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-cream/60 text-ink/70">
                  <tr>
                    {th("name", groupBy === "class" ? "Class" : "Year group", "left")}
                    {groupBy === "class" && th("yearGroup", "Year group", "left")}
                    {th("students", "Students")}
                    {th("attendance", "Attendance %")}
                    {th("homework", "Homework completion %")}
                    {th("collected", "Fees collected")}
                    {th("outstanding", "Fees outstanding")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold-light/60">
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-ink">{r.name}</th>
                      {groupBy === "class" && <td className="px-4 py-3 text-ink/70">{r.yearGroup}</td>}
                      <td className="px-4 py-3 text-right tabular-nums">{r.students}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(pct(r.attended, r.marked))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(pct(r.hwDone, r.hwExpected))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGBP(r.collected)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGBP(Math.max(0, r.billed - r.collected))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-ink/65">
            Attendance counts present, late and present-but-not-engaged marks against absences; excused and couldn&apos;t-connect marks are left out. Homework completion is submissions against pupils enrolled, for homework already due.
            {groupBy === "class" && " Class fees follow enrolments, so a child in several classes appears in each; the totals above count every charge once."}
            {" "}Fees cover charges falling due in the period.
          </p>
        </>
      )}
    </div>
  );
}

export default function AdminSummaryPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <SummaryContent />
      </LearnGate>
    </section>
  );
}
