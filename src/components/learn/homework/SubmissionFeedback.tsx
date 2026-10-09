"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_STATUS_META,
  getFeedbackAudioBlobUrl,
  removeFeedbackAudio,
  uploadFeedbackAudio,
  type FeedbackStatus,
  type HomeworkFeedback,
} from "@/lib/learn/homeworkFeedback";
import { categoryOfMime, displayNameFromPath, parseFileRefs, type HomeworkFileRef } from "@/lib/learn/homeworkFiles";
import { parseMarkNumber } from "@/lib/learn/homework";
import { AudioNoteRecorder, type AudioNote } from "@/components/learn/homework/AudioNoteRecorder";
import { FileLinks, FileViewer, type ViewerFile } from "@/components/learn/homework/FileViewer";
import { Annotator, type MarkingBridge } from "@/components/learn/homework/annotator/Annotator";

/** Plays a feedback audio note. The audio is fetched (as a blob) only when asked for. */
export function FeedbackAudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const made = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (made.current) URL.revokeObjectURL(made.current);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const blobUrl = await getFeedbackAudioBlobUrl(path);
    setLoading(false);
    if (blobUrl) {
      made.current = blobUrl;
      setUrl(blobUrl);
    } else setFailed(true);
  };

  if (url) {
    return (
      <audio controls autoPlay src={url} className="mt-1 h-9 w-full max-w-xs">
        <track kind="captions" />
      </audio>
    );
  }
  return (
    <div className="mt-1">
      <button type="button" onClick={load} disabled={loading} className="text-sm font-semibold text-gold-700 underline disabled:opacity-50">
        {loading ? "Loading…" : "Play audio note"}
      </button>
      {failed && <span className="ml-2 text-xs text-red-700">Couldn&apos;t load the audio.</span>}
    </div>
  );
}

