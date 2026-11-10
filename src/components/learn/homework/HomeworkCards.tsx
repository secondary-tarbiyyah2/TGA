"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { btn, ui } from "@/components/learn/ui";
import { FileLinks } from "@/components/learn/homework/FileViewer";
import { SubmissionFeedback } from "@/components/learn/homework/SubmissionFeedback";
import { FILE_CATEGORY_LABEL, SUBMISSION_TYPE_LABEL, submissionFiles } from "@/lib/learn/homeworkFiles";
import { attachmentsOf, describeAllowed, formatDue, formatEdited, type Homework } from "@/lib/learn/homework";

import { askConfirm, Loading } from "@/components/learn/kit";
export type { Homework } from "@/lib/learn/homework";

type StatusRow = { child_id: string; status: string; submission_id: string | null };
type Child = { id: string; name: string };
type Submission = {
  homework_id: string;
  child_id: string;
  kind: string;
  response_text: string | null;
  link_url: string | null;
  file_path: string | null;
  files: unknown;
  submitted_at: string | null;
};

/** One submitted piece of work: what the student wrote, linked, and attached, with the marking form. */
export function MarkRow({ submissionId, childName, maxPoints, onSaved }: { submissionId: string; childName: string; maxPoints: number | null; onSaved: () => void }) {
  const supabase = getSupabaseClient();
  const [submission, setSubmission] = useState<Submission | null>(null);

  const loadSubmission = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("homework_submissions")
      .select("homework_id, child_id, kind, response_text, link_url, file_path, files, submitted_at")
      .eq("id", submissionId)
      .maybeSingle();
    setSubmission((data as Submission) || null);
  }, [supabase, submissionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadSubmission();
  }, [loadSubmission]);

  return (
    <div className="rounded-lg border border-gold-light/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{childName}</p>
        {submission?.submitted_at && <p className="text-xs text-ink/65">Handed in {new Date(submission.submitted_at).toLocaleString("en-GB")}</p>}
      </div>
      {submission?.response_text && <p className="mt-1 whitespace-pre-line rounded-md bg-cream p-2 text-sm text-ink/80">{submission.response_text}</p>}
      {submission?.link_url && (
        <p className="mt-1 text-sm">
          <a href={submission.link_url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-gold-700 underline">
            {submission.link_url}
          </a>
        </p>
      )}
      {submission && (
        <SubmissionFeedback
          submissionId={submissionId}
          homeworkId={submission.homework_id}
          childId={submission.child_id}
          childName={childName}
          maxPoints={maxPoints}
          files={submissionFiles(submission)}
          onChanged={onSaved}
        />
      )}
    </div>
  );
}

/**
 * A homework assignment as staff see it: details, an "Edited" stamp, Edit and Delete
 * (delete archives it: students stop seeing it, submissions and marks are kept, and
 * it can be restored), and the list of submissions to mark.
 */
export function HomeworkCard({
  hw,
  onEdit,
  onChanged,
  actions,
}: {
  hw: Homework;
  /** Shows an Edit button; the page decides how editing is presented. */
  onEdit?: (hw: Homework) => void;
  /** Called after the homework was archived or restored. */
  onChanged?: () => void;
  actions?: React.ReactNode;
}) {
  const supabase = getSupabaseClient();
  const [statuses, setStatuses] = useState<StatusRow[] | null>(null);
  const [children, setChildren] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const archived = !!hw.archived_at;
  const attachments = attachmentsOf(hw);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: statusRows } = await supabase.from("homework_status").select("child_id, status, submission_id").eq("homework_id", hw.id);
    setStatuses((statusRows as StatusRow[]) || []);
    const childIds = (statusRows || []).map((r) => r.child_id as string);
    if (childIds.length > 0) {
      const { data: kids } = await supabase.from("children").select("id, name").in("id", childIds);
      setChildren(Object.fromEntries(((kids as Child[]) || []).map((c) => [c.id, c.name])));
    }
  }, [supabase, hw.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    if (open) load();
  }, [open, load]);

  const setArchived = async (on: boolean) => {
    if (!supabase) return;
    if (on && !(await askConfirm(`Delete "${hw.title}"?\n\nPupils and families will no longer see it. Submissions, marks and feedback are kept, and you can restore it from "Show deleted".`))) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("homework").update({ archived_at: on ? new Date().toISOString() : null }).eq("id", hw.id);
    setBusy(false);
    if (err) setError(err.message);
    else onChanged?.();
  };

  const missing = (statuses || []).filter((s) => s.status === "missing").length;
  const late = (statuses || []).filter((s) => s.status === "late").length;
  const handedIn = (statuses || []).filter((s) => s.submission_id).length;

  return (
    <div className={`rounded-2xl border p-5 ${archived ? "border-ink/20 bg-ink/5" : "border-gold-light bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {hw.title}
            {archived && <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-normal text-ink/70">Deleted</span>}
          </p>
          <p className="text-xs text-ink/65">
            {hw.classes?.name} · Due {formatDue(hw.due_at)}
            {hw.edited_at && <span title={`Edited ${formatEdited(hw.edited_at)}`}> · Edited {formatEdited(hw.edited_at)}</span>}
          </p>
          <p className="mt-0.5 text-xs text-ink/65">
            Hand in: {describeAllowed(hw, { types: SUBMISSION_TYPE_LABEL, files: FILE_CATEGORY_LABEL })}
            {hw.max_points != null && ` · ${hw.max_points} marks`}
            {hw.late_policy === "block" && " · closes at the due time"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={btn("secondary", "sm")}>
            {open ? "Hide submissions" : "Submissions"}
          </button>
          {archived ? (
            <button type="button" disabled={busy} onClick={() => setArchived(false)} className={btn("ghost", "sm")}>
              Restore
            </button>
          ) : (
            <>
              {onEdit && (
                <button type="button" onClick={() => onEdit(hw)} className={btn("ghost", "sm")}>
                  Edit
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => setArchived(true)} className={`${ui.btnLinkDanger} px-1`}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {hw.instructions && <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-ink/70">{hw.instructions}</p>}
      {attachments.length > 0 && (
        <div className="mt-2">
          <FileLinks files={attachments} bucket="homework-attachments" />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-2 border-t border-gold-light/30 pt-3">
          {statuses === null ? (
            <Loading label="Loading…" bare />
          ) : statuses.length === 0 ? (
            <p className="text-sm text-ink/65">No enrolled pupils.</p>
          ) : (
            <>
              <p className="text-xs text-ink/65">
                {handedIn} of {statuses.length} handed in
                {missing > 0 && <span className="text-red-700"> · {missing} missing</span>}
                {late > 0 && <span className="text-amber-700"> · {late} late</span>}
              </p>
              {statuses.map((s) =>
                s.submission_id ? (
                  <MarkRow key={s.child_id} submissionId={s.submission_id} childName={children[s.child_id] || s.child_id} maxPoints={hw.max_points ?? null} onSaved={load} />
                ) : (
                  <div key={s.child_id} className="rounded-lg border border-gold-light/40 p-3 text-sm text-ink/65">
                    {children[s.child_id] || s.child_id} · not submitted{s.status === "missing" ? " (missing)" : ""}
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
