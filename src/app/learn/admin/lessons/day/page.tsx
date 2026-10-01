"use client";

import { useState } from "react";
import { LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { btn, chipCls, fieldCls } from "@/components/learn/timetable/api";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { hhmm } from "@/components/learn/timetable/types";
import { PERIODS, WEEKDAYS } from "@/lib/learn/timetable";
import { getSupabaseClient } from "@/lib/supabase/client";

function DayContent() {
  const supabase = getSupabaseClient();
  const { data, reload } = useTimetableData();
  const [yearId, setYearId] = useState("");
  const effYearId = yearId || data.years[0]?.id || "";
  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState(5);
  const [start, setStart] = useState("12:30");
  const [end, setEnd] = useState("13:30");
  const [error, setError] = useState<string | null>(null);
  const protectedHere = data.protectedTimes.filter((p) => p.academic_year_id === effYearId);

  const add = async () => {
    if (!supabase || !effYearId) return;
    if (!name.trim()) return setError("Give the break a name, e.g. Jumu'ah.");
    if (end <= start) return setError("The end time must be after the start time.");
    setError(null);
    const { error: err } = await supabase.from("protected_times").insert({ name: name.trim(), academic_year_id: effYearId, weekday, start_time: start, end_time: end });
    if (err) return setError(err.message);
    setName("");
    await reload();
  };
  const remove = async (id: string) => {
    if (!supabase) return;
    const { error: err } = await supabase.from("protected_times").delete().eq("id", id);
    if (err) return setError(err.message);
    await reload();
  };

  return (
    <div>
      <LessonsHeader title="School day" subtitle="The lesson periods the timetable uses, and the breaks no lesson may overlap." />
      {!data.loaded ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
            <h2 className="font-serif text-h3 font-semibold text-ink">Lesson periods</h2>
            <p className="mt-0.5 text-sm text-ink/60">Two live-lesson bands, Monday to Friday. These are built into the timetable generator, so they are shown here for reference.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(["A", "B"] as const).map((band) => (
                <div key={band} className="rounded-xl bg-cream/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Band {band}</p>
                  <ul className="mt-1 space-y-0.5 text-sm tabular-nums text-ink">
                    {PERIODS.filter((p) => p.band === band).map((p) => <li key={p.start}>{p.start} – {p.end}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
            <h2 className="font-serif text-h3 font-semibold text-ink">Protected times</h2>
            <p className="mt-0.5 text-sm text-ink/60">Prayer or Jumu'ah breaks. Lessons that overlap one are flagged on the timetable.</p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Academic year">
              {data.years.map((y) => <button key={y.id} type="button" aria-pressed={y.id === effYearId} onClick={() => setYearId(y.id)} className={chipCls(y.id === effYearId)}>{y.label}</button>)}
            </div>
            {protectedHere.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">No protected times for this year.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gold-light/30">
                {[...protectedHere].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span><strong>{p.name}</strong> <span className="text-ink/60">{WEEKDAYS.find((w) => w.value === p.weekday)?.label || p.weekday} {hhmm(p.start_time)}–{hhmm(p.end_time)}</span></span>
                    <button type="button" onClick={() => remove(p.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            {effYearId && (
              <div className="mt-4 space-y-3 border-t border-gold-light/40 pt-4">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Day">
                  {WEEKDAYS.map((w) => <button key={w.value} type="button" aria-pressed={weekday === w.value} onClick={() => setWeekday(w.value)} className={chipCls(weekday === w.value)}>{w.short}</button>)}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium text-ink/70">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jumu'ah" className={fieldCls} /></label>
                  <label className="text-xs font-medium text-ink/70">From<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={fieldCls} /></label>
                  <label className="text-xs font-medium text-ink/70">To<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldCls} /></label>
                  <button type="button" onClick={add} className={btn}>Add protected time</button>
                </div>
                {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
            <h2 className="font-serif text-h3 font-semibold text-ink">Sessions (rooms)</h2>
            <p className="mt-0.5 text-sm text-ink/60">For an online school a room is a virtual session. {data.sessions.length === 0 ? "None are set up." : data.sessions.map((s) => s.name).join(", ")}</p>
          </section>
        </div>
      )}
    </div>
  );
}

export default function AdminSchoolDayPage() {
  return (
    <LessonsFrame>
      <DayContent />
    </LessonsFrame>
  );
}
