"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getHomeworkFileUrl } from "@/lib/learn/homeworkFile";
import { FEEDBACK_COLUMNS, type HomeworkFeedback } from "@/lib/learn/homeworkFeedback";
import { FeedbackStatusChip, FeedbackView } from "@/components/learn/homework/SubmissionFeedback";

type Row = {
  homework_id: string;
  due_at: string;
  status: string;
  submission_id: string | null;
  homework: { title: string; instructions: string | null } | null;
};
type Submission = { id: string; kind: string; response_text: string | null; file_path: string | null; submitted_at: string | null };
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
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [responseText, setResponseText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [resubText, setResubText] = useState("");
  const [resubFile, setResubFile] = useState<File | null>(null);
  const [resubError, setResubError] = useState<string | null>(null);

  const openFile = async () => {
    if (!submission?.file_path) return;
    setOpeningFile(true);
    const url = await getHomeworkFileUrl(submission.file_path);
    setOpeningFile(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const loadDetail = async () => {
    if (!supabase || !row.submission_id) return;
    const { data: sub } = await supabase
      .from("homework_submissions")
      .select("id, kind, response_text, file_path, submitted_at")
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

  const submitText = async () => {
    if (!supabase || !responseText.trim()) return;
    setBusy(true);
    try {
      await supabase.from("homework_submissions").upsert(
        { homework_id: row.homework_id, child_id: childId, kind: "text", response_text: responseText.trim(), submitted_at: new Date().toISOString() },
        { onConflict: "homework_id,child_id" }
      );
      setResponseText("");
      onChanged();
      await loadDetail();
    } finally {
      setBusy(false);
    }
  };

  const submitFile = async () => {
    if (!supabase || !file) return;
    setBusy(true);
    try {
      const path = `${row.homework_id}/${childId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("homework-submissions").upload(path, file);
      if (uploadErr) return;
      await supabase.from("homework_submissions").upsert(
        { homework_id: row.homework_id, child_id: childId, kind: "file", file_path: path, submitted_at: new Date().toISOString() },
        { onConflict: "homework_id,child_id" }
      );
      setFile(null);
      onChanged();
      await loadDetail();
    } finally {
      setBusy(false);
    }
  };

  // A resubmission UPDATES the existing submission (never inserts): the
  // database notices the content change and moves the feedback status from
  // "resubmission requested" to "resubmitted". submitted_at is left alone so
  // the original on-time/late record is kept.
  const resubmitText = async () => {
    if (!supabase || !submission || !resubText.trim()) return;
    setBusy(true);
    setResubError(null);
    try {
      const { error } = await supabase
        .from("homework_submissions")
        .update({ kind: "text", response_text: resubText.trim(), file_path: null })
        .eq("id", submission.id);
      if (error) {
        setResubError(error.message);
        return;
      }
      setResubText("");
      onChanged();
      await loadDetail();
    } finally {
      setBusy(false);
    }
  };

  const resubmitFile = async () => {
    if (!supabase || !submission || !resubFile) return;
    setBusy(true);
    setResubError(null);
    try {
      const path = `${row.homework_id}/${childId}/${Date.now()}-${resubFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("homework-submissions").upload(path, resubFile);
      if (uploadErr) {
        setResubError(uploadErr.message);
        return;
      }
      const { error } = await supabase
        .from("homework_submissions")
        .update({ kind: "file", file_path: path, response_text: null })
        .eq("id", submission.id);
      if (error) {
        setResubError(error.message);
        return;
      }
      setResubFile(null);
      onChanged();
      await loadDetail();
    } finally {
      setBusy(false);
    }
  };

  const awaitingResubmission = feedback?.status === "resubmission_requested";
  const statusMeta = STATUS_LABEL[row.status] || STATUS_LABEL.not_yet_due;

  return (
    <li className="rounded-lg border border-gold-light/40 p-3">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-ink">{row.homework?.title || "Homework"}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-ink/60">{new Date(row.due_at).toLocaleDateString("en-GB")}</span>
          <span className={`rounded-full px-2 py-0.5 ${statusMeta.className}`}>{statusMeta.label}</span>
          {feedback && <FeedbackStatusChip status={feedback.status} />}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-gold-light/30 pt-3 text-sm">
          {row.homework?.instructions && <p className="text-ink/70">{row.homework.instructions}</p>}
          {submission ? (
            <div className="rounded-lg bg-cream p-3">
              <p className="text-xs text-ink/60">
                Submitted {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("en-GB") : "—"}
              </p>
              {submission.kind === "text" && <p className="mt-1">{submission.response_text}</p>}
              {submission.kind === "file" && (
                <button type="button" onClick={openFile} disabled={openingFile} className="mt-1 text-sm font-semibold text-gold-700 underline disabled:opacity-50">
                  {openingFile ? "Opening…" : "Open uploaded file"}
                </button>
              )}
            </div>
          ) : canSubmit ? (
            <div className="space-y-2">
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Type your answer…"
                rows={3}
                className="w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
              />
              <button type="button" disabled={!responseText.trim() || busy} onClick={submitText} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm text-white disabled:opacity-50 hover:bg-gold-900 font-medium transition-colors">
                Submit text
              </button>
              <div className="flex items-center gap-2 pt-1">
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
                <button type="button" disabled={!file || busy} onClick={submitFile} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs disabled:opacity-50 bg-white text-ink/80 hover:bg-cream font-medium transition-colors">
                  Upload file
                </button>
              </div>
            </div>
          ) : (
            <p className="text-ink/60">Not yet submitted.</p>
          )}
          {feedback && <FeedbackView feedback={feedback} />}
          {awaitingResubmission && submission && (canSubmit || canResubmit) && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-900">Your teacher has asked for a resubmission. Send an improved version below.</p>
              <textarea
                value={resubText}
                onChange={(e) => setResubText(e.target.value)}
                placeholder="Type your improved answer…"
                rows={3}
                className="w-full rounded-md border border-gold-light/60 bg-white px-3 py-2 text-sm"
              />
              <button type="button" disabled={!resubText.trim() || busy} onClick={resubmitText} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
                Resubmit text
              </button>
              <div className="flex items-center gap-2 pt-1">
                <input type="file" onChange={(e) => setResubFile(e.target.files?.[0] || null)} className="text-xs" />
                <button type="button" disabled={!resubFile || busy} onClick={resubmitFile} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50">
                  Resubmit file
                </button>
              </div>
              {resubError && <p className="text-xs text-red-700">{resubError}</p>}
            </div>
          )}
          {mark?.released && (
            <div className="rounded-lg border border-gold-light/40 p-3">
              <p className="text-xs font-medium text-ink">Feedback</p>
              {mark.grade && <p className="text-sm">Grade: {mark.grade}</p>}
              {mark.feedback && <p className="text-sm text-ink/70">{mark.feedback}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Shared homework list for a parent (canSubmit=false, they view only) or
 * a student (canSubmit=true, viewing/submitting their own homework). */
export function HomeworkForChild({ childId, canSubmit, classId, canResubmit = false }: { childId: string; canSubmit: boolean; classId?: string; canResubmit?: boolean }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [feedbackBySubmission, setFeedbackBySubmission] = useState<Record<string, HomeworkFeedback>>({});

  const load = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("homework_status")
      .select("homework_id, due_at, status, submission_id, homework:homework_id(title, instructions)")
      .eq("child_id", childId)
      .match(classId ? { class_id: classId } : {})
      .order("due_at", { ascending: false });
    setRows((data as unknown as Row[]) || []);
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

  if (rows === null) return <p className="text-sm text-ink/60">Loading homework…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No homework set yet.</p>;

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
