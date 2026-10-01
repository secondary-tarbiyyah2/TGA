"use client";

import { useEffect, useMemo, useState } from "react";
import { btn, chipCls, fieldCls, ghost } from "@/components/learn/timetable/api";
import { supervisorClashes } from "@/components/learn/timetable/checks";
import type { Teacher } from "@/components/learn/timetable/types";
import { AUDIENCES, ENRICHMENT_ACTIVITIES, FALLBACK_PERIODS, KIND_STYLE, PERIOD_KINDS, WEEKDAYS, getPublishedRunId, type PeriodKind, type TimetablePeriod, type TimetableSlot } from "@/lib/learn/timetable";
import { getSupabaseClient } from "@/lib/supabase/client";

type Draft = {
  id: string | null;
  name: string;
  kind: PeriodKind;
  start: string;
  end: string;
  weekdays: number[];
  applies: string[];
  activity: string;
  supervisor: string;
  active: boolean;
};

const BLANK: Draft = { id: null, name: "", kind: "lesson", start: "09:00", end: "10:00", weekdays: [1, 2, 3, 4, 5], applies: ["all"], activity: "", supervisor: "", active: true };

const daysLabel = (days: number[]): string => {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === "1,2,3,4,5") return "Mon-Fri";
  return sorted.map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? String(d)).join(", ");
};
const audienceLabel = (applies: string[]): string => (applies.includes("all") ? "Everyone" : applies.map((a) => AUDIENCES.find((x) => x.value === a)?.label ?? a).join(", "));

const sharesAudience = (a: string[], b: string[]): boolean => a.includes("all") || b.includes("all") || a.some((x) => b.includes(x));

