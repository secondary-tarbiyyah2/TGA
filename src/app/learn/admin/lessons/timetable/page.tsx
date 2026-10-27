"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { SlotEditor } from "@/components/learn/timetable/SlotEditor";
import { WeeklyGrid } from "@/components/learn/timetable/WeeklyGrid";
import { CoverForm } from "@/components/learn/timetable/CoverForm";
import { btn, callFunction, chipCls, ghost, updateSlotLocked } from "@/components/learn/timetable/api";
import { ReconciliationPanel } from "@/components/learn/timetable/ReconciliationPanel";
import { coverageGaps, publishBlocker, slotIssues } from "@/components/learn/timetable/checks";
import { downloadCsv, printTimetable } from "@/components/learn/timetable/export";
import { moveWarnings, subjectColours, type Conflict, type LockableSlot } from "@/components/learn/timetable/types";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { edgeErrorMessage } from "@/lib/learn/edge";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimetableSlot } from "@/lib/learn/timetable";

type View = "all" | "class" | "teacher" | "session";
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "class", label: "By class" },
  { id: "teacher", label: "By teacher" },
  { id: "session", label: "By session" },
];

function TimetableContent() {
  const supabase = getSupabaseClient();
  const { data, reload } = useTimetableData();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [slots, setSlots] = useState<LockableSlot[]>([]);
  const [rerunBusy, setRerunBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [view, setView] = useState<View>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ slot: TimetableSlot | null; weekday: number; start: string; end: string } | null>(null);

  const runs = data.runs;
  // Default to the live (published) version, otherwise the newest draft.
  const runId = selectedRun || runs.find((r) => r.status === "published")?.id || runs[0]?.id || null;
  const run = runs.find((r) => r.id === runId) || null;

  const loadDetail = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const base = "id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)";
      // `locked` and `kind`/`details` exist once migration 0056 is applied; fall back without them.
      const [slotRes, conflictRes] = await Promise.all([
        supabase.from("timetable_slots").select(`${base}, locked`).eq("run_id", id),
        supabase.from("timetable_conflicts").select("id, severity, message, resolved, kind, details").eq("run_id", id),
      ]);
      const slotData = slotRes.error ? (await supabase.from("timetable_slots").select(base).eq("run_id", id)).data : slotRes.data;
      const conflictData = conflictRes.error ? (await supabase.from("timetable_conflicts").select("id, severity, message, resolved").eq("run_id", id)).data : conflictRes.data;
      setSlots((slotData as unknown as LockableSlot[]) || []);
      setConflicts((conflictData as Conflict[]) || []);
    },
    [supabase],
  );

  useEffect(() => {
    if (runId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selected-run data load
      loadDetail(runId);
    }
  }, [runId, loadDetail]);

  const colourOfSubject = useMemo(() => subjectColours(data.subjects), [data.subjects]);
  const teacherName = useCallback((id: string) => data.teachers.find((t) => t.id === id)?.full_name || "Teacher", [data.teachers]);
  const sessionName = useCallback((id: string | null) => (id ? data.sessions.find((s) => s.id === id)?.name || "" : ""), [data.sessions]);

  const editable = run?.status === "draft";
  const runYearId = run?.academic_year_id || "";
  const runClasses = data.classes.filter((c) => c.academic_year_id === runYearId || c.academic_year_id === null);
  const hasSessions = slots.some((s) => s.virtual_session_id);

  // Entities offered as chips for the current view.
  const entities: { id: string; label: string }[] = useMemo(() => {
    if (view === "class") return (editable ? runClasses : runClasses.filter((c) => slots.some((s) => s.class_id === c.id))).map((c) => ({ id: c.id, label: c.name }));
    if (view === "teacher") return data.teachers.filter((t) => slots.some((s) => s.teacher_user_id === t.id)).map((t) => ({ id: t.id, label: t.full_name }));
    if (view === "session") return data.sessions.filter((v) => slots.some((s) => s.virtual_session_id === v.id)).map((v) => ({ id: v.id, label: v.name }));
    return [];
  }, [view, editable, runClasses, slots, data.teachers, data.sessions]);
  const effFocus = view === "all" ? null : focus && entities.some((e) => e.id === focus) ? focus : entities[0]?.id || null;
  const shown = view === "all" ? slots : slots.filter((s) => (view === "class" ? s.class_id === effFocus : view === "teacher" ? s.teacher_user_id === effFocus : s.virtual_session_id === effFocus));

  const issues = useMemo(() => slotIssues(slots, data.teachers, data.availability, data.protectedTimes, runYearId, data.periods), [slots, data.teachers, data.availability, data.protectedTimes, runYearId, data.periods]);
  const flagged = useMemo(() => new Set(issues.map((i) => i.slotId)), [issues]);
  const gaps = useMemo(() => coverageGaps(slots, runClasses.filter((c) => c.academic_year_id === runYearId)), [slots, runClasses, runYearId]);
  const hardConflicts = conflicts.filter((c) => c.severity === "hard" && !c.resolved);
  const warningCount = issues.length + conflicts.length + gaps.length;

  const legendSubjects = data.subjects.filter((s) => slots.some((x) => x.subject_id === s.id));

  const moveSlot = async (slot: TimetableSlot, weekday: number, start: string, end: string): Promise<string | null> => {
    if (!supabase) return "Not connected.";
    const before = slots;
    setSlots((cur) => cur.map((s) => (s.id === slot.id ? { ...s, weekday, start_time: start, end_time: end } : s)));
    const error = await updateSlotLocked(supabase, slot.id, { weekday, start_time: start, end_time: end });
    if (error) {
      setSlots(before);
      if (error.code === "23P01" || /no_(teacher|class|session)_overlap/.test(error.message)) return "That clashes with another lesson (same teacher, class or session at the same time).";
      if (/permission|row-level|policy/i.test(error.message)) return "Your account isn't allowed to change this timetable.";
      return error.message;
    }
    return null;
  };

  // Offline re-check of the whole run before Publish (teacher in two places, class double-booked...).
  const blocker = useMemo(() => (run && (run.status === "draft" || run.status === "review") ? publishBlocker(slots, data.teachers) : null), [run, slots, data.teachers]);
  const lockedCount = slots.filter((s) => s.locked).length;

  const moveNotes = (slot: TimetableSlot, weekday: number, start: string, end: string) => moveWarnings(slot, weekday, start, end, slots, data.availability, data.protectedTimes, runYearId);

  const rerunKeepingLocked = async () => {
    if (!supabase || !run) return;
    const year = data.years.find((y) => y.id === run.academic_year_id);
    if (!year) return;
    setRerunBusy(true);
    setMessage(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: created, error } = await supabase
        .from("timetable_runs")
        .insert({ academic_year_id: run.academic_year_id, term_id: null, label: `${run.label} (re-run)`, status: "draft", generated_by: "manual", created_by: u.user?.id ?? null, solver_stats: { regenerate_pending: true, source_run_id: run.id } })
        .select("id")
        .single();
      if (error || !created) return setMessage(`Could not prepare the re-run: ${error?.message || "unknown error"}`);
      const keep = slots.filter((s) => s.locked).map((s) => ({ run_id: created.id, class_id: s.class_id, subject_id: s.subject_id, teacher_user_id: s.teacher_user_id, virtual_session_id: s.virtual_session_id, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time, locked: true }));
      if (keep.length > 0) {
        const { error: copyErr } = await supabase.from("timetable_slots").insert(keep);
        if (copyErr) {
          await supabase.from("timetable_runs").delete().eq("id", created.id);
          return setMessage(`Could not copy the locked lessons: ${copyErr.message}`);
        }
      }
      const result = await callFunction("trigger-timetable-generation", { academic_year_label: year.label, run_label: `${run.label} (re-run)` });
      await reload();
      setSelectedRun(created.id);
      setMessage(result.ok ? `Re-run started with ${keep.length} locked lesson${keep.length === 1 ? "" : "s"} kept. The solver fills the rest of the new draft in a couple of minutes; use Check for results.` : `The draft with your locked lessons was created, but the solver could not be started: ${edgeErrorMessage(result)}. Start "Generate timetable" in the Generate page; it will fill this draft.`);
    } finally {
      setRerunBusy(false);
    }
  };

  const publish = async () => {
    if (!runId) return;
    if (blocker) return setMessage(blocker);
    const result = await callFunction("timetable-publish", { action: "publish", run_id: runId });
    setMessage(result.ok ? "Published." : `Could not publish: ${edgeErrorMessage(result)}`);
    if (result.ok) await reload();
  };

  const rollback = async (id: string) => {
    const result = await callFunction("timetable-publish", { action: "rollback", run_id: id });
    setMessage(result.ok ? "Rolled back. A new draft was created from that version; review it, then publish." : `Could not roll back: ${edgeErrorMessage(result)}`);
    if (result.ok && result.run_id) {
      await reload();
      setSelectedRun(result.run_id);
    }
  };

  const title = `Timetable${run ? ` · ${run.label}` : ""}${effFocus ? ` · ${entities.find((e) => e.id === effFocus)?.label}` : ""}`;
  const exportActions = (
    <div className="flex gap-2">
      <button type="button" className={ghost} disabled={shown.length === 0} onClick={() => printTimetable(title, shown, teacherName)}>Print</button>
      <button type="button" className={ghost} disabled={shown.length === 0} onClick={() => downloadCsv("timetable.csv", shown, teacherName, sessionName)}>Export CSV</button>
    </div>
  );

  return (
    <div>
      <LessonsHeader title="Timetable" subtitle="The weekly grid. Drag a lesson to move it; click it to edit; nothing goes live until you publish." actions={exportActions} />
      {!data.loaded ? (
        <p className="text-sm text-ink/65">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-4 text-sm text-ink/70">
          No timetable yet. <Link href="/admin/lessons/generate" className="font-semibold underline">Generate one</Link> or start a blank draft.
        </p>
      ) : (
        <div className="space-y-4">
          {message && <p role="status" className="rounded-xl border border-teal-500/30 bg-teal-100/60 px-4 py-2 text-sm text-teal-900">{message}</p>}

          <div className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink/65">Version</span>
              {runs.slice(0, 4).map((r) => (
                <button key={r.id} type="button" aria-pressed={r.id === runId} onClick={() => setSelectedRun(r.id)} className={chipCls(r.id === runId)}>
                  {r.label} <span className="text-xs opacity-70">{r.status}</span>
                </button>
              ))}
              {runs.length > 4 && (
                <select aria-label="Older versions" value={runs.slice(4).some((r) => r.id === runId) ? runId || "" : ""} onChange={(e) => e.target.value && setSelectedRun(e.target.value)} className="rounded-full border border-gold-light bg-white px-3 py-1 text-sm text-ink/70">
                  <option value="">Older…</option>
                  {runs.slice(4).map((r) => <option key={r.id} value={r.id}>{r.label} · {r.status} · {r.created_at.slice(0, 10)}</option>)}
                </select>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink/65">View</span>
              {VIEWS.filter((v) => v.id !== "session" || hasSessions).map((v) => (
                <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => { setView(v.id); setFocus(null); }} className={chipCls(view === v.id)}>{v.label}</button>
              ))}
            </div>
            {view !== "all" && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Choose one">
                {entities.length === 0 && <span className="text-sm text-ink/65">Nothing to show for this view yet.</span>}
                {entities.map((e) => (
                  <button key={e.id} type="button" aria-pressed={e.id === effFocus} onClick={() => setFocus(e.id)} className={`${chipCls(e.id === effFocus)} !py-0.5 !text-xs`}>{e.label}</button>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gold-light/40 pt-3">
              {run && (run.status === "draft" || run.status === "review") && (
                <button type="button" onClick={publish} disabled={hardConflicts.length > 0 || Boolean(blocker)} className={btn} title={blocker ? "Teacher or class clashes must be fixed first" : hardConflicts.length > 0 ? "Resolve hard conflicts before publishing" : undefined}>Publish timetable</button>
              )}
              {run && (run.status === "published" || run.status === "superseded") && (
                <button type="button" onClick={() => rollback(run.id)} className={ghost}>Make an editable draft from this version</button>
              )}
              {run && !editable && <span className="text-xs text-ink/65">This version is {run.status} and read-only.</span>}
              {hardConflicts.length > 0 && <span className="text-xs text-red-800">Publishing blocked: {hardConflicts.length} hard conflict{hardConflicts.length === 1 ? "" : "s"}.</span>}
              {run?.solver_stats && (run.solver_stats as Record<string, unknown>).regenerate_pending === true && (
                <button type="button" className={ghost} onClick={async () => { await reload(); if (runId) await loadDetail(runId); }}>Check for results</button>
              )}
            </div>
            {blocker && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{blocker}</p>}
          </div>

          {slots.length === 0 && editable && <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">This draft has no lessons. Click + in the grid to add one, or <Link href="/admin/lessons/generate" className="font-semibold underline">generate again</Link>.</p>}

          <WeeklyGrid
            slots={shown}
            allSlots={slots}
            teachers={data.teachers}
            editable={Boolean(editable)}
            colourOf={(s) => colourOfSubject(s.subject_id)}
            flagged={flagged}
            onEdit={(s) => setEditor({ slot: s, weekday: s.weekday, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) })}
            onAdd={(weekday, start, end) => setEditor({ slot: null, weekday, start, end })}
            onMove={moveSlot}
            moveNotes={moveNotes}
            breaks={data.protectedTimes.filter((p) => p.academic_year_id === runYearId).map((p) => ({ weekday: p.weekday, start: p.start_time, end: p.end_time, name: p.name }))}
            periods={data.periods}
          />

          <ReconciliationPanel conflicts={conflicts} canRerun={Boolean(editable)} onRerun={rerunKeepingLocked} busy={rerunBusy} lockedCount={lockedCount} />

          {legendSubjects.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Subject colours">
              {legendSubjects.map((s) => {
                const c = colourOfSubject(s.id);
                return <li key={s.id} style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }} className="rounded-full border px-2.5 py-1">{s.name}</li>;
              })}
            </ul>
          )}

          <details className="rounded-2xl border border-gold-light/50 bg-white p-4" open={hardConflicts.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Warnings <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${warningCount ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>{warningCount || "none"}</span>
            </summary>
            <div className="mt-3 space-y-1">
              {conflicts.map((c) => <p key={c.id} className={`rounded-lg px-3 py-2 text-xs ${c.severity === "hard" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>[{c.severity}] {c.message}</p>)}
              {issues.map((i, n) => <p key={`${i.slotId}-${n}`} className={`rounded-lg px-3 py-2 text-xs ${i.level === "hard" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{i.text}</p>)}
              {gaps.map((g) => <p key={g.cls.id} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{g.cls.name}: {g.placed} of {g.cls.weekly_lessons} weekly lessons placed.</p>)}
              {warningCount === 0 && <p className="text-xs text-ink/65">No clashes, availability problems or missing lessons found. Lessons with a warning are outlined in red in the grid.</p>}
            </div>
          </details>

          <details className="rounded-2xl border border-gold-light/50 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Arrange cover for one lesson</summary>
            <div className="mt-3"><CoverForm slots={slots} teachers={data.teachers} onDone={() => runId && loadDetail(runId)} /></div>
          </details>
        </div>
      )}

      {editor && run && (
        <SlotEditor
          slot={editor.slot}
          runId={run.id}
          academicYearId={run.academic_year_id}
          defaults={{ weekday: editor.weekday, start: editor.start, end: editor.end }}
          allSlots={slots}
          classes={runClasses}
          teachers={data.teachers}
          classTeachers={data.classTeachers}
          subjectTeachers={data.subjectTeachers}
          availability={data.availability}
          protectedTimes={data.protectedTimes}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            loadDetail(run.id);
          }}
        />
      )}
    </div>
  );
}

export default function AdminTimetablePage() {
  return (
    <LessonsFrame>
      <TimetableContent />
    </LessonsFrame>
  );
}