export function FeedbackStatusChip({ status }: { status: FeedbackStatus }) {
  const meta = FEEDBACK_STATUS_META[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${meta.className}`}>{meta.label}</span>;
}

/**
 * Read-only feedback for a student or parent: mark, written note, audio and the
 * teacher's marked copy of the work. `grade` is the text of a released mark
 * (e.g. "B+"); otherwise the numeric mark is shown.
 */
export function FeedbackView({ feedback, maxPoints, grade }: { feedback: HomeworkFeedback; maxPoints?: number | null; grade?: string | null }) {
  const markText = grade || (feedback.mark != null ? `${feedback.mark}${maxPoints != null ? ` / ${maxPoints}` : ""}` : null);
  const markedFiles = parseFileRefs(feedback.marked_files);
  return (
    <div className="rounded-lg border border-gold-light/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">Teacher feedback</p>
        <FeedbackStatusChip status={feedback.status} />
      </div>
      {markText && <p className="mt-1 text-sm font-semibold text-ink">Mark: {markText}</p>}
      {feedback.feedback_text && <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{feedback.feedback_text}</p>}
      {feedback.audio_path && <FeedbackAudioPlayer path={feedback.audio_path} />}
      {markedFiles.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink/70">Marked work</p>
          <FileLinks files={markedFiles} bucket="homework-marked" />
        </div>
      )}
      <p className="mt-1 text-xs text-ink/65">
        {new Date(feedback.given_at).toLocaleDateString("en-GB")}
        {feedback.resubmit_count > 0 ? ` · resubmitted ${feedback.resubmit_count} time${feedback.resubmit_count === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

type MarkupRow = { source_path: string; marked_path: string | null; marked_name: string | null; marked_mime: string | null; updated_at: string };
type MarksRow = { grade: string | null; feedback: string | null; released: boolean };

function canAnnotate(f: HomeworkFileRef): boolean {
  const k = categoryOfMime(f.mime);
  return k === "pdf" || k === "image";
}

/**
 * The teacher's marking form for one submission: open the work, mark it up in the
 * browser (annotator), give a mark, written feedback and/or an audio note, then
 * "Return to student" (or return and ask for a resubmission). It is the only place
 * feedback and marks are entered. Status changes after that (resubmitted) are made
 * by the database when the student or parent sends a new version.
 */
export function SubmissionFeedback({
  submissionId,
  homeworkId,
  childId,
  childName,
  maxPoints,
  files,
  onChanged,
}: {
  submissionId: string;
  homeworkId: string;
  childId: string;
  childName: string;
  maxPoints: number | null;
  files: HomeworkFileRef[];
  onChanged?: () => void;
}) {
  const supabase = getSupabaseClient();
  const [existing, setExisting] = useState<HomeworkFeedback | null>(null);
  const [markups, setMarkups] = useState<MarkupRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mark, setMark] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState<AudioNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<HomeworkFileRef | null>(null);
  const [viewing, setViewing] = useState<ViewerFile | null>(null);
  const initialised = useRef(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [fb, marks, mk] = await Promise.all([
      supabase.from("homework_feedback").select(FEEDBACK_COLUMNS).eq("submission_id", submissionId).maybeSingle(),
      supabase.from("homework_marks").select("grade, feedback, released").eq("submission_id", submissionId).maybeSingle(),
      supabase.from("homework_markup").select("source_path, marked_path, marked_name, marked_mime, updated_at").eq("submission_id", submissionId),
    ]);
    const row = (fb.data as HomeworkFeedback | null) || null;
    const legacy = (marks.data as MarksRow | null) || null;
    setExisting(row);
    setMarkups((mk.data as MarkupRow[] | null) || []);
    // Fill the form once; a reload after saving marks must not overwrite what is being typed.
    if (!initialised.current) {
      initialised.current = true;
      setText(row?.feedback_text || legacy?.feedback || "");
      setMark(legacy?.grade || (row?.mark != null ? String(row.mark) : ""));
    }
    setLoaded(true);
  }, [supabase, submissionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  /** Returns an error message, or null when the work was returned. */
  const sendReturn = async (status: Extract<FeedbackStatus, "feedback_given" | "resubmission_requested">): Promise<string | null> => {
    if (!supabase) return "Not connected.";
    const trimmed = text.trim();
    const markText = mark.trim();
    // Marked copies come from the database, so a copy saved a moment ago is included.
    const { data: mk } = await supabase.from("homework_markup").select("source_path, marked_path, marked_name, marked_mime").eq("submission_id", submissionId).not("marked_path", "is", null);
    const markedFiles = ((mk as Pick<MarkupRow, "source_path" | "marked_path" | "marked_name" | "marked_mime">[] | null) || []).map((r) => ({
      source: r.source_path,
      path: r.marked_path as string,
      name: r.marked_name || displayNameFromPath(r.marked_path as string),
      mime: r.marked_mime || "application/pdf",
    }));
    if (!trimmed && !note && !existing?.audio_path && !markText && markedFiles.length === 0) {
      return "Add a mark, some feedback, an audio note or marked work first.";
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "You are signed out. Please sign in again.";

    let audioPath = existing?.audio_path || null;
    let audioSeconds = existing?.audio_seconds ?? null;
    const replacedPath = note ? existing?.audio_path || null : null;
    if (note) {
      const up = await uploadFeedbackAudio(note.blob, note.mime, homeworkId, childId);
      if (up.error || !up.path) return up.error || "The audio note could not be uploaded.";
      audioPath = up.path;
      audioSeconds = note.seconds > 0 ? note.seconds : null;
    }

    const now = new Date().toISOString();
    const fbRes = await supabase.from("homework_feedback").upsert(
      {
        submission_id: submissionId,
        status,
        feedback_text: trimmed || null,
        audio_path: audioPath,
        audio_seconds: audioSeconds,
        mark: markText ? parseMarkNumber(markText) : null,
        marked_files: markedFiles,
        given_by: user.id,
        given_at: now,
      },
      { onConflict: "submission_id" }
    );
    if (fbRes.error) return fbRes.error.message;
    if (replacedPath && replacedPath !== audioPath) await removeFeedbackAudio(replacedPath);

    // Keep the mark book (used by dashboards and the weekly digest) in step: returning is releasing.
    const markRes = await supabase.from("homework_marks").upsert(
      {
        submission_id: submissionId,
        grade: markText || null,
        feedback: trimmed || null,
        released: true,
        marked_by: user.id,
        marked_at: now,
        released_by: user.id,
        released_at: now,
      },
      { onConflict: "submission_id" }
    );
    if (markRes.error) return markRes.error.message;

    setNote(null);
    await load();
    onChanged?.();
    return null;
  };

  const run = async (status: Extract<FeedbackStatus, "feedback_given" | "resubmission_requested">) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const err = await sendReturn(status);
      if (err) setError(err);
      else setInfo(status === "feedback_given" ? "Returned to the student." : "Returned, and a resubmission has been requested.");
    } finally {
      setBusy(false);
    }
  };

  // Before anything is returned the mark and note are kept as a private draft in the mark book.
  const saveDraft = async () => {
    if (!supabase) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error: err } = await supabase.from("homework_marks").upsert(
        { submission_id: submissionId, grade: mark.trim() || null, feedback: text.trim() || null, marked_by: user.id, marked_at: new Date().toISOString() },
        { onConflict: "submission_id" }
      );
      if (err) setError(err.message);
      else setInfo("Draft saved. The student can't see it yet.");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  const markupFor = (path: string) => markups.find((m) => m.source_path === path) || null;
  const bridge: MarkingBridge = {
    mark,
    onMarkChange: setMark,
    maxPoints,
    onReturn: () => sendReturn("feedback_given"),
  };

  return (
    <div className="mt-3 rounded-lg border border-gold-light/40 bg-white p-3">
      {files.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/60">Submitted files</p>
          <ul className="space-y-1.5">
            {files.map((f) => {
              const m = markupFor(f.path);
              return (
                <li key={f.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <button type="button" onClick={() => setViewing({ ...f, bucket: "homework-submissions" })} className="min-w-0 truncate text-left font-semibold text-gold-700 underline">
                    {f.name}
                  </button>
                  {canAnnotate(f) && (
                    <button type="button" onClick={() => setAnnotating(f)} className="rounded-md border border-gold-light bg-white px-2 py-0.5 text-xs font-medium text-ink/80 hover:bg-cream">
                      {m ? "Continue marking" : "Mark up"}
                    </button>
                  )}
                  {m?.marked_path && (
                    <button
                      type="button"
                      onClick={() => setViewing({ path: m.marked_path as string, name: m.marked_name || "Marked copy", mime: m.marked_mime || "application/pdf", size: 0, bucket: "homework-marked" })}
                      className="text-xs text-teal-800 underline"
                    >
                      Marked copy saved {new Date(m.updated_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Mark &amp; feedback</p>
        {existing && <FeedbackStatusChip status={existing.status} />}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-ink/70">Mark</span>
        <input
          type="text"
          value={mark}
          onChange={(e) => setMark(e.target.value)}
          placeholder={maxPoints != null ? `out of ${maxPoints}` : "e.g. 7/10 or B+"}
          className="w-36 rounded-md border border-gold-light/60 px-3 py-1.5 text-sm"
        />
      </label>
      {existing?.audio_path && !note && <FeedbackAudioPlayer path={existing.audio_path} />}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Written feedback (what went well, what to improve)"
        className="mt-2 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm"
      />
      <div className="mt-2">
        <AudioNoteRecorder value={note} onChange={setNote} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mt-2 text-sm text-green-700">
          {info}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run("feedback_given")}
          className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50"
        >
          {existing ? "Update & return" : "Return to student"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("resubmission_requested")}
          className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50"
        >
          Return &amp; request resubmission
        </button>
        {!existing && (
          <button type="button" disabled={busy} onClick={saveDraft} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50">
            Save draft
          </button>
        )}
        {busy && <span className="text-xs text-ink/60">Saving…</span>}
      </div>
      {existing?.status === "resubmitted" && existing.resubmitted_at && (
        <p className="mt-2 text-xs text-green-700">Resubmitted {new Date(existing.resubmitted_at).toLocaleString("en-GB")} — read the new version above, then return it again.</p>
      )}

      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
      {annotating && (
        <Annotator
          key={annotating.path}
          file={annotating}
          submissionId={submissionId}
          homeworkId={homeworkId}
          childId={childId}
          heading={childName}
          marking={bridge}
          onClose={() => setAnnotating(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
