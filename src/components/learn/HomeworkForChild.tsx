"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FEEDBACK_COLUMNS, type HomeworkFeedback } from "@/lib/learn/homeworkFeedback";
import { FILE_CATEGORY_LABEL, SUBMISSION_TYPE_LABEL, submissionFiles } from "@/lib/learn/homeworkFiles";
import { attachmentsOf, describeAllowed, formatEdited, type Homework } from "@/lib/learn/homework";
import { FeedbackStatusChip, FeedbackView } from "@/components/learn/homework/SubmissionFeedback";
import { FileLinks } from "@/components/learn/homework/FileViewer";
import { SubmitWork, type ExistingSubmission } from "@/components/learn/homework/SubmitWork";
import { useNow } from "@/lib/learn/useNow";

type HomeworkInfo = Pick<
  Homework,
  "title" | "instructions" | "max_points" | "allowed_submission_types" | "allowed_file_types" | "late_policy" | "attachments" | "edited_at"
>;
type Row = {
  homework_id: string;
  due_at: string;
  status: string;
  submission_id: string | null;
  homework: HomeworkInfo | null;
};
type Submission = {
  id: string;
  kind: string;
  response_text: string | null;
  link_url: string | null;
  file_path: string | null;
  files: unknown;
  submitted_at: string | null;
};
type Mark = { grade: string | null; feedback: string | null; released: boolean };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  missing: { label: "Missing", className: "bg-red-100 text-red-700" },
  late: { label: "Late", className: "bg-amber-100 text-amber-700" },
  on_time: { label: "Submitted", className: "bg-green-100 text-green-700" },
  not_yet_due: { label: "Due", className: "bg-gold-light/40 text-gold-700" },
};

