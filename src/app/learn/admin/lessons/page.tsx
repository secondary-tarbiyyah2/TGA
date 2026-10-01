"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { SlotEditor } from "@/components/learn/timetable/SlotEditor";
import { WeeklyGrid } from "@/components/learn/timetable/WeeklyGrid";
import { classColour, type Availability, type ClassOpt, type ClassTeacherLink, type Conflict, type Protected, type Run, type Teacher, type TermOpt, type YearOpt } from "@/components/learn/timetable/types";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";
import { WEEKDAYS, timeLabel, type TimetableSlot } from "@/lib/learn/timetable";

async function callFunction(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; detail?: string; run_id?: string }> {
  // Shared helper: never throws or hangs, see src/lib/learn/edge.ts.
  return (await callEdgeFunction(name, body)) as never;
}

function CoverForm({ slots, teachers, onDone }: { slots: TimetableSlot[]; teachers: Teacher[]; onDone: () => void }) {
  const [slotId, setSlotId] = useState("");
  const [date, setDate] = useState("");
  const [coveringTeacher, setCoveringTeacher] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const assign = async () => {
    if (!slotId || !date || !coveringTeacher) return;
    const result = await callFunction("timetable-cover", { slot_id: slotId, cover_date: date, covering_teacher_user_id: coveringTeacher, reason });
    if (!result.ok) {
      setMessage(`Could not assign cover: ${edgeErrorMessage(result)}`);
    } else {
      setMessage("Cover assigned.");
      setSlotId("");
      setDate("");
      setCoveringTeacher("");
      setReason("");
      onDone();
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Assign cover</h2>
      {message && <p className="mt-2 text-xs text-ink/70">{message}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select value={slotId} onChange={(e) => setSlotId(e.target.value)} aria-label="Lesson" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Lesson…</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subjects?.name} ({s.classes?.name}) — {WEEKDAYS.find((w) => w.value === s.weekday)?.short} {timeLabel(s.start_time)}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        <select value={coveringTeacher} onChange={(e) => setCoveringTeacher(e.target.value)} aria-label="Covering teacher" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
          <option value="">Covering teacher…</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="button" onClick={assign} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 transition-colors">
          Assign
        </button>
      </div>
    </div>
  );
}

function GenerateLessonsForm({ runId, onDone }: { runId: string; onDone: () => void }) {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("lesson-instances-generate", { run_id: runId, from, to });
      setMessage(result.ok ? `Generated ${(result as { created?: number }).created ?? 0} lesson instance(s).` : `Could not generate: ${edgeErrorMessage(result)}`);
      if (result.ok) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Generate lesson instances</h2>
      <p className="mt-1 text-sm text-ink/60">
        Creates one lesson (with a join link, objectives, resources, register and recording) for each occurrence of every
        published lesson in this date range. Safe to re-run — existing dates are never duplicated.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-ink/70">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </div>
        <button type="button" disabled={busy} onClick={generate} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-50 text-white hover:bg-gold-900 transition-colors">
          Generate
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-ink/70">{message}</p>}
    </div>
  );
}

type LessonInstanceRow = { id: string; date: string; timetable_slots?: { classes?: { name: string; subjects?: { name: string } | null } | null } | null };

