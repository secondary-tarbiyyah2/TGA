"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDateKey, ukDateTime, ukToday } from "@/lib/learn/ukTime";
import { Button, EmptyState, Field, LoadingState, Section, ui } from "@/components/learn/ui";
import { SidePanel } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { DatePicker } from "@/components/learn/DatePicker";

type Review = {
  id: string;
  review_date: string;
  kind: ReviewKind;
  checked: string;
  findings: string;
  actions: string | null;
  reviewer_name: string;
  created_at: string;
};
type ReviewKind = "monthly" | "termly" | "concern" | "other";

export const REVIEW_KINDS: Record<ReviewKind, string> = {
  monthly: "Monthly audit log review",
  termly: "Termly settings check",
  concern: "Review after a concern",
  other: "Other review",
};

const EMPTY = { review_date: "", kind: "monthly" as ReviewKind, checked: "", findings: "", actions: "" };

/**
 * The record of reviews that policy 02 asks the Digital Lead to keep: each
 * review's date, kind, what was checked, what was found and what was done.
 * Headteacher, Admin and Digital Lead read and add (migration 0218); nobody
 * edits or deletes one, and adding one is written to the audit log.
 */
export function DigitalReviews() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Review | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.rpc("digital_review_list", { p_limit: 100 });
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setError(null);
    setRows((data as Review[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load
    load();
  }, [load]);

  const last = rows?.find((r) => r.kind === "monthly");

  return (
    <Section
      title="Record of reviews"
      description="Each review of the audit log, accounts and settings, as policy 02 asks. A review stays as written once saved."
      action={
        <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
          Record a review
        </Button>
      }
    >
      <div data-guide="digital-reviews">
        {rows && rows.length > 0 && (
          <p className="t-meta mb-3">{last ? `Last monthly review: ${formatDateKey(last.review_date)}.` : "No monthly review recorded yet."}</p>
        )}
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        {rows === null ? (
          <LoadingState rows={3} label="Loading reviews" />
        ) : rows.length === 0 ? (
          !error && (
            <EmptyState title="No reviews recorded yet" icon="clipboardCheck">
              Record each monthly review here, and any review after a concern.
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-gold-light border-y border-gold-light">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-1 py-3 text-left hover:bg-[var(--portal-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-700">
                  <span className="w-32 shrink-0 text-sm font-medium text-ink">{formatDateKey(r.review_date)}</span>
                  <span className="min-w-0 flex-1 text-sm text-ink">
                    {REVIEW_KINDS[r.kind] || r.kind}
                    <span className="block truncate text-ink-500">{r.findings}</span>
                  </span>
                  <span className="t-meta">{r.reviewer_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <SidePanel title={REVIEW_KINDS[open.kind] || "Review"} eyebrow={formatDateKey(open.review_date)} onClose={() => setOpen(null)}>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className={ui.label}>What was checked</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink">{open.checked}</dd>
            </div>
            <div>
              <dt className={ui.label}>Findings</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink">{open.findings}</dd>
            </div>
            <div>
              <dt className={ui.label}>Actions</dt>
              <dd className="mt-1 whitespace-pre-wrap text-ink">{open.actions || "None"}</dd>
            </div>
            <p className="t-meta">
              Recorded by {open.reviewer_name}, {ukDateTime(open.created_at)}.
            </p>
          </dl>
        </SidePanel>
      )}

      {adding && (
        <RecordReviewPanel
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </Section>
  );
}

function RecordReviewPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const supabase = getSupabaseClient();
  const [form, setForm] = useState({ ...EMPTY, review_date: ukToday() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const missing = [!form.review_date && "the date", !form.checked.trim() && "what was checked", !form.findings.trim() && "the findings"].filter(Boolean) as string[];

  const save = async () => {
    if (!supabase || missing.length > 0) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("digital_reviews").insert({
      review_date: form.review_date,
      kind: form.kind,
      checked: form.checked.trim(),
      findings: form.findings.trim(),
      actions: form.actions.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("future") ? "The review date can't be in the future." : `The review wasn't saved: ${err.message}`);
      return;
    }
    onSaved();
  };

  return (
    <SidePanel
      title="Record a review"
      eyebrow="Record of reviews"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy || missing.length > 0} onClick={save}>
            {busy ? "Saving…" : "Save review"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {missing.length > 0 && <span className="t-meta">Still needed: {missing.join(", ")}.</span>}
        </>
      }
    >
      <div className="space-y-4">
        <DatePicker label="Date of the review" value={form.review_date} onChange={(v) => set("review_date", v)} max={ukToday()} required />
        <Field label="Kind of review" htmlFor="dr-kind">
          <Select id="dr-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as ReviewKind)} className={ui.select}>
            {(Object.keys(REVIEW_KINDS) as ReviewKind[]).map((k) => (
              <option key={k} value={k}>
                {REVIEW_KINDS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What was checked" htmlFor="dr-checked" hint="For example: the audit log since the last review, staff accounts and roles, failed sign-ins, settings.">
          <textarea id="dr-checked" value={form.checked} onChange={(e) => set("checked", e.target.value)} maxLength={4000} className={ui.textarea} />
        </Field>
        <Field label="Findings" htmlFor="dr-findings" hint="What you found, or that nothing unusual was found. Keep names to what is needed.">
          <textarea id="dr-findings" value={form.findings} onChange={(e) => set("findings", e.target.value)} maxLength={4000} className={ui.textarea} />
        </Field>
        <Field label="Actions (optional)" htmlFor="dr-actions" hint="What was done or asked for, and by whom. A safeguarding worry goes to the DSL through Report a concern, not here.">
          <textarea id="dr-actions" value={form.actions} onChange={(e) => set("actions", e.target.value)} maxLength={4000} className={ui.textarea} />
        </Field>
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        <p className="t-meta">Once saved, a review can&apos;t be changed or deleted. Saving is recorded in the audit log.</p>
      </div>
    </SidePanel>
  );
}
