"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/learn/calendar";
import { Modal, ReasonModal, modalFieldCls } from "./ReasonModal";
import { formatDay, type Absence } from "./data";

type FStatus = "open" | "contacted" | "explained" | "escalated" | "closed";
type Method = "call" | "sms" | "email";
type Followup = { id: string; child_id: string; absence_date: string; status: FStatus; contact_method: Method | null; next_action_due: string | null; assigned: string | null };
type FEvent = { id: string; followup_id: string; kind: string; method: Method | null; outcome: string | null; note: string | null; created_at: string; who: string | null };

const OUTCOMES: { value: string; label: string }[] = [
  { value: "reached", label: "Spoke to a parent" },
  { value: "left_message", label: "Left a message" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "other", label: "Other" },
];
const STATUS_CHIP: Record<FStatus, string> = {
  open: "bg-amber-50 text-amber-900",
  contacted: "bg-sky-50 text-sky-900",
  explained: "bg-green-50 text-green-800",
  escalated: "bg-red-50 text-red-800",
  closed: "bg-slate-100 text-slate-700",
};

/** Whole weekdays after the absence date up to and including today. */
export function schoolDaysSince(dateKey: string, today: string): number {
  const d = new Date(`${dateKey}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  let n = 0;
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}
export function calendarAge(dateKey: string, today: string): number {
  return Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${dateKey}T12:00:00`).getTime()) / 86400000);
}

type Row = { key: string; abs: Absence; fu: Followup | null };

