"use client";

// Absence emails sent to absence@globalacademy.tarbiyyah.co.uk (see
// supabase/functions/inbound-absence). Ones the portal couldn't record with
// confidence wait here: staff can confirm the suggestion, edit the child,
// dates or reason first, or dismiss. Recorded ones are listed too.

import { Loading } from "@/components/learn/kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import { formatDateKey, ukDateTime, ukToday } from "@/lib/learn/ukTime";
import { ui } from "@/components/learn/ui";
import { ROLE_EMAILS } from "@/content/contacts";

export const ABSENCE_INBOX = ROLE_EMAILS.attendance;
const CATEGORIES = ["Unwell", "Medical or dental appointment", "Family emergency", "Religious observance", "Other"];

type Status = "recorded" | "needs_review" | "rejected" | "duplicate" | "dismissed";
type Range = { from: string; to: string };
type Kid = { id: string; name: string };
type Parsed = {
  cleaned?: string;
  candidates?: Kid[];
  suggestion?: { childIds?: string[]; ranges?: Range[]; category?: string | null; gist?: string };
  confirmed?: { childIds?: string[]; ranges?: Range[]; category?: string; gist?: string };
  model?: { model?: string; error?: string | null } | null;
};
type Row = {
  id: string;
  received_at: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_text: string;
  parsed: Parsed | null;
  status: Status;
  review_reasons: string[] | null;
  note_ids: string[] | null;
  sender_verified: boolean;
  reply_sent: boolean;
  handled_at: string | null;
  staff_note: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  recorded: "Recorded",
  needs_review: "Needs review",
  rejected: "Not recorded",
  duplicate: "Already recorded",
  dismissed: "Dismissed",
};
const STATUS_CHIP: Record<Status, string> = {
  recorded: "bg-green-50 text-green-800",
  needs_review: "bg-amber-50 text-amber-900",
  rejected: "bg-red-50 text-red-800",
  duplicate: "bg-cream text-ink/70",
  dismissed: "bg-cream text-ink/60",
};

// Plain-English review reasons (same codes as supabase/functions/inbound-absence/decide.ts).
const REASON_TEXT: Record<string, string> = {
  children_ambiguous: "Not clear which child",
  children_unknown: "No child named",
  children_conflict: "Says all children but names only some",
  unknown_name: "Names someone who isn't one of this family's children",
  next_weekday_ambiguous: '"Next [day]" could mean this week or next',
  us_date_order: "Date looks like US order (month/day)",
  invalid_date: "Contains a date that doesn't exist",
  weekday_date_mismatch: "Weekday and date don't match",
  date_out_of_window: "Date is more than 2 weeks ago or 2 months ahead",
  too_long: "Very long absence",
  non_school_day: "Only mentions a weekend day",
  past_absence_no_date_at_weekend: "Past absence with no date, sent at the weekend",
  open_ended: "No end date given",
  vague_duration: 'Vague length ("a few days")',
  return_before_start: "Return date is before the absence starts",
  no_dates: "No dates found",
  no_reason: "No reason found",
  correction_or_cancellation: "Looks like a correction or cancellation",
  model_unknown_child: "AI reader named a child not in this family",
  model_disagrees_children: "AI reader and rules disagree on the child",
  model_disagrees_dates: "AI reader and rules disagree on the dates",
  model_disagrees_reason: "AI reader and rules disagree on the reason",
  model_invalid_dates: "AI reader gave invalid dates",
  model_unsure: "AI reader was unsure",
  unknown_sender: "Sender's address isn't registered with the school",
  sender_not_verified: "Sender couldn't be verified (possible spoofing)",
  auto_reply: "Automatic reply or bulk mail",
  duplicate: "Already recorded",
};

type Filter = "review" | "recorded" | "other" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "review", label: "Needs review" },
  { key: "recorded", label: "Recorded" },
  { key: "other", label: "Not recorded" },
  { key: "all", label: "All" },
];
const inFilter = (r: Row, f: Filter) =>
  f === "all" || (f === "review" && r.status === "needs_review") || (f === "recorded" && r.status === "recorded") || (f === "other" && (r.status === "rejected" || r.status === "duplicate" || r.status === "dismissed"));

const day = (k: string) => formatDateKey(k);
const rangeLabel = (r: Range) => (r.from === r.to ? day(r.from) : `${day(r.from)} to ${day(r.to)}`);