function UpcomingInstances({ runId, refreshKey }: { runId: string; refreshKey: number }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<LessonInstanceRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: slots } = await supabase.from("timetable_slots").select("id").eq("run_id", runId);
      const slotIds = (slots || []).map((s) => s.id);
      if (slotIds.length === 0) {
        setRows([]);
        return;
      }
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, date, timetable_slots(classes(name, subjects(name)))")
        .in("timetable_slot_id", slotIds)
        .gte("date", new Date().toISOString().slice(0, 10))
        .order("date", { ascending: true })
        .limit(20);
      setRows((data as unknown as LessonInstanceRow[]) || []);
    })();
  }, [supabase, runId, refreshKey]);

  if (rows === null) return <p className="text-xs text-ink/50">Loading…</p>;
  if (rows.length === 0) return <p className="text-xs text-ink/50">No upcoming lesson instances generated yet.</p>;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/admin/lessons/view?id=${r.id}`} className="text-gold-700 underline">
            {r.date} — {r.timetable_slots?.classes?.subjects?.name} ({r.timetable_slots?.classes?.name})
          </Link>
        </li>
      ))}
    </ul>
  );
}

const btn = "rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-50";
const ghost = "rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50";
const STEPS = ["Choose year", "Check setup", "Generate", "Review & publish"];

function Step({ n, title, help, active, children }: { n: number; title: string; help: string; active?: boolean; children: React.ReactNode }) {
  return (
    <section id={`step-${n}`} className={`scroll-mt-20 rounded-2xl border bg-white p-4 sm:p-6 ${active ? "border-teal-500/60" : "border-gold-light/50"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">{n}</span>
        <div className="min-w-0">
          <h2 className="font-serif text-h3 font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink/60">{help}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Check({ ok, children, fix }: { ok: boolean; children: React.ReactNode; fix?: React.ReactNode }) {
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${ok ? "border-green-200 bg-green-50/60 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span><span aria-hidden="true" className="mr-2 font-bold">{ok ? "\u2713" : "!"}</span>{children}</span>
      {!ok && fix}
    </li>
  );
}

function LessonsContent() {
  const supabase = getSupabaseClient();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [years, setYears] = useState<YearOpt[] | null>(null);
  const [terms, setTerms] = useState<TermOpt[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacherLink[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [protectedTimes, setProtectedTimes] = useState<Protected[]>([]);
  const [yearId, setYearId] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingFrom, setWaitingFrom] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ slot: TimetableSlot | null; weekday: number; start: string; end: string } | null>(null);
  const [instancesRefreshKey, setInstancesRefreshKey] = useState(0);

  const loadRuns = useCallback(async (): Promise<Run[]> => {
    if (!supabase) return [];
    const { data } = await supabase.from("timetable_runs").select("id, label, status, academic_year_id, created_at, solver_stats").order("created_at", { ascending: false });
    const rows = (data as Run[]) || [];
    setRuns(rows);
    return rows;
  }, [supabase]);

  const loadRunDetail = useCallback(
    async (runId: string) => {
      if (!supabase) return;
      const [{ data: slotData }, { data: conflictData }] = await Promise.all([
        supabase.from("timetable_slots").select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)").eq("run_id", runId),
        supabase.from("timetable_conflicts").select("id, severity, message, resolved").eq("run_id", runId),
      ]);
      setSlots((slotData as unknown as TimetableSlot[]) || []);
      setConflicts((conflictData as Conflict[]) || []);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const rows = await loadRuns();
      if (rows.length > 0) setSelectedRun((cur) => cur || rows[0].id);
      const [ay, tm, cl, tr, ct, av, pt] = await Promise.all([
        supabase.from("academic_years").select("id, label, starts_on, ends_on").order("starts_on", { ascending: false }),
        supabase.from("terms").select("id, name, academic_year_id").order("starts_on"),
        supabase.from("classes").select("id, name, subject_id, academic_year_id, weekly_lessons").order("name"),
        supabase.from("profiles").select("id, full_name, user_roles!inner(role)").in("user_roles.role", ["teacher", "teaching_assistant_cover"]),
        supabase.from("user_roles").select("user_id, scope_id").in("role", ["teacher", "teaching_assistant_cover"]).eq("scope_type", "class"),
        supabase.from("teacher_availability").select("teacher_user_id, academic_year_id, weekday, start_time, end_time"),
        supabase.from("protected_times").select("name, academic_year_id, weekday, start_time, end_time"),
      ]);
      const yrs = (ay.data as YearOpt[]) || [];
      setYears(yrs);
      setYearId((cur) => cur || (yrs[0]?.id ?? ""));
      setTerms((tm.data as TermOpt[]) || []);
      setClasses((cl.data as ClassOpt[]) || []);
      const seen = new Set<string>();
      const ts: Teacher[] = [];
      for (const r of (tr.data as unknown as { id: string; full_name: string | null }[]) || []) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        ts.push({ id: r.id, full_name: r.full_name || "Unnamed" });
      }
      setTeachers(ts.sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setClassTeachers((ct.data as ClassTeacherLink[]) || []);
      setAvailability((av.data as Availability[]) || []);
      setProtectedTimes((pt.data as Protected[]) || []);
    })();
  }, [supabase, loadRuns]);

  useEffect(() => {
    if (selectedRun) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selected-run data load, not a render-cycle sync
      loadRunDetail(selectedRun);
    }
  }, [selectedRun, loadRunDetail]);

  // After "Generate", the solver runs in GitHub Actions; poll for the new draft.
  useEffect(() => {
    if (waitingFrom === null) return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      const rows = await loadRuns();
      if (rows.length > waitingFrom) {
        setSelectedRun(rows[0].id);
        setWaitingFrom(null);
        setMessage("Your new draft is ready. Review it in step 4.");
        document.getElementById("step-4")?.scrollIntoView({ behavior: "smooth" });
      } else if (Date.now() - started > 10 * 60 * 1000) {
        setWaitingFrom(null);
        setMessage("Still no new draft after 10 minutes. Press \"Check for a new draft\" later, or try generating again.");
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [waitingFrom, loadRuns]);

  const year = years?.find((y) => y.id === yearId) || null;
  const yearClasses = classes.filter((c) => c.academic_year_id === yearId);
  const withoutTeacher = yearClasses.filter((c) => !classTeachers.some((t) => t.scope_id === c.id));
  const teachersWithAvail = new Set(availability.filter((a) => a.academic_year_id === yearId).map((a) => a.teacher_user_id));
  const needsSetup = !year || yearClasses.length === 0 || teachers.length === 0;

  const generate = async () => {
    if (!year) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("trigger-timetable-generation", { academic_year_label: year.label, run_label: runLabel.trim() || undefined });
      if (result.ok) {
        setWaitingFrom(runs?.length ?? 0);
        setMessage("Started. The solver usually takes a couple of minutes. This page checks automatically and opens the draft when it appears.");
      } else {
        setMessage(`Could not start timetable generation: ${edgeErrorMessage(result)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const startBlank = async () => {
    if (!supabase || !year) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const label = runLabel.trim() || `${year.label} (by hand)`;
      const { data, error } = await supabase.from("timetable_runs").insert({ academic_year_id: year.id, label, status: "draft", generated_by: "manual", created_by: u.user?.id ?? null }).select("id").single();
      if (error || !data) return setMessage(`Could not create a blank draft: ${error?.message || "unknown error"}`);
      await loadRuns();
      setSelectedRun((data as { id: string }).id);
      setMessage("Blank draft created. Use the + buttons in the grid to add lessons.");
      document.getElementById("step-4")?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const selectedRunRow = runs?.find((r) => r.id === selectedRun) || null;
  const hardConflicts = conflicts.filter((c) => c.severity === "hard" && !c.resolved);
  const editable = selectedRunRow?.status === "draft";
  const runYearId = selectedRunRow?.academic_year_id || yearId;
  const runClasses = classes.filter((c) => c.academic_year_id === runYearId || c.academic_year_id === null);

  const publish = async () => {
    if (!selectedRun) return;
    const result = await callFunction("timetable-publish", { action: "publish", run_id: selectedRun });
    setPublishMessage(result.ok ? "Published." : `Could not publish: ${edgeErrorMessage(result)}`);
    if (result.ok) await loadRuns();
  };

  const rollback = async (runId: string) => {
    const result = await callFunction("timetable-publish", { action: "rollback", run_id: runId });
    setPublishMessage(result.ok ? "Rolled back. A new draft was created from that run; review it, then publish." : `Could not roll back: ${edgeErrorMessage(result)}`);
    if (result.ok && result.run_id) {
      await loadRuns();
      setSelectedRun(result.run_id);
    }
  };

  const placedByClass = new Map<string, number>();
  for (const s of slots) placedByClass.set(s.class_id, (placedByClass.get(s.class_id) || 0) + 1);
  const legendClasses = runClasses.filter((c) => (placedByClass.get(c.id) || 0) > 0 || (editable && c.academic_year_id === runYearId));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Timetable & lessons" }]}
        title="Timetable & lessons"
        subtitle="Build the weekly timetable in four steps, fix anything by hand, then publish it."
      />

      <ol className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s}>
            <a href={`#step-${i + 1}`} className="flex items-center gap-2 rounded-xl border border-gold-light/50 bg-white px-3 py-2 text-xs font-medium text-ink/75 hover:bg-cream">
              <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-100 text-[11px] font-semibold text-gold-900">{i + 1}</span>
              {s}
            </a>
          </li>
        ))}
      </ol>

      {message && <p role="status" className="mb-4 rounded-xl border border-teal-500/30 bg-teal-100/60 px-4 py-3 text-sm text-teal-900">{message}</p>}

      <div className="space-y-5">
        <Step n={1} title="Choose the academic year" help="Which school year is this timetable for?" active={!year}>
          {years === null && <p className="text-sm text-ink/60">Loading…</p>}
          {years && years.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No academic year exists yet, so there is nothing to build a timetable for.{" "}
              <Link href="/admin/academic" className="font-semibold underline">Add one in Academic setup</Link>, then come back.
            </p>
          )}
          {years && years.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-ink/70">
                Academic year
                <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink">
                  {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-ink/70">
                Name for this draft (optional)
                <input value={runLabel} onChange={(e) => setRunLabel(e.target.value)} placeholder="e.g. Autumn draft 2" className="mt-1 w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink" />
              </label>
              {year && (
                <p className="text-xs text-ink/60 sm:col-span-2">
                  {year.starts_on} to {year.ends_on}
                </p>
              )}
            </div>
          )}
        </Step>

        <Step n={2} title="Check classes, teachers and availability" help="The generator can only place what is set up. Fix anything marked ! first." active={Boolean(year) && needsSetup}>
          {!year ? (
            <p className="text-sm text-ink/60">Choose an academic year in step 1.</p>
          ) : (
            <ul className="space-y-2">
              <Check ok={yearClasses.length > 0} fix={<Link href="/admin/academic#classes" className="text-sm font-semibold underline">Add classes</Link>}>
                {yearClasses.length > 0 ? `${yearClasses.length} class${yearClasses.length === 1 ? "" : "es"} in ${year.label} (${yearClasses.reduce((n, c) => n + c.weekly_lessons, 0)} lessons a week to place)` : `No classes are set to ${year.label} yet.`}
              </Check>
              <Check ok={teachers.length > 0} fix={<Link href="/admin/people" className="text-sm font-semibold underline">Invite teachers</Link>}>
                {teachers.length > 0 ? `${teachers.length} teacher${teachers.length === 1 ? "" : "s"}` : "No teachers exist yet."}
              </Check>
              <Check ok={teachers.length > 0 && teachers.every((t) => teachersWithAvail.has(t.id))}>
                {`${teachers.filter((t) => teachersWithAvail.has(t.id)).length} of ${teachers.length} teachers have set their availability for ${year.label}. Teachers without it cannot be given lessons; ask them to add it in their portal.`}
              </Check>
              <Check ok={yearClasses.length === 0 || withoutTeacher.length === 0}>
                {withoutTeacher.length === 0 ? "Every class has a teacher." : `${withoutTeacher.length} class${withoutTeacher.length === 1 ? " has" : "es have"} no named teacher; any available teacher can be used (${withoutTeacher.slice(0, 4).map((c) => c.name).join(", ")}${withoutTeacher.length > 4 ? ", …" : ""}).`}
              </Check>
              {terms.filter((t) => t.academic_year_id === yearId).length === 0 && (
                <Check ok={false} fix={<Link href="/admin/academic#years" className="text-sm font-semibold underline">View terms</Link>}>No term dates are synced for {year.label}. Lessons are still generated, but term dates help later.</Check>
              )}
            </ul>
          )}
        </Step>

        <Step n={3} title="Generate" help="Creates a new DRAFT for you to review. It never touches a published timetable, so it is safe to run again." active={Boolean(year) && !needsSetup}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={busy || !year || waitingFrom !== null || yearClasses.length === 0} onClick={generate}>
              {waitingFrom !== null ? "Generating…" : busy ? "Starting…" : "Generate timetable"}
            </button>
            <button type="button" className={ghost} disabled={!year || busy} onClick={startBlank}>Start a blank draft instead</button>
            <button type="button" className={ghost} onClick={async () => { await loadRuns(); setMessage("Checked for new drafts."); }}>Check for a new draft</button>
          </div>
          {waitingFrom !== null && <p className="mt-3 text-sm text-ink/70">Working… this page will open the draft by itself when it is ready.</p>}
          {yearClasses.length === 0 && year && <p className="mt-3 text-xs text-ink/55">Add classes for {year.label} first (step 2).</p>}
        </Step>

        <Step n={4} title="Review, fix and publish" help="Click a lesson to change its teacher, day or time, or delete it. Click + to add one. Nothing goes live until you publish." active={Boolean(selectedRunRow)}>
          {runs === null && <p className="text-sm text-ink/60">Loading…</p>}
          {runs && runs.length === 0 && <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">No timetable yet. Complete steps 1 to 3, then your draft appears here.</p>}
          {runs && runs.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block text-xs font-medium text-ink/70">
                  Version
                  <select value={selectedRun || ""} onChange={(e) => setSelectedRun(e.target.value)} className="mt-1 block max-w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink">
                    {runs.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.status} · {r.created_at.slice(0, 10)}</option>)}
                  </select>
                </label>
                {selectedRunRow && (selectedRunRow.status === "draft" || selectedRunRow.status === "review") && (
                  <button type="button" onClick={publish} disabled={hardConflicts.length > 0} className={btn} title={hardConflicts.length > 0 ? "Resolve hard conflicts before publishing" : undefined}>Publish timetable</button>
                )}
                {selectedRunRow && (selectedRunRow.status === "published" || selectedRunRow.status === "superseded") && (
                  <button type="button" onClick={() => rollback(selectedRunRow.id)} className={ghost}>Make an editable draft from this version</button>
                )}
              </div>
              {publishMessage && <p className="text-xs text-ink/70">{publishMessage}</p>}
              {hardConflicts.length > 0 && <p className="text-xs text-red-800">Publishing is blocked until the {hardConflicts.length} hard conflict{hardConflicts.length === 1 ? "" : "s"} below are resolved.</p>}
              {conflicts.length > 0 && (
                <div className="space-y-1">
                  {conflicts.map((c) => (
                    <p key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.severity === "hard" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>[{c.severity}] {c.message}</p>
                  ))}
                </div>
              )}
              {selectedRunRow && (
                <>
                  {!editable && <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">This version is {selectedRunRow.status} and read-only, so the live timetable cannot change by accident. Make an editable draft from it to change anything.</p>}
                  {slots.length === 0 && editable && <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">This draft has no lessons. Click + in the grid to add one, or generate again in step 3.</p>}
                  <WeeklyGrid
                    slots={slots}
                    teachers={teachers}
                    editable={Boolean(editable)}
                    onEdit={(s) => setEditor({ slot: s, weekday: s.weekday, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) })}
                    onAdd={(weekday, start, end) => setEditor({ slot: null, weekday, start, end })}
                  />
                  {legendClasses.length > 0 && (
                    <ul className="flex flex-wrap gap-2 text-xs">
                      {legendClasses.map((c) => {
                        const col = classColour(c.id);
                        const placed = placedByClass.get(c.id) || 0;
                        const short = placed < c.weekly_lessons;
                        return (
                          <li key={c.id} style={{ backgroundColor: col.bg, borderColor: col.border, color: col.text }} className="rounded-full border px-2.5 py-1">
                            {c.name}: {placed}/{c.weekly_lessons}{short ? " needs more" : ""}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="text-xs text-ink/50">Colour = class. The number shows lessons placed against lessons needed per week.</p>
                </>
              )}
            </div>
          )}
        </Step>

        {selectedRunRow && (
          <>
            <CoverForm slots={slots} teachers={teachers} onDone={() => loadRunDetail(selectedRunRow.id)} />
            {selectedRunRow.status === "published" && (
              <>
                <GenerateLessonsForm runId={selectedRunRow.id} onDone={() => setInstancesRefreshKey((k) => k + 1)} />
                <div className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
                  <h2 className="font-serif text-h3 font-semibold text-ink">Upcoming lesson instances</h2>
                  <UpcomingInstances runId={selectedRunRow.id} refreshKey={instancesRefreshKey} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {editor && selectedRunRow && (
        <SlotEditor
          slot={editor.slot}
          runId={selectedRunRow.id}
          academicYearId={selectedRunRow.academic_year_id}
          defaults={{ weekday: editor.weekday, start: editor.start, end: editor.end }}
          allSlots={slots}
          classes={runClasses}
          teachers={teachers}
          classTeachers={classTeachers}
          availability={availability}
          protectedTimes={protectedTimes}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            loadRunDetail(selectedRunRow.id);
          }}
        />
      )}
    </div>
  );
}

export default function AdminLessonsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <LessonsContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
