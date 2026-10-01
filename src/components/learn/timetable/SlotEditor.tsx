"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { WEEKDAYS, type TimetableSlot } from "@/lib/learn/timetable";
import { teacherFor, todayIso, type CstRow } from "@/lib/learn/teacherFor";
import { hhmm, moveProblem } from "./types";
import { insertSlotLocked, updateSlotLocked } from "./api";
import type { Availability, ClassOpt, ClassTeacherLink, Protected, Teacher } from "./types";

const field = "mt-1 w-full rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink";

/**
 * Edit / add one slot. Hard rules mirror the DB's EXCLUDE constraints from
 * migration 0008 (teacher, class and virtual session can't overlap within a
 * run) and are checked here first for a plain-English message; the database
 * still has the last word. Teacher availability and protected times are
 * advisory warnings (the DB can't express them).
 */
export function SlotEditor({
  slot,
  runId,
  academicYearId,
  defaults,
  allSlots,
  classes,
  teachers,
  classTeachers,
  subjectTeachers = [],
  availability,
  protectedTimes,
  onClose,
  onSaved,
}: {
  slot: TimetableSlot | null;
  runId: string;
  academicYearId: string;
  defaults: { weekday: number; start: string; end: string };
  allSlots: TimetableSlot[];
  classes: ClassOpt[];
  teachers: Teacher[];
  classTeachers: ClassTeacherLink[];
  subjectTeachers?: CstRow[];
  availability: Availability[];
  protectedTimes: Protected[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = getSupabaseClient();
  const [classId, setClassId] = useState(slot?.class_id || "");
  const [teacherId, setTeacherId] = useState(slot?.teacher_user_id || "");
  const [weekday, setWeekday] = useState(slot?.weekday ?? defaults.weekday);
  const [start, setStart] = useState(slot ? hhmm(slot.start_time) : defaults.start);
  const [end, setEnd] = useState(slot ? hhmm(slot.end_time) : defaults.end);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockIt, setLockIt] = useState(true);

  const effClassId = slot ? slot.class_id : classId;

  const warnings: string[] = [];
  if (teacherId && end > start) {
    const mine = availability.filter((a) => a.teacher_user_id === teacherId && a.academic_year_id === academicYearId && a.weekday === weekday);
    if (!mine.some((a) => hhmm(a.start_time) <= start && hhmm(a.end_time) >= end)) warnings.push("This teacher hasn't marked themselves available at this time.");
  }
  for (const p of protectedTimes) {
    if (p.academic_year_id === academicYearId && p.weekday === weekday && hhmm(p.start_time) < end && start < hhmm(p.end_time)) warnings.push(`This overlaps a protected time (${p.name}).`);
  }

  const effSubjectIdForProbe = slot ? slot.subject_id : classes.find((c) => c.id === effClassId)?.subject_id || "";
  const hardProblem = (): string | null => {
    if (!effClassId) return "Choose a class.";
    if (!teacherId) return "Choose a teacher.";
    if (!start || !end || end <= start) return "The end time must be after the start time.";
    // `allSlots` is every slot in the run (all classes, all year groups), so a
    // teacher teaching another class at this time is caught here too.
    const probe: TimetableSlot = slot || { id: "new", run_id: runId, class_id: effClassId, subject_id: effSubjectIdForProbe, teacher_user_id: teacherId, virtual_session_id: null, weekday, start_time: start, end_time: end };
    return moveProblem(probe, weekday, start, end, allSlots, teacherId);
  };

  const clashNow = teacherId && end > start && effClassId ? hardProblem() : null;

  const friendly = (message: string, code?: string): string => {
    if (code === "23P01" || /no_(teacher|class|session)_overlap/.test(message)) return "That clashes with another lesson (same teacher, class or session at the same time).";
    if (/permission|row-level|policy/i.test(message)) return "Your account isn't allowed to change this timetable.";
    return message;
  };

  const save = async () => {
    if (!supabase) return;
    const problem = hardProblem();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (slot) {
        const err = await updateSlotLocked(supabase, slot.id, { teacher_user_id: teacherId, weekday, start_time: start, end_time: end }, lockIt);
        if (err) return setError(friendly(err.message, err.code));
      } else {
        const cls = classes.find((c) => c.id === classId);
        if (!cls || !cls.subject_id) return setError("That class has no subject yet. Set one in Academic setup.");
        const err = await insertSlotLocked(supabase, { run_id: runId, class_id: classId, subject_id: cls.subject_id, teacher_user_id: teacherId, weekday, start_time: start, end_time: end }, lockIt);
        if (err) return setError(friendly(err.message, err.code));
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!supabase || !slot || !window.confirm("Delete this lesson from the timetable?")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("timetable_slots").delete().eq("id", slot.id);
      if (err) return setError(friendly(err.message, err.code));
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  // The teacher of THIS class's subject first (class_subject_teachers), then
  // the legacy class-scoped teachers.
  const effSubjectId = slot ? slot.subject_id : classes.find((c) => c.id === effClassId)?.subject_id || null;
  const mapped = effClassId && effSubjectId ? teacherFor(subjectTeachers, effClassId, effSubjectId, todayIso()) : null;
  const assigned = new Set([...(mapped ? [mapped] : []), ...classTeachers.filter((t) => t.scope_id === effClassId).map((t) => t.user_id)]);
  const sortedTeachers = [...teachers].sort((a, b) => Number(assigned.has(b.id)) - Number(assigned.has(a.id)) || a.full_name.localeCompare(b.full_name));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={slot ? "Edit lesson" : "Add lesson"}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <h3 className="font-serif text-h3 font-semibold text-ink">{slot ? "Edit lesson" : "Add a lesson"}</h3>
        {slot && <p className="mt-0.5 text-sm text-ink/60">{slot.classes?.name} · {slot.subjects?.name}</p>}
        <div className="mt-4 space-y-3">
          {!slot && (
            <label className="block text-xs font-medium text-ink/70">
              Class
              <select className={field} value={classId} onChange={(e) => {
                setClassId(e.target.value);
                const sid = classes.find((c) => c.id === e.target.value)?.subject_id;
                const t = sid ? teacherFor(subjectTeachers, e.target.value, sid, todayIso()) : null;
                if (t) setTeacherId(t);
              }}>
                <option value="">Choose…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-medium text-ink/70">
            Teacher
            <select className={field} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Choose…</option>
              {sortedTeachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{assigned.has(t.id) ? " (teaches this subject)" : ""}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium text-ink/70">
            Day
            <select className={field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink/70">Starts<input type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="block text-xs font-medium text-ink/70">Ends<input type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label className="flex items-start gap-2 text-xs text-ink/70">
            <input type="checkbox" checked={lockIt} onChange={(e) => setLockIt(e.target.checked)} className="mt-0.5" />
            <span>Keep this lesson fixed when the timetable is re-generated (&ldquo;Re-run keeping locked lessons&rdquo;).</span>
          </label>
        </div>
        {clashNow && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{clashNow} Saving is blocked until you change the teacher, day or time.</p>}
        {warnings.map((w) => <p key={w} className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{w} You can still save it.</p>)}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {slot ? <button type="button" onClick={remove} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Delete lesson</button> : <span />}
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">Cancel</button>
            <button type="button" onClick={save} disabled={busy || Boolean(clashNow)} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
