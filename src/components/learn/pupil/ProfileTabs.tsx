"use client";

import { Icon } from "@/components/learn/Icon";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo } from "@/lib/learn/ukTime";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { TECHNICAL_REPEAT, attendanceLabel, tallyAttendance, technicalRepeats } from "@/lib/learn/attendanceCodes";
import { reasonLabel } from "@/components/learn/absences/data";
import { ReportDocument, PrintStyles, StatusBadge } from "@/components/learn/reports/ReportDocument";
import { asNarrative } from "@/components/learn/reports/summary";
import { Select } from "@/components/learn/Select";

// The tabs of a pupil's profile that come from other parts of the portal
// (registers, behaviour, stars, reports). Each reads the same RLS-scoped
// tables those pages use, so the numbers always agree with them.

const fmt = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// ── Attendance ──────────────────────────────────────────────────────────
type AttRow = { status: string; lesson_instances: { date: string; timetable_slots: { classes: { name: string } | null } | null } | null };
export type AttendanceFigures = { lessons: number; attended: number; late: number; /** Unauthorised absences. */ absent: number; /** Authorised absences. */ excused: number; /** Technical absences, counted on their own. */ technical: number; rate: number | null };

/** The school's figures (attendanceCodes.ts): technical absences are counted separately and not held against the rate. */
export function attendanceFigures(rows: { status: string }[]): AttendanceFigures {
  const t = tallyAttendance(rows);
  return { lessons: t.lessons, attended: t.attended, late: t.late, absent: t.unauthorised, excused: t.authorised, technical: t.technical, rate: t.rate };
}

