"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { EmptyState, Notice, StatusChip, ui, type Tone } from "@/components/learn/ui";
import { Tabs } from "@/components/learn/Tabs";
import { Modal, ReasonModal, modalFieldCls } from "./ReasonModal";
import { formatDay, type Absence } from "./data";
import { Select } from "@/components/learn/Select";

type FStatus = "open" | "contacted" | "explained" | "escalated" | "closed";
type Method = "call" | "sms" | "email";
type Followup = {
  id: string;
  child_id: string;
  absence_date: string;
  status: FStatus;
  contact_method: Method | null;
  next_action_due: string | null;
  assigned: string | null;
  escalated_at: string | null;
  escalated_by_name: string | null;
  escalation_note: string | null;
  escalation_notified_at: string | null;
};
type FEvent = { id: string; followup_id: string; kind: string; method: Method | null; outcome: string | null; note: string | null; created_at: string; who: string | null };

const OUTCOMES: { value: string; label: string }[] = [
  { value: "reached", label: "Spoke to a parent" },
  { value: "left_message", label: "Left a message" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "other", label: "Other" },
];
const METHOD_LABEL: Record<Method, string> = { call: "Phone call", sms: "Text message", email: "Email" };
const STATUS: Record<FStatus, { label: string; tone: Tone }> = {
  open: { label: "Not contacted yet", tone: "warn" },
  contacted: { label: "Contacted", tone: "info" },
  explained: { label: "Explained", tone: "good" },
  escalated: { label: "Escalated", tone: "bad" },
  closed: { label: "Closed", tone: "neutral" },
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

const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

type Row = { key: string; abs: Absence; fu: Followup | null };
type Filter = "all" | "first" | "progress" | "escalated";

/** Why a case is overdue, or null. First contact is due within one school day; a set "next action" date is due on that day. */
function overdueReason(r: Row, today: string): string | null {
  const status: FStatus = r.fu?.status || "open";
  if (status === "open" && schoolDaysSince(r.abs.date, today) > 1) return "No first contact within one school day";
  if (status === "contacted" && r.fu?.next_action_due && r.fu.next_action_due < today) return `Next action was due ${formatDay(r.fu.next_action_due)}`;
  return null;
}

export function FollowUpTab({ absences, onChanged }: { absences: Absence[] | null; onChanged: () => void }) {
  const today = ukToday();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [events, setEvents] = useState<Record<string, FEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [contactRow, setContactRow] = useState<Row | null>(null);
  const [explainRow, setExplainRow] = useState<Row | null>(null);
  const [escalateRow, setEscalateRow] = useState<Row | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const reload = useCallback(() => {
    setTick((t) => t + 1);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const first = await supabase
        .from("absence_followups")
        .select(
          "id, child_id, absence_date, status, contact_method, next_action_due, escalated_at, escalation_note, escalation_notified_at, assignee:profiles!absence_followups_assigned_to_fkey(full_name), escalator:profiles!absence_followups_escalated_by_fkey(full_name)"
        )
        .limit(2000);
      let data: unknown = first.data;
      let err = first.error;
      // Before migration 0130 is applied the escalation columns don't exist yet.
      if (err) {
        const again = await supabase.from("absence_followups").select("id, child_id, absence_date, status, contact_method, next_action_due, assignee:profiles!absence_followups_assigned_to_fkey(full_name)").limit(2000);
        data = again.data;
        err = again.error;
      }
      if (cancelled) return;
      type Raw = Omit<Followup, "assigned" | "escalated_by_name"> & { assignee?: { full_name: string } | null; escalator?: { full_name: string } | null };
      const list = ((data as unknown as Raw[]) || []).map((f) => ({ ...f, assigned: f.assignee?.full_name || null, escalated_by_name: f.escalator?.full_name || null }));
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
        for (const e of (ev as unknown as (FEvent & { author?: { full_name: string } | null })[]) || []) {
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
    // Escalated first, then overdue, then oldest first.
    const rank = (r: Row) => (r.fu?.status === "escalated" ? 0 : overdueReason(r, today) ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.abs.date.localeCompare(b.abs.date));
  }, [absences, followups, today]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      first: rows.filter((r) => (r.fu?.status || "open") === "open").length,
      progress: rows.filter((r) => r.fu?.status === "contacted").length,
      escalated: rows.filter((r) => r.fu?.status === "escalated").length,
      overdue: rows.filter((r) => overdueReason(r, today)).length,
    }),
    [rows, today]
  );
  const shown = rows.filter((r) => {
    const s = r.fu?.status || "open";
    return filter === "all" || (filter === "first" && s === "open") || (filter === "progress" && s === "contacted") || (filter === "escalated" && s === "escalated");
  });

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
    setNotice(null);
    const id = await ensure(row);
    if (id) {
      const { error: e1 } = await supabase.from("absence_followups").update({ status }).eq("id", id);
      const { error: e2 } = await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "status", note });
      setError(e1 || e2 ? "Couldn't save that change. Please try again." : null);
    }
    setBusyKey(null);
    reload();
  };

  /** Ask the server to email the Headteacher / DSL about an escalated case. */
  const notifyHead = async (followupId: string): Promise<string | null> => {
    const res = await callEdgeFunction("absence-escalate", { followup_id: followupId });
    return res.ok ? null : edgeErrorMessage(res);
  };

  const retryNotify = async (row: Row) => {
    if (!row.fu) return;
    setBusyKey(row.key);
    const err = await notifyHead(row.fu.id);
    setBusyKey(null);
    setNotice(err ? { tone: "warn", text: `The email still couldn't be sent: ${err}` } : { tone: "good", text: "The Headteacher and safeguarding lead have been emailed." });
    reload();
  };

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gold-light/60 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Absences to follow up</h2>
          <p className="text-xs text-ink/65">No reason recorded and no note from the family. First contact is due within one school day.</p>
        </div>
        {counts.overdue > 0 && <StatusChip tone="bad">{counts.overdue} overdue</StatusChip>}
      </div>
      <div className="space-y-3 px-4 py-4">
        {error && <Notice tone="bad">{error}</Notice>}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {absences === null ? (
          <div className="h-24 motion-safe:animate-pulse rounded-xl bg-cream" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to follow up" icon="check" tile="tile-green">
            Every recent absence has a reason.
          </EmptyState>
        ) : (
          <>
            <Tabs
              variant="switch"
              label="Show follow-ups"
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all", label: "All", count: counts.all },
                { key: "first", label: "Not contacted", count: counts.first },
                { key: "progress", label: "Contacted", count: counts.progress },
                { key: "escalated", label: "Escalated", count: counts.escalated, countAlert: true },
              ]}
            />
            {shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/65">Nothing in this view.</p>
            ) : (
              <ul className="space-y-3">
                {shown.map((r) => (
                  <FollowUpCard
                    key={r.key}
                    row={r}
                    today={today}
                    log={r.fu ? events[r.fu.id] || [] : []}
                    busy={busyKey === r.key}
                    onContact={() => setContactRow(r)}
                    onExplain={() => setExplainRow(r)}
                    onEscalate={() => setEscalateRow(r)}
                    onClose={() => {
                      if (window.confirm(`Close the follow-up for ${r.abs.childName} without an explanation?`)) void setStatus(r, "closed", "Closed without an explanation.");
                    }}
                    onRetryNotify={() => void retryNotify(r)}
                  />
                ))}
              </ul>
            )}
          </>
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
      {escalateRow && (
        <EscalateModal
          row={escalateRow}
          ensure={ensure}
          notifyHead={notifyHead}
          onClose={() => setEscalateRow(null)}
          onDone={(text, tone) => {
            setNotice({ text, tone });
            reload();
          }}
        />
      )}
      <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/65">Contact logs are staff-only and written to the audit log. Families only see that we have asked.</p>
    </section>
  );
}

