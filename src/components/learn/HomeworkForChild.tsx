"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getHomeworkFileUrl } from "@/lib/learn/homeworkFile";

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

function HomeworkItem({ row, childId, canSubmit, onChanged }: { row: Row; childId: string; canSubmit: boolean; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [responseText, setResponseText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);

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

  const statusMeta = STATUS_LABEL[row.status] || STATUS_LABEL.not_yet_due;

  return (
    <li className="rounded-lg border border-gold-light/40 p-3">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-ink">{row.homework?.title || "Homework"}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-ink/60">{new Date(row.due_at).toLocaleDateString("en-GB")}</span>
          <span className={`rounded-full px-2 py-0.5 ${statusMeta.className}`}>{statusMeta.label}</span>
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
export function HomeworkForChild({ childId, canSubmit }: { childId: string; canSubmit: boolean }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("homework_status")
      .select("homework_id, due_at, status, submission_id, homework:homework_id(title, instructions)")
      .eq("child_id", childId)
      .order("due_at", { ascending: false });
    setRows((data as unknown as Row[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, childId]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading homework…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No homework set yet.</p>;

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <HomeworkItem key={r.homework_id} row={r} childId={childId} canSubmit={canSubmit} onChanged={load} />
      ))}
    </ul>
  );
}