function HomeworkItem({
  row,
  childId,
  canSubmit,
  canResubmit,
  feedback,
  onChanged,
}: {
  row: Row;
  childId: string;
  canSubmit: boolean;
  canResubmit: boolean;
  feedback: HomeworkFeedback | null;
  onChanged: () => void;
}) {
  const supabase = getSupabaseClient();
  const now = useNow();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const hw = row.homework;
  const loadDetail = async () => {
    if (!supabase || !row.submission_id) return;
    const { data: sub } = await supabase
      .from("homework_submissions")
      .select("id, kind, response_text, link_url, file_path, files, submitted_at")
      .eq("id", row.submission_id)
      .maybeSingle();
    setSubmission((sub as Submission) || null);
    const { data: markRow } = await supabase.from("homework_marks").select("grade, feedback, released").eq("submission_id", row.submission_id).maybeSingle();
    setMark((markRow as Mark) || null);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    if (expanded) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, supabase]);

  const done = () => {
    setReplacing(false);
    onChanged();
    loadDetail();
  };

  const awaitingResubmission = feedback?.status === "resubmission_requested";
  const statusMeta = STATUS_LABEL[row.status] || STATUS_LABEL.not_yet_due;
  const closed = hw?.late_policy === "block" && new Date(row.due_at).getTime() < now;
  const attachments = hw ? attachmentsOf(hw) : [];
  const existing: ExistingSubmission | null = submission
    ? { id: submission.id, response_text: submission.response_text, link_url: submission.link_url, files: submissionFiles(submission) }
    : null;
  // Students may replace their work until it has feedback. A parent's update is only allowed by the
  // database while a resubmission is requested, so for them (canResubmit) only that case is offered.
  const mayReplaceFreely = canSubmit && !canResubmit && !feedback;
  const mayHandIn = canSubmit || canResubmit;

  return (
    <li className="rounded-lg border border-gold-light/40 p-3">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={expanded}>
        <span className="text-sm font-medium text-ink">{hw?.title || "Homework"}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-ink/65">{new Date(row.due_at).toLocaleDateString("en-GB")}</span>
          <span className={`rounded-full px-2 py-0.5 ${statusMeta.className}`}>{statusMeta.label}</span>
          {feedback && <FeedbackStatusChip status={feedback.status} />}
        </span>
      </button>
      {expanded && hw && (
        <div className="mt-3 space-y-3 border-t border-gold-light/30 pt-3 text-sm">
          <div className="space-y-1">
            {hw.instructions && <p className="whitespace-pre-line text-ink/70">{hw.instructions}</p>}
            <p className="text-xs text-ink/65">
              Due {new Date(row.due_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              {hw.max_points != null && ` · ${hw.max_points} marks`}
              {hw.edited_at && ` · Edited ${formatEdited(hw.edited_at)}`}
            </p>
            {attachments.length > 0 && <FileLinks files={attachments} bucket="homework-attachments" />}
          </div>

          {submission ? (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs text-ink/65">Handed in {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("en-GB") : "—"}</p>
              {submission.response_text && <p className="mt-1 whitespace-pre-line">{submission.response_text}</p>}
              {submission.link_url && (
                <p className="mt-1">
                  <a href={submission.link_url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-gold-700 underline">
                    {submission.link_url}
                  </a>
                </p>
              )}
              <div className="mt-1">
                <FileLinks files={submissionFiles(submission)} bucket="homework-submissions" />
              </div>
              {mayReplaceFreely && !replacing && !closed && (
                <button type="button" onClick={() => setReplacing(true)} className="mt-2 text-xs font-semibold text-gold-700 underline">
                  Replace my work
                </button>
              )}
            </div>
          ) : mayHandIn ? (
            closed ? (
              <p className="rounded-lg bg-amber-50 p-3 text-amber-900">This homework is closed. It no longer accepts work after the due time.</p>
            ) : (
              <div>
                <p className="mb-2 text-xs text-ink/65">
                  You can hand in: {describeAllowed(hw as Homework, { types: SUBMISSION_TYPE_LABEL, files: FILE_CATEGORY_LABEL }).toLowerCase()}
                </p>
                <SubmitWork homework={{ id: row.homework_id, allowed_submission_types: hw.allowed_submission_types, allowed_file_types: hw.allowed_file_types }} childId={childId} actionLabel="Hand in" onDone={done} />
              </div>
            )
          ) : (
            <p className="text-ink/65">Not yet submitted.</p>
          )}

          {feedback ? (
            <FeedbackView feedback={feedback} maxPoints={hw.max_points ?? null} grade={mark?.released ? mark.grade : null} />
          ) : (
            mark?.released && (
              <div className="rounded-lg border border-gold-light/40 p-3">
                <p className="text-xs font-medium text-ink">Teacher feedback</p>
                {mark.grade && <p className="text-sm font-semibold">Mark: {mark.grade}</p>}
                {mark.feedback && <p className="text-sm text-ink/70">{mark.feedback}</p>}
              </div>
            )
          )}

          {submission && existing && ((awaitingResubmission && mayHandIn) || replacing) && (
            <div className={`space-y-2 rounded-lg border p-3 ${awaitingResubmission ? "border-amber-200 bg-amber-50" : "border-gold-light/40"}`}>
              <p className={`text-xs font-medium ${awaitingResubmission ? "text-amber-900" : "text-ink/70"}`}>
                {awaitingResubmission ? "Your teacher has asked for a resubmission. Send an improved version below." : "Change what you handed in."}
              </p>
              <SubmitWork
                homework={{ id: row.homework_id, allowed_submission_types: hw.allowed_submission_types, allowed_file_types: hw.allowed_file_types }}
                childId={childId}
                existing={existing}
                actionLabel={awaitingResubmission ? "Resubmit" : "Save changes"}
                onDone={done}
              />
              {replacing && !awaitingResubmission && (
                <button type="button" onClick={() => setReplacing(false)} className="text-xs text-ink/65 underline">
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Shared homework list for a parent or a student. canSubmit: may hand in first
 * work (students, and parents on their child's behalf). canResubmit marks the
 * viewer as a parent, who may only update work while a resubmission is requested.
 */
export function HomeworkForChild({ childId, canSubmit, classId, canResubmit = false }: { childId: string; canSubmit: boolean; classId?: string; canResubmit?: boolean }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [feedbackBySubmission, setFeedbackBySubmission] = useState<Record<string, HomeworkFeedback>>({});

  const load = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("homework_status")
      .select("homework_id, due_at, status, submission_id, homework:homework_id(title, instructions, max_points, allowed_submission_types, allowed_file_types, late_policy, attachments, edited_at)")
      .eq("child_id", childId)
      .match(classId ? { class_id: classId } : {})
      .order("due_at", { ascending: false });
    // Archived homework is hidden from families by RLS, so its embedded homework comes back null.
    setRows(((data as unknown as Row[]) || []).filter((r) => r.homework));
    // Teacher feedback for this child's submissions (RLS limits it to what the viewer may see).
    const { data: fb } = await supabase
      .from("homework_feedback")
      .select(`${FEEDBACK_COLUMNS}, submission:submission_id!inner(child_id)`)
      .eq("submission.child_id", childId);
    const map: Record<string, HomeworkFeedback> = {};
    for (const f of (fb as unknown as HomeworkFeedback[]) || []) map[f.submission_id] = f;
    setFeedbackBySubmission(map);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, childId, classId]);

  if (rows === null) return <p className="text-sm text-ink/65">Loading homework…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/65">No homework set yet.</p>;

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <HomeworkItem
          key={r.homework_id}
          row={r}
          childId={childId}
          canSubmit={canSubmit}
          canResubmit={canResubmit}
          feedback={r.submission_id ? feedbackBySubmission[r.submission_id] || null : null}
          onChanged={load}
        />
      ))}
    </ul>
  );
}
