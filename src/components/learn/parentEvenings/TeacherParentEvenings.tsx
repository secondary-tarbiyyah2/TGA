"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/learn/edge";
import {
  EVENING_COLUMNS,
  EVENING_STATUS_META,
  bookingErrorMessage,
  formatDay,
  formatTime,
  generateSlots,
  type ParentEvening,
} from "@/lib/learn/parentEvenings";

type Row = { evening_id: string; join_url: string | null; parent_evenings: ParentEvening | null };
type ScheduleRow = { booking_id: string; child_name: string; parent_name: string; slot_start: string; slot_end: string; join_url: string | null };

function EveningCard({ row, ev }: { row: Row; ev: ParentEvening }) {
  const supabase = getSupabaseClient();
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [link, setLink] = useState(row.join_url || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("my_parent_evening_schedule", { p_evening_id: ev.id });
    setSchedule((data as ScheduleRow[] | null) || []);
  }, [supabase, ev.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const saveLink = async () => {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.rpc("set_parent_evening_join_url", { p_evening_id: ev.id, p_url: link });
      setMsg(error ? bookingErrorMessage(error.message) : "Meeting link saved.");
      if (!error) await load();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (b: ScheduleRow) => {
    if (!supabase) return;
    if (!window.confirm(`Cancel the meeting with ${b.parent_name} (${b.child_name}) at ${formatTime(b.slot_start)}? The parent will be emailed.`)) return;
    const { error } = await supabase.rpc("cancel_parent_evening_booking", { p_booking_id: b.booking_id });
    if (error) {
      setMsg(bookingErrorMessage(error.message));
      return;
    }
    await callEdgeFunction("parent-evening-confirm", { booking_id: b.booking_id, event: "cancelled" });
    await load();
  };

  const total = generateSlots(ev).length;
  const meta = EVENING_STATUS_META[ev.status];

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-h3 font-semibold text-ink">{ev.title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>
      </div>
      <p className="mt-1 text-sm text-ink/70">
        {formatDay(ev.starts_at)}, {formatTime(ev.starts_at)}–{formatTime(ev.ends_at)} · {ev.slot_minutes}-minute meetings
        {ev.location ? ` · ${ev.location}` : ""}
      </p>

      <div className="mt-4">
        <label className="block text-xs font-medium text-ink/70" htmlFor={`pe-link-${ev.id}`}>
          Your online meeting link (optional — parents get it with their booking)
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id={`pe-link-${ev.id}`}
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={ev.join_url ? `Default: ${ev.join_url}` : "https://…"}
            className="min-w-0 flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm"
          />
          <button type="button" disabled={busy} onClick={saveLink} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900 disabled:opacity-50">
            Save link
          </button>
        </div>
        {msg && <p className="mt-1 text-xs text-ink/70">{msg}</p>}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-ink">
        Your schedule <span className="font-normal text-ink/60">· {schedule ? schedule.length : 0} of {total} slots booked</span>
      </h3>
      {schedule === null ? (
        <p className="mt-2 text-sm text-ink/60">Loading…</p>
      ) : schedule.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No bookings yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gold-light/30 rounded-lg border border-gold-light/40">
          {schedule.map((b) => (
            <li key={b.booking_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium text-ink">{formatTime(b.slot_start)}–{formatTime(b.slot_end)}</span>
                <span className="text-ink/70"> · {b.child_name} (parent: {b.parent_name})</span>
              </span>
              <span className="flex items-center gap-3">
                {b.join_url && (
                  <a href={b.join_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-900">
                    Join
                  </a>
                )}
                <button type="button" onClick={() => cancel(b)} className="text-xs text-red-700 underline">
                  Cancel
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Teacher area: each parent evening the teacher takes part in, with their booked meetings and join link. */
export function TeacherParentEvenings() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("parent_evening_teachers")
      .select(`evening_id, join_url, parent_evenings(${EVENING_COLUMNS})`)
      .then(({ data }) => {
        const list = ((data as unknown as Row[]) || []).filter((r) => r.parent_evenings);
        list.sort((a, b) => (a.parent_evenings?.starts_at || "").localeCompare(b.parent_evenings?.starts_at || ""));
        setRows(list);
      });
  }, [supabase]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <p className="text-sm text-ink/60">You haven&apos;t been added to a parent evening yet. The office adds teachers when an evening is set up.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {rows.map((r) => (r.parent_evenings ? <EveningCard key={r.evening_id} row={r} ev={r.parent_evenings} /> : null))}
    </div>
  );
}
