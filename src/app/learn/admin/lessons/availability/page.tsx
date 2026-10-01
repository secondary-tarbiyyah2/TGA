"use client";

import { useState } from "react";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { btn, chipCls, fieldCls } from "@/components/learn/timetable/api";
import { useTimetableData, type AvailabilityRow } from "@/components/learn/timetable/useTimetableData";
import { hhmm, type Teacher } from "@/components/learn/timetable/types";
import { WEEKDAYS } from "@/lib/learn/timetable";
import { getSupabaseClient } from "@/lib/supabase/client";

function TeacherRow({ teacher, rows, yearId, reload }: { teacher: Teacher; rows: AvailabilityRow[]; yearId: string; reload: () => Promise<void> }) {
  const supabase = getSupabaseClient();
  const [open, setOpen] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:15");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!supabase) return;
    if (end <= start) return setError("The end time must be after the start time.");
    setError(null);
    const { error: err } = await supabase.from("teacher_availability").insert({ teacher_user_id: teacher.id, academic_year_id: yearId, weekday, start_time: start, end_time: end });
    if (err) return setError(err.message);
    await reload();
  };
  const remove = async (id: string) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("teacher_availability").delete().eq("id", id);
    if (err) return setError(err.message);
    await reload();
  };

  return (
    <li className="py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left">
        <span className="w-48 shrink-0 truncate text-sm font-medium text-ink">{teacher.full_name}</span>
        {rows.length === 0 ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Not set</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => {
              const day = rows.filter((r) => r.weekday === w.value);
              return day.length ? <span key={w.value} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-900">{w.short} {day.map((d) => `${hhmm(d.start_time)}–${hhmm(d.end_time)}`).join(", ")}</span> : null;
            })}
          </span>
        )}
        <span className="ml-auto text-xs font-semibold text-gold-700">{open ? "Close" : "Edit"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-cream/60 p-3">
          {rows.length > 0 && (
            <ul className="space-y-1 text-sm">
              {[...rows].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>{WEEKDAYS.find((w) => w.value === r.weekday)?.label || r.weekday} {hhmm(r.start_time)}–{hhmm(r.end_time)}</span>
                  <button type="button" onClick={() => remove(r.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day">
            {WEEKDAYS.map((w) => <button key={w.value} type="button" aria-pressed={weekday === w.value} onClick={() => setWeekday(w.value)} className={chipCls(weekday === w.value)}>{w.short}</button>)}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-ink/70">From<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} /></label>
            <label className="text-xs font-medium text-ink/70">To<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} /></label>
            <button type="button" onClick={add} className={btn}>Add window</button>
          </div>
          {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
        </div>
      )}
    </li>
  );
}

function AvailabilityContent() {
  const { data, reload } = useTimetableData();
  const [yearId, setYearId] = useState("");
  const effYearId = yearId || data.years[0]?.id || "";
  const [show, setShow] = useState<"all" | "missing">("all");
  const rowsFor = (id: string) => data.availability.filter((a) => a.teacher_user_id === id && a.academic_year_id === effYearId);
  const missing = data.teachers.filter((t) => rowsFor(t.id).length === 0).length;
  const shown = show === "missing" ? data.teachers.filter((t) => rowsFor(t.id).length === 0) : data.teachers;

  return (
    <div>
      <LessonsHeader title="Teacher availability" subtitle="When each teacher can be given lessons. Teachers can also set this themselves in their portal." />
      {!data.loaded ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : data.years.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Add an academic year first.</p>
      ) : (
        <div className="space-y-4 rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {data.years.map((y) => <button key={y.id} type="button" aria-pressed={y.id === effYearId} onClick={() => setYearId(y.id)} className={chipCls(y.id === effYearId)}>{y.label}</button>)}
            <span className="mx-2 h-5 w-px bg-gold-light" aria-hidden="true" />
            <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")} className={chipCls(show === "all")}>All {data.teachers.length}</button>
            <button type="button" aria-pressed={show === "missing"} onClick={() => setShow("missing")} className={chipCls(show === "missing")}>Not set {missing}</button>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-ink/60">{data.teachers.length === 0 ? "No teachers yet. Add them under People." : "Every teacher has set their availability."}</p>
          ) : (
            <ul className="divide-y divide-gold-light/30">{shown.map((t) => <TeacherRow key={`${t.id}-${effYearId}`} teacher={t} rows={rowsFor(t.id)} yearId={effYearId} reload={reload} />)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminAvailabilityPage() {
  return (
    <LessonsFrame>
      <AvailabilityContent />
    </LessonsFrame>
  );
}