export function PupilAttendanceTab({ childId }: { childId: string }) {
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [rows, setRows] = useState<AttRow[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<{ from_date: string; to_date: string; reason: string; status: string }[]>([]);
  const [followups, setFollowups] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const from = ukDaysAgo(days);
      const [a, r, n, f] = await Promise.all([
        supabase.from("attendance_records").select("status, lesson_instances!inner(date, timetable_slots(classes(name)))").eq("child_id", childId).gte("lesson_instances.date", from).limit(3000),
        supabase.from("absence_reasons").select("absence_date, reason_code").eq("child_id", childId).gte("absence_date", from),
        supabase.from("absence_notes").select("from_date, to_date, reason, status").eq("child_id", childId).gte("to_date", from),
        supabase.from("absence_followups").select("absence_date, status").eq("child_id", childId).gte("absence_date", from),
      ]);
      if (!alive) return;
      setRows((a.data as unknown as AttRow[]) || []);
      setReasons(Object.fromEntries(((r.data as { absence_date: string; reason_code: string }[]) || []).map((x) => [x.absence_date, x.reason_code])));
      setNotes((n.data as { from_date: string; to_date: string; reason: string; status: string }[]) || []);
      setFollowups(Object.fromEntries(((f.data as { absence_date: string; status: string }[]) || []).map((x) => [x.absence_date, x.status])));
    })();
    return () => {
      alive = false;
    };
  }, [childId, days]);

  const fig = useMemo(() => attendanceFigures(rows || []), [rows]);
  const absences = useMemo(() => {
    const by = new Map<string, { classes: string[]; codes: Set<string> }>();
    for (const r of rows || []) {
      if (r.status !== "absent" && r.status !== "excused" && r.status !== "technical") continue;
      const d = r.lesson_instances?.date;
      if (!d) continue;
      const e = by.get(d) || { classes: [], codes: new Set<string>() };
      e.classes.push(r.lesson_instances?.timetable_slots?.classes?.name || "Lesson");
      e.codes.add(r.status);
      by.set(d, e);
    }
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);
  const technicalDates = useMemo(() => (rows || []).filter((r) => r.status === "technical" && r.lesson_instances?.date).map((r) => r.lesson_instances!.date), [rows]);
  const technicalFlag = technicalRepeats(technicalDates);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-ink/75">
          <span>Period</span>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value) as 30 | 90 | 365)} className={`${ui.input} !w-auto !py-1.5`}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </Select>
        </label>
        <Link href="/admin/absences" className={`${ui.btnSecondary} ${ui.sm}`}>
          Open Absences
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Fig label="Attendance" value={rows ? (fig.rate === null ? "–" : `${fig.rate}%`) : "…"} warn={fig.rate !== null && fig.rate < 90} sub={`${fig.lessons} lessons registered`} />
        <Fig label="Present or late" value={rows ? String(fig.attended) : "…"} sub={fig.late ? `${fig.late} late` : "on time"} />
        <Fig label="Authorised absence" value={rows ? String(fig.excused) : "…"} sub="not held against the rate" />
        <Fig label="Unauthorised absence" value={rows ? String(fig.absent) : "…"} warn={fig.absent > 0} sub="counts against the rate" />
        <Fig label="Technical absence" value={rows ? String(fig.technical) : "…"} warn={technicalFlag} sub={technicalFlag ? "Repeated: check the connection" : "counted separately"} />
      </dl>
      {technicalFlag && (
        <Notice tone="warn">
          Repeated technical absences: {TECHNICAL_REPEAT.count} or more days within {TECHNICAL_REPEAT.days} days. Check the family&apos;s connection and device with them.
        </Notice>
      )}
      <section className="rounded-2xl border border-gold-light bg-white">
        <h3 className="border-b border-gold-light px-4 py-2.5 text-sm font-semibold text-ink">Days away</h3>
        {rows === null ? (
          <div className="m-4 h-12 motion-safe:animate-pulse rounded-lg bg-cream" />
        ) : absences.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink/65">No absences in this period.</p>
        ) : (
          <ul className="divide-y divide-gold-light/50">
            {absences.map(([date, { classes, codes }]) => {
              const note = notes.find((n) => n.from_date <= date && date <= n.to_date);
              const code = reasons[date];
              const fu = followups[date];
              return (
                <li key={date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 text-ink/70">{fmt(date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{note?.reason || reasonLabel(code) || <span className="text-ink/60">No reason given</span>}</span>
                    <span className="block text-xs text-ink/60">{Array.from(new Set(classes)).join(", ")}</span>
                  </span>
                  <span className="t-meta">{[...codes].map((c) => attendanceLabel(c)).join(", ")}</span>
                  {note?.status === "authorised" && <StatusChip tone="good">Authorised</StatusChip>}
                  {note?.status === "unauthorised" && <StatusChip tone="bad">Not authorised</StatusChip>}
                  {fu === "escalated" && <StatusChip tone="bad">Escalated</StatusChip>}
                  {!note && !code && fu !== "escalated" && !(codes.size === 1 && codes.has("technical")) && <StatusChip tone="warn">{fu === "contacted" ? "Family contacted" : "To follow up"}</StatusChip>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Behaviour & rewards ─────────────────────────────────────────────────
type Bh = { id: string; kind: "merit" | "demerit" | "incident"; points: number; category: string; occurred_on: string; classes: { name: string } | null };
type StarRow = { id: string; week_start: string; reason: string; status: string; classes: { name: string } | null };

export function PupilBehaviourTab({ childId, extra }: { childId: string; extra?: React.ReactNode }) {
  const [rows, setRows] = useState<Bh[] | null>(null);
  const [stars, setStars] = useState<StarRow[]>([]);
  const [house, setHouse] = useState<{ name: string; colour: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const from = ukDaysAgo(120);
      const [b, s, h] = await Promise.all([
        supabase.from("behaviour_records").select("id, kind, points, category, occurred_on, classes(name)").eq("child_id", childId).is("voided_at", null).gte("occurred_on", from).order("occurred_on", { ascending: false }).limit(300),
        supabase.from("star_of_the_week").select("id, week_start, reason, status, classes(name)").eq("child_id", childId).order("week_start", { ascending: false }).limit(20),
        supabase.from("house_members").select("houses(name, colour)").eq("child_id", childId).maybeSingle(),
      ]);
      if (!alive) return;
      setRows((b.data as unknown as Bh[]) || []);
      setStars((s.data as unknown as StarRow[]) || []);
      setHouse(((h.data as unknown as { houses: { name: string; colour: string } | null } | null) || null)?.houses || null);
    })();
    return () => {
      alive = false;
    };
  }, [childId]);

  const t = useMemo(() => {
    const out = { merits: 0, meritPts: 0, demerits: 0, demeritPts: 0, incidents: 0 };
    for (const r of rows || []) {
      if (r.kind === "merit") {
        out.merits++;
        out.meritPts += r.points;
      } else if (r.kind === "demerit") {
        out.demerits++;
        out.demeritPts += r.points;
      } else out.incidents++;
    }
    return out;
  }, [rows]);
  const approved = stars.filter((s) => s.status === "approved");

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fig label="Merits" value={rows ? String(t.merits) : "…"} sub={`+${t.meritPts} points · last 4 months`} />
        <Fig label="Demerits" value={rows ? String(t.demerits) : "…"} warn={t.demerits > 0} sub={`${t.demeritPts} points`} />
        <Fig label="Incidents" value={rows ? String(t.incidents) : "…"} warn={t.incidents > 0} sub="recorded by staff" />
        <Fig label="House" value={house?.name || "None"} sub={approved.length ? `Star of the Week ${approved.length}×` : "Not star yet"} />
      </dl>
      {approved.length > 0 && (
        <section className="rounded-2xl border border-gold-light bg-white">
          <h3 className="border-b border-gold-light px-4 py-2.5 text-sm font-semibold text-ink">
            <Icon name="star" className="mr-1.5 inline h-4 w-4 align-[-2px] text-gold-700" />Star of the Week
          </h3>
          <ul className="divide-y divide-gold-light/50">
            {approved.map((s) => (
              <li key={s.id} className="px-4 py-2.5 text-sm">
                <p className="text-ink">
                  Week beginning {fmt(s.week_start)} <span className="text-ink/60">· {s.classes?.name}</span>
                </p>
                <p className="text-xs text-ink/70">{s.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-2xl border border-gold-light bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink">Recent records</h3>
          <Link href="/admin/behaviour" className={ui.btnLink}>
            Open Behaviour
          </Link>
        </div>
        {rows === null ? (
          <div className="m-4 h-12 motion-safe:animate-pulse rounded-lg bg-cream" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink/65">Nothing recorded in the last four months.</p>
        ) : (
          <ul className="divide-y divide-gold-light/50">
            {rows.slice(0, 25).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="w-28 shrink-0 text-ink/70">{fmt(r.occurred_on)}</span>
                <StatusChip tone={r.kind === "merit" ? "good" : r.kind === "demerit" ? "warn" : "bad"}>{r.kind === "merit" ? `Merit +${r.points}` : r.kind === "demerit" ? `Demerit ${r.points}` : "Incident"}</StatusChip>
                <span className="min-w-0 flex-1 text-ink/80">{r.category}</span>
                <span className="text-xs text-ink/60">{r.classes?.name || ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {extra}
    </div>
  );
}

// ── Reports ─────────────────────────────────────────────────────────────
type Version = { id: string; report_id: string; version: number; overall_comment: string | null; subject_comments: Record<string, string> | null; narrative: unknown; released_at: string; terms: { name: string } | null };
type Working = { id: string; status: string; returned_reason: string | null; updated_at: string; terms: { name: string } | null };

export function PupilReportsTab({ childId, childName }: { childId: string; childName: string }) {
  const [issued, setIssued] = useState<Version[] | null>(null);
  const [working, setWorking] = useState<Working[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [v, w] = await Promise.all([
        supabase.from("term_report_versions").select("id, report_id, version, overall_comment, subject_comments, narrative, released_at, terms(name)").eq("child_id", childId).order("released_at", { ascending: false }),
        supabase.from("term_reports").select("id, status, returned_reason, updated_at, terms(name)").eq("child_id", childId).neq("status", "released"),
      ]);
      if (!alive) return;
      const latest = new Map<string, Version>();
      for (const r of (v.data as unknown as Version[]) || []) {
        const cur = latest.get(r.report_id);
        if (!cur || r.version > cur.version) latest.set(r.report_id, r);
      }
      setIssued([...latest.values()]);
      setWorking((w.data as unknown as Working[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [childId]);

  const print = () => {
    setPrinting(true);
    window.addEventListener("afterprint", () => setPrinting(false), { once: true });
    setTimeout(() => window.print(), 100);
  };
  const shown = (issued || []).find((r) => r.id === open) || null;

  return (
    <div className="space-y-4">
      <PrintStyles />
      {working.length > 0 && (
        <section className="rounded-2xl border border-gold-light bg-white print:hidden">
          <h3 className="border-b border-gold-light px-4 py-2.5 text-sm font-semibold text-ink">In progress</h3>
          <ul className="divide-y divide-gold-light/50">
            {working.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 text-ink">{w.terms?.name || "All time"}</span>
                {w.status === "draft" && w.returned_reason && <StatusChip tone="warn">Sent back</StatusChip>}
                <StatusBadge status={w.status} />
                <span className="text-xs text-ink/60">updated {fmtLong(w.updated_at)}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-xs text-ink/60">
            Reports are written per class in{" "}
            <Link href="/admin/reports" className="text-teal-700 underline">
              Progress reports
            </Link>
            .
          </p>
        </section>
      )}
      {issued === null ? (
        <div className="h-24 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : issued.length === 0 ? (
        working.length === 0 && <EmptyState title="No reports yet" icon="fileText" tile="tile-blue">Issued reports appear here, exactly as the family sees them.</EmptyState>
      ) : shown ? (
        <div className="space-y-2">
          <div className="flex flex-wrap justify-between gap-2 print:hidden">
            <button type="button" onClick={() => setOpen(null)} className={`${ui.btnSecondary} ${ui.sm}`}>
              ‹ All reports
            </button>
            <button type="button" onClick={print} className={`${ui.btnSecondary} ${ui.sm}`}>
              Print or save as PDF
            </button>
          </div>
          <ReportDocument childName={childName} termLabel={shown.terms?.name || "All time"} issuedAt={shown.released_at} narrative={asNarrative(shown.narrative)} comment={shown.overall_comment} subjectComments={shown.subject_comments || undefined} printing={printing} />
        </div>
      ) : (
        <section className="rounded-2xl border border-gold-light bg-white">
          <h3 className="border-b border-gold-light px-4 py-2.5 text-sm font-semibold text-ink">Issued</h3>
          <ul className="divide-y divide-gold-light/50">
            {issued.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 text-ink">{r.terms?.name || "All time"}</span>
                <span className="text-xs text-ink/60">issued {fmtLong(r.released_at)}</span>
                <button type="button" onClick={() => setOpen(r.id)} className={`${ui.btnSecondary} ${ui.sm}`}>
                  View
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Fig({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-gold-light bg-white p-3">
      <dt className="text-[11px] text-ink/65">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-900" : "text-ink"}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-ink/65">{sub}</dd>}
    </div>
  );
}