/** Add, edit and remove the blocks of the school day: lessons, breaks, lunch, prayer and supervised enrichment. */
export function PeriodsEditor({ periods, reload, staff = [] }: { periods: TimetablePeriod[]; reload: () => Promise<void>; staff?: Teacher[] }) {
  const supabase = getSupabaseClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);

  // The published timetable, so a supervisor who is also teaching can be flagged.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const runId = await getPublishedRunId();
      if (!runId) return;
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
        .eq("run_id", runId);
      if (alive) setSlots((data as unknown as TimetableSlot[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const staffName = (id: string | null | undefined): string => (id ? staff.find((t) => t.id === id)?.full_name || "" : "");
  const rowClashes = useMemo(() => supervisorClashes(slots, periods, staff), [slots, periods, staff]);
  const draftClashes = useMemo(() => {
    if (!draft || draft.kind !== "enrichment" || !draft.supervisor) return [];
    const asPeriod: TimetablePeriod = { id: draft.id ?? "draft", name: draft.name.trim() || "this block", kind: "enrichment", start_time: draft.start, end_time: draft.end, weekdays: draft.weekdays, band: null, applies_to: draft.applies, activity: null, sort: 0, active: true, supervisor_user_id: draft.supervisor };
    return supervisorClashes(slots, [asPeriod], staff);
  }, [draft, slots, staff]);

  const sorted = [...periods].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.sort - b.sort);
  const lessonCount = periods.filter((p) => p.kind === "lesson" && p.active).length;

  const edit = (p: TimetablePeriod) => {
    setError(null);
    setDraft({ id: p.id, name: p.name, kind: p.kind, start: p.start_time, end: p.end_time, weekdays: p.weekdays, applies: p.applies_to, activity: p.activity || "", supervisor: p.supervisor_user_id || "", active: p.active });
  };

  const save = async () => {
    if (!supabase || !draft) return;
    const name = draft.name.trim();
    if (!name) return setError("Give the period a name, e.g. Period 1 or Games & play.");
    if (!draft.start || !draft.end || draft.end <= draft.start) return setError("The end time must be after the start time.");
    if (draft.weekdays.length === 0) return setError("Choose at least one day.");
    if (draft.applies.length === 0) return setError("Choose who this is for.");
    if (draft.kind === "lesson") {
      const clash = periods.find((p) => p.id !== draft.id && p.active && p.kind === "lesson" && draft.active && p.start_time < draft.end && draft.start < p.end_time && p.weekdays.some((d) => draft.weekdays.includes(d)) && sharesAudience(p.applies_to, draft.applies));
      if (clash) return setError(`This overlaps the lesson period "${clash.name}" (${clash.start_time}-${clash.end_time}) for the same people. Change the times or who it is for.`);
    }
    setBusy(true);
    setError(null);
    const row = {
      name,
      kind: draft.kind,
      start_time: draft.start,
      end_time: draft.end,
      weekdays: [...draft.weekdays].sort((a, b) => a - b),
      applies_to: draft.applies,
      activity: draft.kind === "enrichment" && draft.activity.trim() ? draft.activity.trim() : null,
      supervisor_user_id: draft.kind === "enrichment" && draft.supervisor ? draft.supervisor : null,
      band: draft.start < "14:00" ? "A" : "B",
      sort: Number(draft.start.replace(":", "")),
      active: draft.active,
    };
    const { error: err } = draft.id ? await supabase.from("timetable_periods").update(row).eq("id", draft.id) : await supabase.from("timetable_periods").insert(row);
    setBusy(false);
    if (err) return setError(err.message);
    setDraft(null);
    await reload();
  };

  const remove = async (p: TimetablePeriod) => {
    if (!supabase) return;
    if (typeof window !== "undefined" && !window.confirm(`Remove "${p.name}" (${p.start_time}-${p.end_time})?`)) return;
    setError(null);
    const { error: err } = await supabase.from("timetable_periods").delete().eq("id", p.id);
    if (err) return setError(err.message);
    await reload();
  };

  const toggleActive = async (p: TimetablePeriod) => {
    if (!supabase) return;
    setError(null);
    const { error: err } = await supabase.from("timetable_periods").update({ active: !p.active }).eq("id", p.id);
    if (err) return setError(err.message);
    await reload();
  };

  const loadStarter = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const rows = FALLBACK_PERIODS.map((p) => ({ name: p.name, kind: p.kind, start_time: p.start_time, end_time: p.end_time, weekdays: p.weekdays, applies_to: p.applies_to, band: p.band, activity: p.activity, sort: p.sort, active: true }));
    const { error: err } = await supabase.from("timetable_periods").insert(rows);
    setBusy(false);
    if (err) return setError(err.message);
    await reload();
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleIn = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleAudience = (list: string[], v: string): string[] => {
    if (v === "all") return ["all"];
    const without = list.filter((x) => x !== "all");
    return without.includes(v) ? without.filter((x) => x !== v) : [...without, v];
  };

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-h3 font-semibold text-ink">School day</h2>
          <p className="mt-0.5 text-sm text-ink/60">
            Lessons, breaks, lunch, prayer and supervised enrichment (games, play, nasheed, reading club...). The timetable generator places lessons only in lesson periods. Enrichment and breaks appear on every timetable and calendar but have no teacher, so they never clash.
          </p>
        </div>
        {!draft && (
          <button type="button" className={btn} onClick={() => { setError(null); setDraft({ ...BLANK }); }}>
            Add a period
          </button>
        )}
      </div>

      {periods.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">
          <p>No periods are stored yet, so the built-in day is used (two bands, three lessons each, Monday to Friday).</p>
          <button type="button" className={`${ghost} mt-2`} onClick={loadStarter} disabled={busy}>
            Load the starter day to edit it
          </button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-gold-light/30">
          {sorted.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 text-sm ${p.active ? "" : "opacity-50"}`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[p.kind].chip}`}>{KIND_STYLE[p.kind].label}</span>
                <strong className="tabular-nums">{p.start_time}-{p.end_time}</strong>
                <span>{p.name}</span>
                {p.kind === "enrichment" && p.activity ? <span className="text-ink/60">({p.activity})</span> : null}
                {p.kind === "enrichment" && p.supervisor_user_id ? <span className="text-ink/60">supervised by {p.supervisor_name || staffName(p.supervisor_user_id) || "a member of staff"}</span> : null}
                {rowClashes.some((c) => c.periodId === p.id) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Supervisor is teaching then</span> : null}
                <span className="text-xs text-ink/50">{daysLabel(p.weekdays)} · {audienceLabel(p.applies_to)}{p.active ? "" : " · off"}</span>
              </span>
              <span className="flex gap-1">
                <button type="button" onClick={() => toggleActive(p)} className="rounded-lg px-2 py-1 text-xs font-medium text-ink/70 hover:bg-cream">{p.active ? "Turn off" : "Turn on"}</button>
                <button type="button" onClick={() => edit(p)} className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-cream">Edit</button>
                <button type="button" onClick={() => remove(p)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {periods.length > 0 && lessonCount === 0 && <p className="mt-2 text-xs text-amber-800">No lesson periods are switched on, so the built-in lesson periods are used.</p>}

      {draft && (
        <div className="mt-4 space-y-3 border-t border-gold-light/40 pt-4">
          <p className="text-sm font-semibold text-ink">{draft.id ? "Edit period" : "New period"}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-ink/70">
              Kind
              <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as PeriodKind })} className={fieldCls}>
                {PERIOD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-ink/70">
              Name
              <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={draft.kind === "enrichment" ? "Enrichment" : draft.kind === "lesson" ? "Period 7" : "Break"} className={fieldCls} />
            </label>
            <label className="text-xs font-medium text-ink/70">
              From
              <input type="time" value={draft.start} onChange={(e) => set({ start: e.target.value })} className={fieldCls} />
            </label>
            <label className="text-xs font-medium text-ink/70">
              To
              <input type="time" value={draft.end} onChange={(e) => set({ end: e.target.value })} className={fieldCls} />
            </label>
          </div>
          {draft.kind === "enrichment" && (
            <label className="block text-xs font-medium text-ink/70">
              What happens (pick a suggestion or type your own)
              <input list="enrichment-activities" value={draft.activity} onChange={(e) => set({ activity: e.target.value })} placeholder="Games & play" className={fieldCls} />
              <datalist id="enrichment-activities">
                {ENRICHMENT_ACTIVITIES.map((a) => <option key={a} value={a} />)}
              </datalist>
            </label>
          )}
          {draft.kind === "enrichment" && (
            <div>
              <label className="block text-xs font-medium text-ink/70">
                Supervised by
                <select value={draft.supervisor} onChange={(e) => set({ supervisor: e.target.value })} className={fieldCls}>
                  <option value="">No supervisor yet</option>
                  {staff.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </label>
              <p className="mt-1 text-xs text-ink/50">The supervisor is shown on timetables and calendars, and ticks who joined from Teaching, Enrichment.</p>
              {draftClashes.length > 0 && (
                <ul role="status" className="mt-2 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {draftClashes.slice(0, 4).map((c) => <li key={c.slotId}>{c.text}</li>)}
                  {draftClashes.length > 4 && <li>…and {draftClashes.length - 4} more.</li>}
                </ul>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-ink/70">Days</p>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Days">
              {WEEKDAYS.map((w) => <button key={w.value} type="button" aria-pressed={draft.weekdays.includes(w.value)} onClick={() => set({ weekdays: toggleIn(draft.weekdays, w.value) })} className={chipCls(draft.weekdays.includes(w.value))}>{w.short}</button>)}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink/70">For</p>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Who this is for">
              {AUDIENCES.map((a) => <button key={a.value} type="button" aria-pressed={draft.applies.includes(a.value)} onClick={() => set({ applies: toggleAudience(draft.applies, a.value) })} className={chipCls(draft.applies.includes(a.value))}>{a.label}</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
            Switched on
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={save} disabled={busy}>{draft.id ? "Save changes" : "Add period"}</button>
            <button type="button" className={ghost} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
          </div>
          {draft.kind === "lesson" && <p className="text-xs text-ink/50">Changes to lesson periods apply the next time you generate a timetable. Lessons already in a draft or published timetable are not moved.</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    </section>
  );
}
