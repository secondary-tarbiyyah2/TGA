"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { WEEKDAYS, PERIODS, timeLabel, type TimetableSlot } from "@/lib/learn/timetable";

type Run = { id: string; label: string; status: string; academic_year_id: string; created_at: string; solver_stats: Record<string, unknown> | null };
type Conflict = { id: string; severity: "hard" | "soft"; message: string; resolved: boolean };
type Teacher = { id: string; full_name: string };

async function callFunction(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; detail?: string; run_id?: string }> {
  const supabase = getSupabaseClient();
  const url = getEdgeFunctionUrl(name);
  if (!supabase || !url) return { ok: false, error: "not_configured" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function RunPicker({ runs, selected, onSelect }: { runs: Run[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {runs.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            selected === r.id ? "border-gold-500 bg-gold-500 text-ink-900" : "border-gold-light/50 text-ink/70 hover:bg-cream"
          }`}
        >
          {r.label} · {r.status}
        </button>
      ))}
    </div>
  );
}

function EditableGrid({
  slots,
  teachers,
  onMoved,
}: {
  slots: TimetableSlot[];
  teachers: Teacher[];
  onMoved: () => void;
}) {
  const [dragSlotId, setDragSlotId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byCell = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    const key = `${s.weekday}-${s.start_time}`;
    byCell.set(key, [...(byCell.get(key) || []), s]);
  }

  const attemptMove = async (slotId: string, weekday: number, start: string, end: string) => {
    // Immediate client-side check (instant feedback only — never trusted
    // as the actual validation; see timetable-move's own comments).
    const conflictsLocally = slots.some(
      (s) =>
        s.id !== slotId &&
        s.weekday === weekday &&
        s.start_time < end &&
        start < s.end_time &&
        (s.teacher_user_id === slots.find((x) => x.id === slotId)?.teacher_user_id || s.class_id === slots.find((x) => x.id === slotId)?.class_id)
    );
    if (conflictsLocally) {
      setMessage("That slot looks double-booked — checking with the server anyway…");
    }
    const result = await callFunction("timetable-move", { slot_id: slotId, weekday, start_time: start, end_time: end });
    if (!result.ok) {
      setMessage(`Move rejected: ${result.detail || result.error}`);
    } else {
      setMessage(null);
      onMoved();
    }
  };

  return (
    <div>
      {message && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gold-light/50 p-2 font-semibold text-ink/70">Time</th>
              {WEEKDAYS.map((wd) => (
                <th key={wd.value} className="border-b border-gold-light/50 p-2 font-semibold text-ink/70">
                  {wd.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.start}>
                <td className="border-b border-gold-light/20 p-2 whitespace-nowrap text-ink/60">
                  {timeLabel(p.start)}–{timeLabel(p.end)}
                </td>
                {WEEKDAYS.map((wd) => {
                  const cell = byCell.get(`${wd.value}-${p.start}`) || [];
                  return (
                    <td
                      key={wd.value}
                      className="border-b border-gold-light/20 p-2 align-top"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragSlotId) attemptMove(dragSlotId, wd.value, p.start, p.end);
                        setDragSlotId(null);
                      }}
                    >
                      {cell.map((s) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={() => setDragSlotId(s.id)}
                          className="cursor-move rounded-lg border border-gold-500/40 bg-gold-500/10 p-2 text-xs font-medium text-ink"
                          title={teachers.find((t) => t.id === s.teacher_user_id)?.full_name || ""}
                        >
                          {s.subjects?.name}
                          <div className="text-[10px] font-normal text-ink/60">{s.classes?.name}</div>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink/50">Drag a lesson to a different day/time to move it. Every move is re-checked on the server before it&apos;s saved.</p>
    </div>
  );
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
      setMessage(`Could not assign cover: ${result.detail || result.error}`);
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
        <button type="button" onClick={assign} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900">
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
      setMessage(result.ok ? `Generated ${(result as { created?: number }).created ?? 0} lesson instance(s).` : `Could not generate: ${result.detail || result.error}`);
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
        <button type="button" disabled={busy} onClick={generate} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
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

type AcademicYear = { id: string; label: string };

/**
 * Replaces the previous "go do this manually on GitHub Actions" copy with a
 * real button (reported feedback: "the user explicitly does not want to
 * touch GitHub at all"). Calls the trigger-timetable-generation Edge
 * Function, which dispatches the SAME GitHub Actions workflow
 * (generate-timetable.yml) that a manual "Run workflow" click would — this
 * just removes the need to ever open GitHub to do it. The workflow still
 * runs on its own schedule in Actions and writes its result back to
 * timetable_runs as before; this page already polls that table (loadRuns,
 * via the "Check for a new draft" button below) to notice the result, since
 * there is no webhook-free way for the Edge Function itself to know when a
 * GitHub Actions run finishes.
 */
function GenerateTimetableForm({ academicYears, onDispatched }: { academicYears: AcademicYear[]; onDispatched: () => void }) {
  const [academicYearId, setAcademicYearId] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dispatch = async () => {
    const year = academicYears.find((y) => y.id === academicYearId);
    if (!year) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await callFunction("trigger-timetable-generation", { academic_year_label: year.label, run_label: runLabel.trim() || undefined });
      setMessage(
        result.ok
          ? "Started. This runs in the background and usually takes a couple of minutes — use \"Check for a new draft\" below, or just check back shortly; the new run will appear in the list once it's ready to review."
          : `Could not start timetable generation: ${result.detail || result.error}`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Generate timetable</h2>
      <p className="mt-1 text-sm text-ink/60">
        Runs the solver against the current classes, subjects, teachers and constraints, and creates a new DRAFT run for you
        to review below before publishing. Safe to run again — it never touches an already-published timetable.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-ink/70">Academic year</label>
          <select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
            <option value="">Choose…</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink/70">Label (optional)</label>
          <input value={runLabel} onChange={(e) => setRunLabel(e.target.value)} placeholder="e.g. Draft 2" className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
        </div>
        <button type="button" disabled={busy || !academicYearId} onClick={dispatch} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
          {busy ? "Starting…" : "Generate timetable"}
        </button>
        <button type="button" onClick={onDispatched} className="rounded-full border border-gold-light/60 px-4 py-2 text-xs text-ink/60 hover:bg-cream">
          Check for a new draft
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-ink/70">{message}</p>}
    </div>
  );
}

function LessonsContent() {
  const supabase = getSupabaseClient();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [instancesRefreshKey, setInstancesRefreshKey] = useState(0);

  const loadRuns = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("timetable_runs").select("id, label, status, academic_year_id, created_at, solver_stats").order("created_at", { ascending: false });
    const rows = (data as Run[]) || [];
    setRuns(rows);
    if (!selectedRun && rows.length > 0) setSelectedRun(rows[0].id);
  };

  const loadRunDetail = async (runId: string) => {
    if (!supabase) return;
    const [{ data: slotData }, { data: conflictData }] = await Promise.all([
      supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
        .eq("run_id", runId),
      supabase.from("timetable_conflicts").select("id, severity, message, resolved").eq("run_id", runId),
    ]);
    setSlots((slotData as unknown as TimetableSlot[]) || []);
    setConflicts((conflictData as Conflict[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadRuns();
    if (supabase) {
      supabase
        .from("profiles")
        .select("id, full_name, user_roles!inner(role)")
        .in("user_roles.role", ["teacher", "teaching_assistant_cover"])
        .then(({ data }) => setTeachers(((data as unknown as { id: string; full_name: string }[]) || []).map((r) => ({ id: r.id, full_name: r.full_name }))));
      supabase
        .from("academic_years")
        .select("id, label")
        .order("starts_on", { ascending: false })
        .then(({ data }) => setAcademicYears((data as AcademicYear[]) || []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (selectedRun) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selected-run data load, not a render-cycle sync
      loadRunDetail(selectedRun);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun]);

  const selectedRunRow = runs?.find((r) => r.id === selectedRun) || null;
  const hardConflicts = conflicts.filter((c) => c.severity === "hard" && !c.resolved);

  const publish = async () => {
    if (!selectedRun) return;
    const result = await callFunction("timetable-publish", { action: "publish", run_id: selectedRun });
    setPublishMessage(result.ok ? "Published." : `Could not publish: ${result.detail || result.error}`);
    if (result.ok) {
      await loadRuns();
    }
  };

  const rollback = async (runId: string) => {
    const result = await callFunction("timetable-publish", { action: "rollback", run_id: runId });
    setPublishMessage(result.ok ? "Rolled back — a new draft was created from that run; review then publish it." : `Could not roll back: ${result.detail || result.error}`);
    if (result.ok && result.run_id) {
      await loadRuns();
      setSelectedRun(result.run_id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Timetable</h1>
        <p className="mt-1 text-sm text-ink/60">New draft runs appear here for review, whichever way they were started.</p>
        {runs === null && <p className="mt-4 text-sm text-ink/60">Loading…</p>}
        {runs && runs.length === 0 && <p className="mt-4 text-sm text-ink/60">No timetable runs yet.</p>}
        {runs && runs.length > 0 && <div className="mt-4"><RunPicker runs={runs} selected={selectedRun} onSelect={setSelectedRun} /></div>}
      </div>

      <GenerateTimetableForm academicYears={academicYears} onDispatched={loadRuns} />

      {selectedRunRow && (
        <>
          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-h3 font-semibold text-ink">{selectedRunRow.label}</h2>
                <p className="text-xs text-ink/60">Status: {selectedRunRow.status}</p>
              </div>
              <div className="flex gap-2">
                {(selectedRunRow.status === "draft" || selectedRunRow.status === "review") && (
                  <button
                    type="button"
                    onClick={publish}
                    disabled={hardConflicts.length > 0}
                    className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-40"
                    title={hardConflicts.length > 0 ? "Resolve hard conflicts before publishing" : undefined}
                  >
                    Publish
                  </button>
                )}
                {(selectedRunRow.status === "published" || selectedRunRow.status === "superseded") && (
                  <button type="button" onClick={() => rollback(selectedRunRow.id)} className="rounded-full border border-gold-500 px-4 py-2 text-xs text-gold-700">
                    Roll back to this version
                  </button>
                )}
              </div>
            </div>
            {publishMessage && <p className="mt-2 text-xs text-ink/70">{publishMessage}</p>}

            {conflicts.length > 0 && (
              <div className="mt-4 space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Conflicts</h3>
                {conflicts.map((c) => (
                  <p key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.severity === "hard" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                    [{c.severity}] {c.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif text-h3 font-semibold text-ink">Grid</h2>
            <div className="mt-4">
              {selectedRunRow.status === "draft" ? (
                <EditableGrid slots={slots} teachers={teachers} onMoved={() => loadRunDetail(selectedRunRow.id)} />
              ) : (
                <p className="text-xs text-ink/60">Only a draft run can be edited manually — this run is {selectedRunRow.status}.</p>
              )}
            </div>
          </div>

          <CoverForm slots={slots} teachers={teachers} onDone={() => loadRunDetail(selectedRunRow.id)} />

          {selectedRunRow.status === "published" && (
            <>
              <GenerateLessonsForm runId={selectedRunRow.id} onDone={() => setInstancesRefreshKey((k) => k + 1)} />
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <h2 className="font-serif text-h3 font-semibold text-ink">Upcoming lesson instances</h2>
                <UpcomingInstances runId={selectedRunRow.id} refreshKey={instancesRefreshKey} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminLessonsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <LessonsContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