function FollowUpCard({
  row: r,
  today,
  log,
  busy,
  onContact,
  onExplain,
  onEscalate,
  onClose,
  onRetryNotify,
}: {
  row: Row;
  today: string;
  log: FEvent[];
  busy: boolean;
  onContact: () => void;
  onExplain: () => void;
  onEscalate: () => void;
  onClose: () => void;
  onRetryNotify: () => void;
}) {
  const status: FStatus = r.fu?.status || "open";
  const overdue = overdueReason(r, today);
  const days = schoolDaysSince(r.abs.date, today);
  const escalated = status === "escalated";
  return (
    <li className={`rounded-xl border bg-white p-3 sm:p-4 ${escalated ? "border-red-300" : overdue ? "border-amber-300" : "border-gold-light/70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {r.abs.childName} <span className="font-normal text-ink/65">· {r.abs.className}</span>
          </p>
          <p className="mt-0.5 text-sm text-ink/70">
            Absent {formatDay(r.abs.date)} · {days === 0 ? "today" : `${days} school day${days === 1 ? "" : "s"} ago`}
            {r.fu?.assigned ? ` · with ${r.fu.assigned}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {overdue && <StatusChip tone="warn">Overdue</StatusChip>}
          <StatusChip tone={STATUS[status].tone}>{STATUS[status].label}</StatusChip>
        </div>
      </div>

      {(overdue || r.fu?.next_action_due || (r.fu?.contact_method && status === "contacted")) && (
        <p className="mt-1.5 text-xs text-ink/70">
          {[overdue, !overdue && r.fu?.next_action_due ? `Next action due ${formatDay(r.fu.next_action_due)}` : "", status === "contacted" && r.fu?.contact_method ? `Last contact by ${METHOD_LABEL[r.fu.contact_method].toLowerCase()}` : ""].filter(Boolean).join(" · ")}
        </p>
      )}

      {escalated && r.fu && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-900">
          <p>
            Escalated{r.fu.escalated_by_name ? ` by ${r.fu.escalated_by_name}` : ""}
            {r.fu.escalated_at ? ` on ${stamp(r.fu.escalated_at)}` : ""}.{" "}
            {r.fu.escalation_notified_at ? "The Headteacher and safeguarding lead were emailed." : "Not emailed yet."}
          </p>
          {r.fu.escalation_note && <p className="mt-1 whitespace-pre-wrap text-red-900/90">&ldquo;{r.fu.escalation_note}&rdquo;</p>}
          {!r.fu.escalation_notified_at && (
            <button type="button" disabled={busy} onClick={onRetryNotify} className={`mt-1 ${ui.btnLink}`}>
              Send the email again
            </button>
          )}
        </div>
      )}

      {log.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-teal-700">Contact log ({log.length})</summary>
          <ul className="mt-1.5 space-y-1 border-l-2 border-gold-light pl-3 text-xs text-ink/70">
            {log.map((e) => (
              <li key={e.id}>
                {stamp(e.created_at)} · {e.who || "Staff"}
                {e.kind === "contact" ? ` · ${e.method ? METHOD_LABEL[e.method] : ""}: ${OUTCOMES.find((o) => o.value === e.outcome)?.label?.toLowerCase() || ""}` : ""}
                {e.note ? ` · ${e.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={onContact} className={`${ui.btnPrimary} ${ui.sm}`}>
          Log contact
        </button>
        <button type="button" disabled={busy} onClick={onExplain} className={`${ui.btnSecondary} ${ui.sm}`}>
          Mark explained
        </button>
        {!escalated && (
          <button type="button" disabled={busy} onClick={onEscalate} className={`${ui.btnSecondary} ${ui.sm} !border-red-300 !text-red-800 hover:!bg-red-50`}>
            Escalate to Headteacher
          </button>
        )}
        <button type="button" disabled={busy} onClick={onClose} className={`ml-auto ${ui.btnLink} !text-ink/65`}>
          Close case
        </button>
      </div>
    </li>
  );
}

/** Escalation stays on this page: mark the case escalated with an optional note, then email the Headteacher / DSL. */
function EscalateModal({
  row,
  ensure,
  notifyHead,
  onClose,
  onDone,
}: {
  row: Row;
  ensure: (r: Row) => Promise<string | null>;
  notifyHead: (id: string) => Promise<string | null>;
  onClose: () => void;
  onDone: (text: string, tone: "good" | "warn") => void;
}) {
  const [note, setNote] = useState("");
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
    const text = note.trim();
    const { error: e1 } = await supabase.from("absence_followups").update({ status: "escalated", escalation_note: text || null }).eq("id", id);
    if (e1) {
      setBusy(false);
      return setError("Couldn't escalate that follow-up. Please try again.");
    }
    await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "status", note: text ? `Escalated to the Headteacher: ${text}` : "Escalated to the Headteacher." });
    const mailErr = await notifyHead(id);
    setBusy(false);
    onDone(
      mailErr ? `Escalated. The email to the Headteacher couldn't be sent (${mailErr}); you can send it again from the card.` : `Escalated. The Headteacher and safeguarding lead have been emailed about ${row.abs.childName}.`,
      mailErr ? "warn" : "good"
    );
    onClose();
  };

  return (
    <Modal title={`Escalate: ${row.abs.childName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink/70">
          Absent {formatDay(row.abs.date)}. The case is marked escalated and the Headteacher and safeguarding lead are emailed a link to it. You stay on this page.
        </p>
        <label className="block text-sm font-medium text-ink">
          Note for the Headteacher (optional)
          <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={modalFieldCls} placeholder="e.g. Three calls, no answer. Second absence this fortnight." />
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={ui.btnPrimary}>
            {busy ? "Escalating…" : "Escalate"}
          </button>
          <button type="button" onClick={onClose} className={ui.btnSecondary}>
            Cancel
          </button>
        </div>
        <p className="border-t border-gold-light/60 pt-3 text-xs text-ink/65">
          Worried about the pupil&apos;s safety or welfare?{" "}
          <Link href="/report-concern" className="font-medium text-red-800 underline">
            Raise a safeguarding concern instead
          </Link>
          .
        </p>
      </form>
    </Modal>
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
    // Logging contact on an escalated case keeps it escalated.
    const patch: Record<string, unknown> = { contact_method: method, next_action_due: next || null };
    if (row.fu?.status !== "escalated") patch.status = "contacted";
    const { error: e2 } = await supabase.from("absence_followups").update(patch).eq("id", id);
    setBusy(false);
    if (e1 || e2) return setError("Couldn't save that contact. Please try again.");
    onSaved();
    onClose();
  };

  return (
    <Modal title={`Log contact: ${row.abs.childName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-ink/65">Absent {formatDay(row.abs.date)}</p>
        <label className="block text-sm font-medium text-ink">
          Method
          <Select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={modalFieldCls}>
            <option value="call">Phone call</option>
            <option value="sms">Text message</option>
            <option value="email">Email</option>
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Outcome
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={modalFieldCls}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Note
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={modalFieldCls} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Next action due (optional)
          <input type="date" value={next} min={ukToday()} onChange={(e) => setNext(e.target.value)} className={modalFieldCls} />
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className={ui.btnPrimary}>
            {busy ? "Saving…" : "Save contact"}
          </button>
          <button type="button" onClick={onClose} className={ui.btnSecondary}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
