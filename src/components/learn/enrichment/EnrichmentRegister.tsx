"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateKey } from "@/lib/learn/calendar";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PERIOD_COLUMNS_WITH_SUPERVISOR, WEEKDAYS, attachSupervisorNames, normalisePeriods, type TimetablePeriod } from "@/lib/learn/timetable";

type RosterRow = { child_id: string; child_name: string; year_group: string | null };
type TickRow = { period_id: string; child_id: string; present: boolean };

const fieldCls = "rounded-lg border border-gold-light/70 bg-white px-3 py-2 text-sm text-ink";

/** 0 = Sunday .. 6 = Saturday, the same numbering timetable_periods.weekdays uses. */
const weekdayOf = (dateKey: string): number => new Date(`${dateKey}T12:00:00`).getDay();
const dayLabel = (n: number): string => WEEKDAYS.find((w) => w.value === n)?.label ?? "that day";

/**
 * The enrichment register. A supervisor ticks who joined each enrichment
 * block they run ("supervisor"); the head/admin sees every block for a date,
 * read-only ("admin"). Names come from enrichment_roster(), which only
 * returns rows to the block's supervisor and Headteacher/Admin.
 */
export function EnrichmentRegister({ mode }: { mode: "supervisor" | "admin" }) {
  const [periods, setPeriods] = useState<TimetablePeriod[] | null>(null);
  const [date, setDate] = useState<string>(() => localDateKey(new Date()));
  const [periodId, setPeriodId] = useState("");
  const [rosters, setRosters] = useState<Record<string, RosterRow[]>>({});
  const [ticks, setTicks] = useState<TickRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The enrichment blocks this person may see: their own, or all of them.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const res = await supabase.from("timetable_periods").select(PERIOD_COLUMNS_WITH_SUPERVISOR).eq("kind", "enrichment").eq("active", true);
      if (!alive) return;
      if (res.error) {
        setError("Enrichment supervision isn't switched on yet. It will work once the latest database update is applied.");
        setPeriods([]);
        return;
      }
      let rows = normalisePeriods(res.data as unknown as Parameters<typeof normalisePeriods>[0]);
      if (mode === "supervisor") rows = rows.filter((p) => user && p.supervisor_user_id === user.id);
      rows = await attachSupervisorNames(rows);
      if (alive) setPeriods(rows);
    })();
    return () => {
      alive = false;
    };
  }, [mode]);

  const shown = useMemo(() => (periods || []).filter((p) => p.weekdays.includes(weekdayOf(date))), [periods, date]);
  const shownKey = shown.map((p) => p.id).join(",");
  const activeId = shown.some((p) => p.id === periodId) ? periodId : shown[0]?.id || "";
  const visible = mode === "admin" ? shown : shown.filter((p) => p.id === activeId);
  const visibleKey = visible.map((p) => p.id).join(",");

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    const ids = visibleKey ? visibleKey.split(",") : [];
    if (!supabase || ids.length === 0) {
      setRosters({});
      setTicks([]);
      return;
    }
    const [rosterResults, tickRes] = await Promise.all([
      Promise.all(ids.map((id) => supabase.rpc("enrichment_roster", { p_period_id: id }))),
      supabase.from("enrichment_attendance").select("period_id, child_id, present").eq("attendance_date", date).in("period_id", ids),
    ]);
    const next: Record<string, RosterRow[]> = {};
    ids.forEach((id, i) => {
      next[id] = ((rosterResults[i].data as unknown as RosterRow[] | null) || []).slice();
    });
    setRosters(next);
    setTicks((tickRes.data as unknown as TickRow[] | null) || []);
  }, [visibleKey, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load keyed on the chosen block and date
    load();
  }, [load, shownKey]);

  const presentFor = (pid: string, childId: string): boolean | undefined => ticks.find((t) => t.period_id === pid && t.child_id === childId)?.present;

  const mark = async (pid: string, childIds: string[], present: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase || childIds.length === 0) return;
    setBusy(childIds.length === 1 ? childIds[0] : "all");
    setError(null);
    const { error: err } = await supabase
      .from("enrichment_attendance")
      .upsert(
        childIds.map((child_id) => ({ period_id: pid, attendance_date: date, child_id, present })),
        { onConflict: "period_id,attendance_date,child_id" },
      );
    setBusy(null);
    if (err) return setError(`Could not save: ${err.message}`);
    setTicks((prev) => [...prev.filter((t) => !(t.period_id === pid && childIds.includes(t.child_id))), ...childIds.map((child_id) => ({ period_id: pid, child_id, present }))]);
  };

  if (periods === null) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-ink/70">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || localDateKey(new Date()))} className={`${fieldCls} mt-1 block`} />
        </label>
        {mode === "supervisor" && shown.length > 1 && (
          <label className="text-xs font-medium text-ink/70">
            Block
            <select value={activeId} onChange={(e) => setPeriodId(e.target.value)} className={`${fieldCls} mt-1 block`}>
              {shown.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.start_time}-{p.end_time}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {periods.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">
          {mode === "supervisor" ? "You are not set as the supervisor of any enrichment block." : "No enrichment blocks are switched on."}
        </p>
      )}
      {periods.length > 0 && shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-gold-light bg-cream/60 px-4 py-3 text-sm text-ink/70">
          {mode === "supervisor" ? "You don't supervise an enrichment block on" : "There is no enrichment block on"} {dayLabel(weekdayOf(date))}s. Pick another date.
        </p>
      )}

      {visible.map((p) => {
        const roster = rosters[p.id] || [];
        const joined = roster.filter((r) => presentFor(p.id, r.child_id) === true).length;
        const unticked = roster.filter((r) => presentFor(p.id, r.child_id) === undefined);
        return (
          <section key={p.id} className="rounded-2xl border border-gold-light/50 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/50 px-5 py-3">
              <div>
                <h2 className="font-serif text-h3 font-semibold text-ink">
                  {p.name}
                  {p.activity ? <span className="ml-2 text-sm font-normal text-ink/60">{p.activity}</span> : null}
                </h2>
                <p className="text-xs text-ink/60">
                  {p.start_time}-{p.end_time}
                  {p.supervisor_name ? ` · supervised by ${p.supervisor_name}` : " · no supervisor set"}
                </p>
              </div>
              <p className="text-sm text-ink/70">
                <span className="font-semibold text-ink">
                  {joined}/{roster.length}
                </span>{" "}
                joined
              </p>
            </div>
            {roster.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink/60">No enrolled children are down for this block.</p>
            ) : (
              <>
                {mode === "supervisor" && unticked.length > 0 && (
                  <div className="border-b border-gold-light/40 px-5 py-2">
                    <button type="button" disabled={busy !== null} onClick={() => mark(p.id, unticked.map((r) => r.child_id), true)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
                      Tick everyone who is left
                    </button>
                  </div>
                )}
                <ul className="divide-y divide-gold-light/40">
                  {roster.map((r) => {
                    const state = presentFor(p.id, r.child_id);
                    return (
                      <li key={r.child_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">
                          {r.child_name}
                          {r.year_group ? <span className="ml-2 font-normal text-ink/65">{r.year_group}</span> : null}
                        </span>
                        {mode === "supervisor" ? (
                          <label className="flex items-center gap-2 text-ink/80">
                            <input type="checkbox" checked={state === true} disabled={busy !== null} onChange={(e) => mark(p.id, [r.child_id], e.target.checked)} />
                            Joined
                          </label>
                        ) : (
                          <span className={state === true ? "font-medium text-green-800" : state === false ? "font-medium text-red-800" : "text-ink/65"}>
                            {state === true ? "Joined" : state === false ? "Did not join" : "Not ticked"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
