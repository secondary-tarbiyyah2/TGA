"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type ChecklistItem = { key: string; label: string; done: boolean };
type ReviewStatus = "required" | "in_progress" | "completed";
type ReviewRow = {
  id: string;
  child_name: string | null;
  rule: string;
  reason: string;
  concern_count: number;
  opened_at: string;
  due_at: string;
  status: ReviewStatus;
  checklist: ChecklistItem[];
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  decision: string | null;
  outcome: string | null;
  notes: string | null;
  is_overdue: boolean;
};

const DECISIONS: { value: string; label: string }[] = [
  { value: "no_further_action", label: "No further action" },
  { value: "monitor", label: "Monitor" },
  { value: "internal_action", label: "Internal action" },
  { value: "refer_external", label: "Refer to an external agency" },
  { value: "escalate", label: "Escalate" },
];
const RULE_LABEL: Record<string, string> = {
  repeat_30d: "Repeat concerns (30 days)",
  repeat_90d: "Repeat concerns (90 days)",
  serious_open_24h: "Serious concern open over 24h",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function dueText(r: ReviewRow): string {
  if (r.status === "completed") return `Completed ${r.reviewed_at ? fmt(r.reviewed_at) : ""}`;
  const ms = new Date(r.due_at).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / 3_600_000);
  const span = hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hour${hours === 1 ? "" : "s"}`;
  return ms < 0 ? `Overdue by ${span}` : `Due in ${span}`;
}

function ReviewCard({ review, onChanged }: { review: ReviewRow; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const done = review.status === "completed";
  const [checklist, setChecklist] = useState<ChecklistItem[]>(Array.isArray(review.checklist) ? review.checklist : []);
  const [decision, setDecision] = useState(review.decision || "");
  const [outcome, setOutcome] = useState(review.outcome || "");
  const [notes, setNotes] = useState(review.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTicked = checklist.length > 0 && checklist.every((c) => c.done);

  async function save(complete: boolean) {
    if (!supabase) return;
    if (complete && !window.confirm("Complete this review? It is locked once completed and your name is recorded as the reviewer.")) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("safeguarding_reviews")
      .update({
        status: complete ? "completed" : "in_progress",
        checklist,
        decision: decision || null,
        outcome: outcome.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", review.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
  }

  const tone = done ? "border-green-200 bg-green-50/60" : review.is_overdue ? "border-red-400 bg-red-50 ring-1 ring-red-300" : "border-amber-300 bg-amber-50";

  return (
    <li className={`rounded-xl border p-4 text-sm ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {review.child_name || "Concern not linked to an enrolled pupil"}
            {review.is_overdue && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Overdue</span>}
          </p>
          <p className="text-xs text-ink/65">
            {RULE_LABEL[review.rule] || review.rule}: {review.reason}. {review.concern_count} concern{review.concern_count === 1 ? "" : "s"} linked.
          </p>
          <p className="mt-0.5 text-xs text-ink/65">
            Opened {fmt(review.opened_at)} · due {fmt(review.due_at)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${done ? "bg-green-100 text-green-800" : review.is_overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{dueText(review)}</span>
      </div>

      <fieldset className="mt-3" disabled={done || busy}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink/65">Review checklist</legend>
        <ul className="mt-1 space-y-1">
          {checklist.map((c, i) => (
            <li key={c.key}>
              <label className="flex items-start gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={(e) => setChecklist((prev) => prev.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
                  className="mt-0.5"
                />
                {c.label}
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-ink/70">
            Decision
            <Select value={decision} onChange={(e) => setDecision(e.target.value)} className={`${ui.select} mt-1`}>
              <option value="">Choose…</option>
              {DECISIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="text-xs text-ink/70">
            Reviewed by
            <p className="mt-1 rounded-lg border border-gold-light/40 bg-white/60 px-2 py-1.5 text-sm text-ink/80">{done ? review.reviewed_by_name || "Recorded" : "You (recorded when you complete the review)"}</p>
          </div>
        </div>
        <label className="mt-2 block text-xs text-ink/70">
          Outcome
          <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} className={`${ui.textarea} mt-1`} />
        </label>
        <label className="mt-2 block text-xs text-ink/70">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${ui.textarea} mt-1`} />
        </label>
      </fieldset>

      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => save(false)} disabled={busy} className={btn("secondary", "sm")}>
            Save progress
          </button>
          <button type="button" onClick={() => save(true)} disabled={busy || !allTicked || !decision} className={btn("primary", "sm")}>
            Complete review
          </button>
          {(!allTicked || !decision) && <span className="self-center text-xs text-ink/65">Tick every item and choose a decision to complete.</span>}
        </div>
      )}
    </li>
  );
}

/**
 * Review-required items opened automatically when concerns repeat (0075).
 * Rows come from safeguarding_review_queue(), which returns nothing unless
 * the caller is the Safeguarding Lead or Headteacher - the same people who
 * can open the concern log - and contains no concern text.
 */
export function SafeguardingReviews() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("safeguarding_review_queue");
    setRows((data as ReviewRow[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const open = (rows || []).filter((r) => r.status !== "completed");
  const closed = (rows || []).filter((r) => r.status === "completed");
  const overdue = open.filter((r) => r.is_overdue).length;

  // Nothing to show and nothing ever opened: stay out of the way.
  if (rows !== null && rows.length === 0) return null;
  // All done: one line rather than a full card above the dashboard.
  if (rows !== null && open.length === 0 && !showDone) {
    return (
      <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
        Safeguarding reviews: all complete.{" "}
        <button type="button" onClick={() => setShowDone(true)} className="font-medium underline">
          Show {closed.length} completed
        </button>
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6" aria-label="Safeguarding reviews">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-h3 font-semibold text-ink">Safeguarding reviews</h2>
        {rows !== null && (
          <p className={`rounded-full px-3 py-1 text-xs font-semibold ${overdue > 0 ? "bg-red-600 text-white" : open.length > 0 ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>
            {open.length === 0 ? "Nothing awaiting review" : `${open.length} awaiting review${overdue > 0 ? `, ${overdue} overdue` : ""}`}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-ink/65">
        Opened automatically when concerns repeat (2+ about the same child in 30 days, 3+ in 90) or a serious concern stays open for 24 hours. Visible only to the Safeguarding Lead and Headteacher.
      </p>

      {rows === null && <div className="mt-3 h-20 animate-pulse rounded-xl bg-cream" />}
      <ul className="mt-3 space-y-3">
        {open.map((r) => (
          <ReviewCard key={r.id} review={r} onChanged={load} />
        ))}
      </ul>
      {rows !== null && open.length === 0 && <p className="mt-3 text-sm text-ink/65">All reviews are complete.</p>}

      {closed.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-medium text-teal-700 underline">
            {showDone ? "Hide" : "Show"} {closed.length} completed review{closed.length === 1 ? "" : "s"}
          </button>
          {showDone && (
            <ul className="mt-3 space-y-3">
              {closed.map((r) => (
                <ReviewCard key={r.id} review={r} onChanged={load} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