function Editor({ row, onDone, onCancel }: { row: Row; onDone: () => void; onCancel: () => void }) {
  const candidates = useMemo(() => row.parsed?.candidates || [], [row.parsed]);
  const s = row.parsed?.suggestion || {};
  const [kids, setKids] = useState<Kid[]>(candidates);
  const [childIds, setChildIds] = useState<string[]>(() => (s.childIds || []).filter((id) => candidates.some((c) => c.id === id)));
  const [ranges, setRanges] = useState<Range[]>(() => (s.ranges && s.ranges.length ? s.ranges.map((r) => ({ ...r })) : [{ from: ukToday(), to: ukToday() }]));
  const [category, setCategory] = useState<string>(s.category || "");
  const [gist, setGist] = useState(s.gist || "");
  const [notify, setNotify] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState("");
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  // No registered family (e.g. a grandparent's address): search for the pupil.
  const search = async () => {
    if (q.trim().length < 2) return;
    const res = await callEdgeFunction("inbound-absence", { action: "search_children", q: q.trim() });
    if (!res.ok) return setError(edgeErrorMessage(res));
    const found = (res.children as Kid[]) || [];
    setKids((cur) => [...cur.filter((k) => childIds.includes(k.id)), ...found.filter((f) => !cur.some((c) => c.id === f.id && childIds.includes(c.id)))]);
  };

  const setRange = (i: number, patch: Partial<Range>) =>
    setRanges((cur) =>
      cur.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        if (patch.from && next.to < patch.from) next.to = patch.from;
        return next;
      }),
    );

  const confirm = async () => {
    if (!childIds.length) return setError("Choose at least one child.");
    if (ranges.some((r) => !r.from || !r.to || r.to < r.from)) return setError("Check the dates: the last day can't be before the first.");
    if (!category) return setError("Choose a reason.");
    if (category === "Other" && !gist.trim()) return setError("Add a few words about the reason.");
    setBusy(true);
    setError(null);
    const res = await callEdgeFunction("inbound-absence", { action: "confirm", id: row.id, child_ids: childIds, ranges, category, gist: gist.trim(), notify });
    setBusy(false);
    if (!res.ok) return setError(edgeErrorMessage(res));
    onDone();
  };

  const dismiss = async () => {
    setBusy(true);
    setError(null);
    const res = await callEdgeFunction("inbound-absence", { action: "dismiss", id: row.id, note: dismissNote.trim() });
    setBusy(false);
    if (!res.ok) return setError(edgeErrorMessage(res));
    onDone();
  };

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-gold-light/70 bg-cream/40 p-3 sm:p-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Who is away?</legend>
        {candidates.length === 0 && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1 text-xs font-medium text-ink/65">
              Find a pupil (this sender isn&apos;t linked to a family)
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} className={`mt-1 ${ui.input}`} placeholder="Pupil's name" />
            </label>
            <button type="button" onClick={search} className={`${ui.btnSecondary} ${ui.sm}`}>
              Search
            </button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {kids.map((k) => {
            const on = childIds.includes(k.id);
            return (
              <button key={k.id} type="button" aria-pressed={on} onClick={() => setChildIds(on ? childIds.filter((x) => x !== k.id) : [...childIds, k.id])} className={on ? ui.chipOn : ui.chip}>
                {k.name}
              </button>
            );
          })}
          {kids.length === 0 && <span className="text-sm text-ink/65">No pupils to choose from yet.</span>}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">When?</legend>
        <div className="mt-2 space-y-2">
          {ranges.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-medium text-ink/65">
                First day
                <input type="date" value={r.from} onChange={(e) => setRange(i, { from: e.target.value })} className={`mt-1 ${ui.input}`} />
              </label>
              <label className="block text-xs font-medium text-ink/65">
                Last day
                <input type="date" value={r.to} min={r.from} onChange={(e) => setRange(i, { to: e.target.value })} className={`mt-1 ${ui.input}`} />
              </label>
              {ranges.length > 1 && (
                <button type="button" onClick={() => setRanges(ranges.filter((_, j) => j !== i))} className={ui.btnLinkDanger}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setRanges([...ranges, { from: ukToday(), to: ukToday() }])} className={ui.btnLink}>
            Add other dates
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink">Why?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={category === c ? ui.chipOn : ui.chip}>
              {c}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs font-medium text-ink/65">
          Details (shown to the family and teachers)
          <input value={gist} maxLength={200} onChange={(e) => setGist(e.target.value)} className={`mt-1 ${ui.input}`} />
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-ink/80">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>Email the family to confirm what was recorded</span>
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={confirm} className={`${ui.btnPrimary} ${ui.sm} disabled:opacity-50`}>
          {busy ? "Saving…" : "Confirm and record"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${ui.btnGhost} ${ui.sm}`}>
          Cancel
        </button>
        {confirmDismiss ? (
          <span className="flex flex-wrap items-center gap-2">
            <input value={dismissNote} onChange={(e) => setDismissNote(e.target.value)} placeholder="Why? (optional)" className={`${ui.input} max-w-56`} aria-label="Reason for dismissing" />
            <button type="button" disabled={busy} onClick={dismiss} className={`${ui.btnDanger} ${ui.sm}`}>
              Dismiss
            </button>
          </span>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirmDismiss(true)} className={ui.btnLinkDanger}>
            Dismiss without recording
          </button>
        )}
      </div>
    </div>
  );
}

function EmailRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const names = new Map((row.parsed?.candidates || []).map((k) => [k.id, k.name]));
  const shown = row.status === "recorded" && row.parsed?.confirmed ? row.parsed.confirmed : row.parsed?.suggestion;
  const kids = (shown?.childIds || []).map((id) => names.get(id) || "A pupil");
  const canAct = row.status === "needs_review" || row.status === "rejected" || row.status === "duplicate";

  return (
    <li className="rounded-xl border border-gold-light/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {row.from_name ? `${row.from_name} ` : ""}
            <span className="font-normal text-ink/65">{row.from_email}</span>
          </p>
          <p className="text-xs text-ink/65">
            {ukDateTime(row.received_at)}
            {row.subject ? ` · ${row.subject}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP[row.status]}`}>{STATUS_LABEL[row.status]}</span>
      </div>

      {row.review_reasons && row.review_reasons.length > 0 && row.status !== "recorded" && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {row.review_reasons.map((r) => (
            <li key={r} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
              {REASON_TEXT[r] || r}
            </li>
          ))}
        </ul>
      )}

      {shown && (kids.length > 0 || (shown.ranges || []).length > 0 || shown.category) && (
        <div className="mt-2 rounded-lg bg-cream/60 px-3 py-2 text-sm text-ink/80">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">{row.status === "recorded" ? "Recorded" : "Suggested"}</p>
          <p className="mt-0.5">
            <strong>{kids.length ? kids.join(", ") : "Child not clear"}</strong>
            {" · "}
            {(shown.ranges || []).length ? (shown.ranges || []).map(rangeLabel).join("; ") : "Dates not clear"}
            {" · "}
            {shown.category || "Reason not clear"}
          </p>
          {shown.gist && <p className="mt-0.5 text-ink/70">{shown.gist}</p>}
        </div>
      )}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-teal-700">Show the email</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-gold-light/50 bg-white p-3 font-sans text-sm text-ink/80">{row.body_text || row.parsed?.cleaned || "(empty)"}</pre>
      </details>

      <p className="mt-2 text-xs text-ink/60">
        {row.sender_verified ? "Sender verified" : "Sender not verified"}
        {row.reply_sent ? " · Automatic reply sent" : ""}
        {row.handled_at ? ` · Handled ${ukDateTime(row.handled_at)}` : ""}
        {row.staff_note ? ` · ${row.staff_note}` : ""}
      </p>

      {canAct &&
        (editing ? (
          <Editor
            row={row}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              onChanged();
            }}
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={`${ui.btnSecondary} ${ui.sm} mt-2`}>
            {row.status === "needs_review" ? "Review" : "Record anyway"}
          </button>
        ))}
    </li>
  );
}

export function EmailAbsences({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("review");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("inbound_absence_emails")
        .select("id, received_at, from_email, from_name, subject, body_text, parsed, status, review_reasons, note_ids, sender_verified, reply_sent, handled_at, staff_note")
        .order("received_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows((data as unknown as Row[]) || []);
      setError(err ? err.message : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const changed = useCallback(() => {
    setTick((t) => t + 1);
    onChanged();
  }, [onChanged]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { review: 0, recorded: 0, other: 0, all: 0 };
    for (const r of rows || []) for (const f of FILTERS) if (inFilter(r, f.key)) c[f.key] += 1;
    return c;
  }, [rows]);
  const shown = (rows || []).filter((r) => inFilter(r, filter));

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/60 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Absence emails</h2>
          <p className="text-xs text-ink/65">
            Sent to {ABSENCE_INBOX}. Clear ones are recorded automatically; anything unclear waits here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter emails">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={filter === f.key ? ui.chipOn : ui.chip}>
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-4">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Couldn&apos;t load the emails: {error}</p>}
        {rows === null ? (
          <Loading label="Loading…" bare />
        ) : shown.length === 0 ? (
          <div className="py-4 text-center">
            <p className="font-medium text-ink">{filter === "review" ? "Nothing waiting for review" : "No emails here"}</p>
            <p className="mt-1 text-sm text-ink/65">When a parent emails {ABSENCE_INBOX} it will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((r) => (
              <EmailRow key={r.id} row={r} onChanged={changed} />
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/65">Recorded emails appear in Parent notes marked &quot;(by email)&quot;, awaiting a decision like any other note.</p>
    </section>
  );
}

/** How many absence emails are waiting for review (for the tab badge). */
export async function countEmailsToReview(): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;
  const { count } = await supabase.from("inbound_absence_emails").select("id", { count: "exact", head: true }).eq("status", "needs_review");
  return count || 0;
}
