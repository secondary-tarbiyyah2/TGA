"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { Button, ButtonLink, EmptyState, Notice, StatusChip, ui, type Tone } from "@/components/learn/ui";
import { SidePanel } from "@/components/learn/kit";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { Tabs } from "@/components/learn/Tabs";
import { Modal, ReasonModal, modalFieldCls } from "./ReasonModal";
import { formatDay, type Absence } from "./data";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
type FStatus = "open" | "contacted" | "explained" | "escalated" | "closed";
type Method = "call" | "sms" | "email" | "message";
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
  authorised?: boolean | null;
};
type FEvent = { id: string; followup_id: string; kind: string; method: Method | null; outcome: string | null; note: string | null; created_at: string; who: string | null };

const OUTCOMES: { value: string; label: string }[] = [
  { value: "reached", label: "Spoke to a parent" },
  { value: "left_message", label: "Left a message" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "other", label: "Other" },
];
const METHOD_LABEL: Record<Method, string> = { call: "Phone call", sms: "Text message", email: "Email", message: "Portal message" };
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
type Filter = "all" | "due" | "first" | "progress" | "escalated" | "closed";

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
          "id, child_id, absence_date, status, contact_method, next_action_due, escalated_at, escalation_note, escalation_notified_at, authorised, assignee:profiles!absence_followups_assigned_to_fkey(full_name), escalator:profiles!absence_followups_escalated_by_fkey(full_name)"
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
      const hasCase = byKey.has(`${a.childId}|${a.date}`);
      if (!hasCase && (a.kind !== "unexplained" || (a.reasonCode && a.reasonCode !== "unknown"))) continue;
      const key = `${a.childId}|${a.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fu = byKey.get(key) || null;
      out.push({ key, abs: a, fu });
    }
    // Escalated first, then overdue, then oldest first.
    const rank = (r: Row) => (r.fu?.status === "escalated" ? 0 : overdueReason(r, today) ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.abs.date.localeCompare(b.abs.date));
  }, [absences, followups, today]);

  const isClosed = (r: Row) => r.fu?.status === "explained" || r.fu?.status === "closed";
  const open = rows.filter((r) => !isClosed(r));
  const isDue = (r: Row) => !!overdueReason(r, today) || (!!r.fu?.next_action_due && r.fu.next_action_due <= today);
  const counts = {
    all: open.length,
    due: open.filter(isDue).length,
    first: open.filter((r) => (r.fu?.status || "open") === "open").length,
    progress: open.filter((r) => r.fu?.status === "contacted").length,
    escalated: open.filter((r) => r.fu?.status === "escalated").length,
    closed: rows.length - open.length,
    overdue: open.filter((r) => overdueReason(r, today)).length,
  };
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const shown = (filter === "closed" ? rows.filter(isClosed) : open).filter((r) => {
    if (needle && !r.abs.childName.toLowerCase().includes(needle)) return false;
    const s = r.fu?.status || "open";
    return filter === "all" || filter === "closed" || (filter === "due" && isDue(r)) || (filter === "first" && s === "open") || (filter === "progress" && s === "contacted") || (filter === "escalated" && s === "escalated");
  });
  const current = openKey ? rows.find((r) => r.key === openKey) || null : null;
  const at = current ? shown.findIndex((r) => r.key === current.key) : -1;

  const decide = async (row: Row, authorised: boolean | null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyKey(row.key);
    const id = await ensure(row);
    if (id) {
      const { error: e1 } = await supabase.from("absence_followups").update({ authorised }).eq("id", id);
      await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "status", note: authorised === null ? "Decision cleared." : authorised ? "Marked authorised." : "Marked not authorised." });
      setError(e1 ? "Couldn't save the decision. Please try again." : null);
    }
    setBusyKey(null);
    reload();
  };

  const remind = async (row: Row, date: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyKey(row.key);
    const id = await ensure(row);
    if (id) {
      const { error: e1 } = await supabase.from("absence_followups").update({ next_action_due: date || null }).eq("id", id);
      if (date) await supabase.from("absence_followup_events").insert({ followup_id: id, kind: "note", note: `Reminder set for ${formatDay(date)}.` });
      setError(e1 ? "Couldn't set the reminder. Please try again." : null);
    }
    setBusyKey(null);
    reload();
  };

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
    <section className="rounded-[10px] border border-gold-light bg-white" data-guide="absences-followup">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gold-light/60 px-4 py-3">
        <div>
          <h2 className="t-section">Absences to follow up</h2>
          <p className="t-meta">No reason and no note from the family. First contact is due within one school day. Press a row to act on it.</p>
        </div>
        {counts.overdue > 0 && <StatusChip tone="bad">{counts.overdue} overdue</StatusChip>}
      </div>
      <div className="space-y-3 px-4 py-4">
        {error && <Notice tone="bad">{error}</Notice>}
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {absences === null ? (
          <div className="h-24 motion-safe:animate-pulse rounded-xl bg-cream" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to follow up" icon="check">
            Every recent absence has a reason.
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                variant="switch"
                label="Show follow-ups"
                value={filter}
                onChange={setFilter}
                items={[
                  { key: "all", label: "Open", count: counts.all },
                  { key: "due", label: "Due now", count: counts.due, countAlert: counts.due > 0 },
                  { key: "first", label: "Not contacted", count: counts.first },
                  { key: "progress", label: "Contacted", count: counts.progress },
                  { key: "escalated", label: "Escalated", count: counts.escalated, countAlert: true },
                  { key: "closed", label: "Closed", count: counts.closed },
                ]}
              />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className="min-w-[10rem] flex-1 rounded-[7px] border border-gold-light bg-white px-3 py-2 text-sm" />
            </div>
            {shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/65">Nothing in this view.</p>
            ) : (
              <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light">
                {shown.map((r) => (
                  <CaseRow key={r.key} row={r} today={today} onOpen={() => setOpenKey(r.key)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {current && (
        <CasePanel
          row={current}
          today={today}
          log={current.fu ? events[current.fu.id] || [] : []}
          busy={busyKey === current.key}
          onClose={() => setOpenKey(null)}
          onPrev={at > 0 ? () => setOpenKey(shown[at - 1].key) : undefined}
          onNext={at >= 0 && at < shown.length - 1 ? () => setOpenKey(shown[at + 1].key) : undefined}
          onContact={() => setContactRow(current)}
          onExplain={() => setExplainRow(current)}
          onEscalate={() => setEscalateRow(current)}
          onDecide={(v) => void decide(current, v)}
          onRemind={(d) => void remind(current, d)}
          onCloseCase={async () => {
            if (await askConfirm(`Close the follow-up for ${current.abs.childName} without an explanation?`)) void setStatus(current, "closed", "Closed without an explanation.");
          }}
          onReopen={() => void setStatus(current, "open", "Reopened.")}
          onRetryNotify={() => void retryNotify(current)}
        />
      )}
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

function CaseRow({ row: r, today, onOpen }: { row: Row; today: string; onOpen: () => void }) {
  const status: FStatus = r.fu?.status || "open";
  const overdue = overdueReason(r, today);
  const days = schoolDaysSince(r.abs.date, today);
  const due = r.fu?.next_action_due;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-cream/60">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{r.abs.childName}</span>
          <span className="t-meta block">
            {r.abs.className} · absent {formatDay(r.abs.date)} ({days === 0 ? "today" : `${days} school day${days === 1 ? "" : "s"} ago`})
          </span>
        </span>
        <span className="t-meta w-40 text-right">{overdue ? <span className="font-medium text-red-700">Overdue</span> : due ? `Reminder ${due <= today ? "due now" : formatDay(due)}` : r.fu?.assigned ? `With ${r.fu.assigned}` : ""}</span>
        <span className="w-36 text-right">
          <StatusChip tone={STATUS[status].tone}>{STATUS[status].label}</StatusChip>
        </span>
        {r.fu?.authorised != null && <span className="t-meta w-24 text-right">{r.fu.authorised ? "Authorised" : "Not authorised"}</span>}
      </button>
    </li>
  );
}

/** One absence's case: what happened, its history, and every action, beside the queue. */
function CasePanel({
  row: r,
  today,
  log,
  busy,
  onClose,
  onPrev,
  onNext,
  onContact,
  onExplain,
  onEscalate,
  onDecide,
  onRemind,
  onCloseCase,
  onReopen,
  onRetryNotify,
}: {
  row: Row;
  today: string;
  log: FEvent[];
  busy: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onContact: () => void;
  onExplain: () => void;
  onEscalate: () => void;
  onDecide: (v: boolean | null) => void;
  onRemind: (date: string) => void;
  onCloseCase: () => void;
  onReopen: () => void;
  onRetryNotify: () => void;
}) {
  const status: FStatus = r.fu?.status || "open";
  const closed = status === "explained" || status === "closed";
  const overdue = overdueReason(r, today);
  const escalated = status === "escalated";
  const [remindOn, setRemindOn] = useState(r.fu?.next_action_due || "");
  return (
    <SidePanel
      title={<PupilLink id={r.abs.childId} name={r.abs.childName} />}
      eyebrow={`Absent ${formatDay(r.abs.date)} · ${r.abs.className}`}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" icon="chevronLeft" disabled={!onPrev} onClick={onPrev}>
            Previous
          </Button>
          <Button size="sm" iconRight="chevronRight" disabled={!onNext} onClick={onNext}>
            Next
          </Button>
          {closed ? (
            <Button size="sm" className="ml-auto" disabled={busy} onClick={onReopen}>
              Reopen
            </Button>
          ) : (
            <button type="button" disabled={busy} onClick={onCloseCase} className={`ml-auto ${ui.btnLink} !text-ink/70`}>
              Close case
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={STATUS[status].tone}>{STATUS[status].label}</StatusChip>
          {overdue && <StatusChip tone="warn">{overdue}</StatusChip>}
          {r.fu?.authorised != null && <StatusChip tone={r.fu.authorised ? "good" : "bad"}>{r.fu.authorised ? "Authorised" : "Not authorised"}</StatusChip>}
        </div>

        {escalated && r.fu && (
          <div className="rounded-[10px] border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-900">
            <p>
              Escalated{r.fu.escalated_by_name ? ` by ${r.fu.escalated_by_name}` : ""}
              {r.fu.escalated_at ? ` on ${stamp(r.fu.escalated_at)}` : ""}. {r.fu.escalation_notified_at ? "The head teacher and safeguarding lead were emailed." : "Not emailed yet."}
            </p>
            {r.fu.escalation_note && <p className="mt-1 whitespace-pre-wrap">&ldquo;{r.fu.escalation_note}&rdquo;</p>}
            {!r.fu.escalation_notified_at && (
              <button type="button" disabled={busy} onClick={onRetryNotify} className={`mt-1 ${ui.btnLink}`}>
                Send the email again
              </button>
            )}
          </div>
        )}

        <section aria-labelledby="case-actions">
          <h3 id="case-actions" className="t-eyebrow mb-2">
            Act on it
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon="clipboardCheck" disabled={busy} onClick={onContact}>
              Log a call
            </Button>
            <ButtonLink href="/admin/messages?compose=1" icon="messageSquare">
              Message family
            </ButtonLink>
            <Button icon="pencil" disabled={busy} onClick={onExplain}>
              Set reason
            </Button>
            {!escalated ? (
              <Button icon="shieldAlert" disabled={busy || closed} onClick={onEscalate} className="!border-red-300 !text-red-800 hover:!bg-red-50">
                Escalate to head
              </Button>
            ) : (
              <span />
            )}
          </div>
        </section>

        <section aria-labelledby="case-decision">
          <h3 id="case-decision" className="t-eyebrow mb-2">
            Decision
          </h3>
          <div role="group" aria-label="Decision" className="flex flex-wrap gap-2">
            {([
              [true, "Authorised"],
              [false, "Not authorised"],
              [null, "Not decided"],
            ] as const).map(([v, label]) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                aria-pressed={(r.fu?.authorised ?? null) === v}
                onClick={() => onDecide(v)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${(r.fu?.authorised ?? null) === v ? "border-forest-700 bg-forest-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="case-remind">
          <h3 id="case-remind" className="t-eyebrow mb-2">
            Reminder
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={remindOn} min={today} onChange={(e) => setRemindOn(e.target.value)} aria-label="Remind me on" className="rounded-[7px] border border-gold-light bg-white px-3 py-2 text-sm" />
            <Button size="sm" disabled={busy || remindOn === (r.fu?.next_action_due || "")} onClick={() => onRemind(remindOn)}>
              {remindOn ? "Set reminder" : "Clear reminder"}
            </Button>
          </div>
          <p className="t-meta mt-1">Cases come back under Due now on that day.</p>
        </section>

        <section aria-labelledby="case-history">
          <h3 id="case-history" className="t-eyebrow mb-2">
            History
          </h3>
          {log.length === 0 ? (
            <p className="text-sm text-ink/65">Nothing done yet.</p>
          ) : (
            <ol className="space-y-2 border-l-2 border-gold-light pl-3 text-sm">
              {log.map((e) => (
                <li key={e.id}>
                  <span className="t-meta block">
                    {stamp(e.created_at)} · {e.who || "Staff"}
                  </span>
                  <span className="text-ink">
                    {e.kind === "contact" ? `${e.method ? METHOD_LABEL[e.method] : "Contact"}: ${OUTCOMES.find((o) => o.value === e.outcome)?.label?.toLowerCase() || ""}` : ""}
                    {e.kind === "contact" && e.note ? ". " : ""}
                    {e.note || ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </SidePanel>
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
            <option value="message">Portal message</option>
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
