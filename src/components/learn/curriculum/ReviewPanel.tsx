"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, ui } from "@/components/learn/ui";
import { WorkflowBadge, WORKFLOW, type WorkflowStatus } from "@/components/learn/kit";
import { loadReviewHistory, nextSteps, reviewStep, type ReviewEvent, type ReviewRow } from "@/lib/learn/curriculumReview";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Review and approval for one lesson or spec unit (migration 0192): where it
 * stands, who submitted and approved it, the steps this person can take, and
 * the full history with comments. Used in the lesson workspace and in the
 * review queue.
 */
export function ReviewPanel({
  slug,
  scope,
  refKey,
  row,
  reviewer,
  canSubmit,
  currentVersion,
  onChanged,
  compact,
}: {
  slug: string;
  scope: "spec" | "lesson";
  refKey: string;
  row: ReviewRow | undefined;
  /** Head teacher or admin: may review, approve, publish. */
  reviewer: boolean;
  /** Teachers, heads and admins may submit. */
  canSubmit: boolean;
  currentVersion?: number;
  onChanged: () => void;
  compact?: boolean;
}) {
  const [history, setHistory] = useState<ReviewEvent[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<WorkflowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<WorkflowStatus | null>(null);

  const loadHistory = useCallback(async () => setHistory(await loadReviewHistory(slug, scope, refKey)), [slug, scope, refKey]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this item's history when it changes
    loadHistory();
  }, [loadHistory]);

  const status = (row?.status || "draft") as WorkflowStatus;
  const steps = canSubmit ? nextSteps(status, reviewer) : [];

  const take = async (to: WorkflowStatus, needsNote?: boolean) => {
    if (needsNote && !note.trim()) {
      setAsking(to);
      setError("Say what needs changing, then press the button again.");
      return;
    }
    setBusy(to);
    setError(null);
    const err = await reviewStep(slug, scope, refKey, to, note.trim() || undefined);
    setBusy(null);
    if (err) return setError(err);
    setNote("");
    setAsking(null);
    await loadHistory();
    onChanged();
  };

  const stale = row && row.approved_version != null && currentVersion != null && currentVersion > row.approved_version && (status === "approved" || status === "published");

  return (
    <section aria-label="Review and approval" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WorkflowBadge status={status} className="!text-sm" />
        {row?.checked_at && <span className="text-xs text-ink/60">Updated {when(row.checked_at)}</span>}
      </div>

      {row?.changed_since_approval && status === "submitted" && <Notice tone="warn">Changed after it was approved, so it needs checking again.</Notice>}
      {stale && <Notice tone="warn">The slides have been rebuilt since version {row?.approved_version} was approved. The words are unchanged.</Notice>}
      {row?.note && (status === "changes_needed" || status === "submitted") && (
        <p className="rounded-lg bg-cream px-3 py-2 text-sm text-ink/85">
          <span className="font-medium">{status === "changes_needed" ? "Changes requested: " : "Note: "}</span>
          {row.note}
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink/60">Submitted</dt>
        <dd className="text-ink">{row?.submitted_name ? `${row.submitted_name}, ${when(row.submitted_at || row.checked_at)}` : "Not yet"}</dd>
        <dt className="text-ink/60">Approved</dt>
        <dd className="text-ink">{row?.approved_name ? `${row.approved_name}, ${when(row.approved_at || row.checked_at)}${row.approved_version ? ` (version ${row.approved_version})` : ""}` : "Not yet"}</dd>
      </dl>

      {steps.length > 0 && (
        <div className="space-y-2">
          <label className="block">
            <span className={ui.label}>Comment {asking === "changes_needed" ? "(required)" : "(optional)"}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={compact ? 2 : 3} maxLength={1000} className={`mt-1 ${ui.textarea}`} placeholder="What you checked, or what needs changing" />
          </label>
          <div className="flex flex-wrap gap-2">
            {steps.map((s) => (
              <Button key={s.to} variant={s.primary ? "primary" : s.to === "changes_needed" ? "secondary" : "ghost"} size="sm" disabled={!!busy} onClick={() => take(s.to, s.needsNote)}>
                {busy === s.to ? "Saving…" : s.label}
              </Button>
            ))}
          </div>
          {error && <p className={ui.error} role="alert">{error}</p>}
        </div>
      )}

      {!compact && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/55">History</h3>
          {history === null ? (
            <p className="mt-2 text-sm text-ink/60">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">No review steps yet.</p>
          ) : (
            <ol className="mt-2 space-y-3 border-l border-gold-light pl-4">
              {history.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span aria-hidden="true" className={`absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full ${WORKFLOW[e.to_status]?.dot || "bg-ink/30"}`} />
                  <p className="text-ink">
                    <span className="font-medium">{WORKFLOW[e.to_status]?.label || e.to_status}</span>
                    {e.actor_name ? ` by ${e.actor_name}` : " (automatic)"}
                    {e.lesson_version ? <span className="text-ink/60"> · version {e.lesson_version}</span> : null}
                  </p>
                  <p className="text-xs text-ink/60">{when(e.created_at)}</p>
                  {e.note && <p className="mt-0.5 text-ink/80">{e.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