export function FollowUpTab({ absences, onChanged }: { absences: Absence[] | null; onChanged: () => void }) {
  const today = localDateKey(new Date());
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [events, setEvents] = useState<Record<string, FEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [contactRow, setContactRow] = useState<Row | null>(null);
  const [explainRow, setExplainRow] = useState<Row | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("absence_followups")
        .select("id, child_id, absence_date, status, contact_method, next_action_due, assignee:profiles!absence_followups_assigned_to_fkey(full_name)")
        .limit(2000);
      if (cancelled) return;
      type Raw = Omit<Followup, "assigned"> & { assignee?: { full_name: string } | null };
      const list = ((data as unknown as Raw[]) || []).map((f) => ({ ...f, assigned: f.assignee?.full_name || null }));
      setFollowups(list);
      const ids = list.map((f) => f.id);
      if (ids.length > 0) {
        const { data: ev } = await supabase
          .from("absence_followup_events")
          .select("id, followup_id, kind, method, outcome, note, created_at, author:profiles!absence_followup_events_created_by_fkey(full_name)")
          .in("followup_id", ids)
          .order("created_at", { ascending: false })
          .limit(3000);
        if (cancelled) return;
        const grouped: Record<string, FEvent[]> = {};
        for (const e of ((ev as unknown as (FEvent & { author?: { full_name: string } | null })[]) || [])) {
          (grouped[e.followup_id] ||= []).push({ ...e, who: e.author?.full_name || null });
        }
        setEvents(grouped);
      } else setEvents({});
      setError(err ? err.message : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Followup>();
    followups.forEach((f) => byKey.set(`${f.child_id}|${f.absence_date}`, f));
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const a of absences || []) {
      if (a.kind !== "unexplained" || (a.reasonCode && a.reasonCode !== "unknown")) continue;
      const key = `${a.childId}|${a.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fu = byKey.get(key) || null;
      if (fu && (fu.status === "explained" || fu.status === "closed")) continue;
      out.push({ key, abs: a, fu });
    }
    return out.sort((a, b) => a.abs.date.localeCompare(b.abs.date));
  }, [absences, followups]);

  /** Create the case row on first action. */
  const ensure = async (row: Row): Promise<string | null> => {
    if (row.fu) return row.fu.id;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data, error: err } = await supabase
      .from("absence_followups")
      .upsert({ child_id: row.abs.childId, absence_date: row.abs.date, assigned_to: userId }, { onConflict: "child_id,absence_date" })
      .select("id")
      .single();
    if (err || !data) {
      setError("Couldn't start a follow-up for that absence.");
      return null;
    }
    return (data as { id: string }).id;
  };

  const setStatus = async (row: Row, status: FStatus, note: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyKey(row.key);
    const id = await ensure(row);
    if (id) {
      const { error: e1 } = await supabase.from("absence_followups").update({ status }).eq("id", id);
      const { error: e2 } = await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "status", note });
      setError(e1 || e2 ? "Couldn't save that change. Please try again." : null);
    }
    setBusyKey(null);
    reload();
  };

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="border-b border-gold-light/60 px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Absences to follow up</h2>
        <p className="text-xs text-ink/65">No reason recorded and no note from the family. First contact is due within one school day.</p>
      </div>
      {error && <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
      <div className="px-4 py-4">
        {absences === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="py-4 text-center">
            <p className="font-medium text-ink">Nothing to follow up</p>
            <p className="mt-1 text-sm text-ink/60">Every recent absence has a reason.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const status: FStatus = r.fu?.status || "open";
              const overdue = status === "open" && schoolDaysSince(r.abs.date, today) > 1;
              const log = r.fu ? events[r.fu.id] || [] : [];
              return (
                <li key={r.key} className={`rounded-xl border p-3 ${overdue ? "border-red-300 bg-red-50/50" : "border-gold-light/60"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {r.abs.childName} <span className="font-normal text-ink/65">· {r.abs.className}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-ink/70">
                        Absent {formatDay(r.abs.date)} · {calendarAge(r.abs.date, today)} day{calendarAge(r.abs.date, today) === 1 ? "" : "s"} ago
                        {r.fu?.assigned ? ` · with ${r.fu.assigned}` : ""}
                      </p>
                      {overdue && <p className="mt-1 text-xs font-semibold text-red-800">Overdue: no first contact within one school day</p>}
                      {r.fu?.next_action_due && <p className="mt-0.5 text-xs text-ink/55">Next action due {formatDay(r.fu.next_action_due)}</p>}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_CHIP[status]}`}>{status}</span>
                  </div>
                  {log.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-gold-light pl-3 text-xs text-ink/65">
                      {log.map((e) => (
                        <li key={e.id}>
                          {new Date(e.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {e.who || "Staff"}
                          {e.kind === "contact" ? ` · ${e.method || ""} ${OUTCOMES.find((o) => o.value === e.outcome)?.label?.toLowerCase() || ""}` : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busyKey === r.key} onClick={() => setContactRow(r)} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
                      Log contact
                    </button>
                    <button type="button" disabled={busyKey === r.key} onClick={() => setExplainRow(r)} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
                      Mark explained
                    </button>
                    <Link
                      href="/report-concern"
                      onClick={() => {
                        if (status !== "escalated") void setStatus(r, "escalated", "Escalated to the Headteacher / safeguarding lead.");
                      }}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    >
                      Escalate to Headteacher
                    </Link>
                    <button type="button" disabled={busyKey === r.key} onClick={() => setStatus(r, "closed", "Closed without an explanation.")} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-semibold text-ink/60 hover:bg-cream disabled:opacity-50">
                      Close
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {contactRow && <ContactModal row={contactRow} ensure={ensure} onClose={() => setContactRow(null)} onSaved={reload} />}
      {explainRow && (
        <ReasonModal
          childId={explainRow.abs.childId}
          childName={explainRow.abs.childName}
          date={explainRow.abs.date}
          dateLabel={formatDay(explainRow.abs.date)}
          onClose={() => setExplainRow(null)}
          onSaved={reload}
        />
      )}
      <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/55">Contact logs are staff-only and written to the audit log. Families only see that we have asked.</p>
    </section>
  );
}

function ContactModal({ row, ensure, onClose, onSaved }: { row: Row; ensure: (r: Row) => Promise<string | null>; onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState<Method>("call");
  const [outcome, setOutcome] = useState("reached");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const id = await ensure(row);
    if (!id) {
      setBusy(false);
      return setError("Couldn't start a follow-up for that absence.");
    }
    const { error: e1 } = await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "contact", method, outcome, note: note.trim() || null });
    const { error: e2 } = await supabase
      .from("absence_followups")
      .update({ status: "contacted", contact_method: method, next_action_due: next || null })
      .eq("id", id);
    setBusy(false);
    if (e1 || e2) return setError("Couldn't save that contact. Please try again.");
    onSaved();
    onClose();
  };

  return (
    <Modal title={`Log contact: ${row.abs.childName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink/60">Absent {formatDay(row.abs.date)}</p>
        <label className="block text-sm font-medium text-ink">
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={modalFieldCls}>
            <option value="call">Phone call</option>
            <option value="sms">Text message</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Outcome
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={modalFieldCls}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Note
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={modalFieldCls} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Next action due (optional)
          <input type="date" value={next} onChange={(e) => setNext(e.target.value)} className={modalFieldCls} />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
          {busy ? "Saving…" : "Save contact"}
        </button>
      </form>
    </Modal>
  );
}
