"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_STATUS_META,
  getFeedbackAudioUrl,
  removeFeedbackAudio,
  uploadFeedbackAudio,
  type FeedbackStatus,
  type HomeworkFeedback,
} from "@/lib/learn/homeworkFeedback";
import { AudioNoteRecorder, type AudioNote } from "@/components/learn/homework/AudioNoteRecorder";

/** Plays a feedback audio note. The signed URL is fetched only when asked for. */
export function FeedbackAudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const signed = await getFeedbackAudioUrl(path);
    setLoading(false);
    if (signed) setUrl(signed);
    else setFailed(true);
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

/** Read-only feedback for a student or parent. */
export function FeedbackView({ feedback }: { feedback: HomeworkFeedback }) {
  return (
    <div className="rounded-lg border border-gold-light/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">Teacher feedback</p>
        <FeedbackStatusChip status={feedback.status} />
      </div>
      {feedback.feedback_text && <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{feedback.feedback_text}</p>}
      {feedback.audio_path && <FeedbackAudioPlayer path={feedback.audio_path} />}
      <p className="mt-1 text-xs text-ink/50">
        {new Date(feedback.given_at).toLocaleDateString("en-GB")}
        {feedback.resubmit_count > 0 ? ` · resubmitted ${feedback.resubmit_count} time${feedback.resubmit_count === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

/**
 * The teacher's side of the feedback loop for one submission: typed feedback
 * and/or an audio note, then either "Send feedback" or "Send & request
 * resubmission". Status changes after that (resubmitted) are made by the
 * database when the student or parent sends a new version.
 */
export function SubmissionFeedback({ submissionId, homeworkId, childId }: { submissionId: string; homeworkId: string; childId: string }) {
  const supabase = getSupabaseClient();
  const [existing, setExisting] = useState<HomeworkFeedback | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState<AudioNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("homework_feedback").select(FEEDBACK_COLUMNS).eq("submission_id", submissionId).maybeSingle();
    const row = (data as HomeworkFeedback | null) || null;
    setExisting(row);
    setText(row?.feedback_text || "");
    setLoaded(true);
  }, [supabase, submissionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const send = async (status: Extract<FeedbackStatus, "feedback_given" | "resubmission_requested">) => {
    if (!supabase) return;
    setError(null);
    const trimmed = text.trim();
    if (!trimmed && !note && !existing?.audio_path) {
      setError("Add some written feedback or record an audio note first.");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let audioPath = existing?.audio_path || null;
      let audioSeconds = existing?.audio_seconds ?? null;
      const replacedPath = note ? existing?.audio_path || null : null;
      if (note) {
        const up = await uploadFeedbackAudio(note.blob, note.mime, homeworkId, childId);
        if (up.error || !up.path) {
          setError(up.error || "The audio note could not be uploaded.");
          return;
        }
        audioPath = up.path;
        audioSeconds = note.seconds > 0 ? note.seconds : null;
      }

      const payload = {
        status,
        feedback_text: trimmed || null,
        audio_path: audioPath,
        audio_seconds: audioSeconds,
        given_by: user.id,
        given_at: new Date().toISOString(),
      };
      const res = existing
        ? await supabase.from("homework_feedback").update(payload).eq("id", existing.id)
        : await supabase.from("homework_feedback").insert({ ...payload, submission_id: submissionId });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (replacedPath && replacedPath !== audioPath) await removeFeedbackAudio(replacedPath);
      setNote(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="mt-3 rounded-lg border border-gold-light/40 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">Feedback to the student</p>
        {existing && <FeedbackStatusChip status={existing.status} />}
      </div>
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
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send("feedback_given")}
          className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50"
        >
          {existing ? "Update feedback" : "Send feedback"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => send("resubmission_requested")}
          className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50"
        >
          Send &amp; request resubmission
        </button>
        {busy && <span className="text-xs text-ink/60">Saving…</span>}
      </div>
      {existing?.status === "resubmitted" && existing.resubmitted_at && (
        <p className="mt-2 text-xs text-green-700">Resubmitted {new Date(existing.resubmitted_at).toLocaleString("en-GB")} — read the new version above, then send feedback again.</p>
      )}
    </div>
  );
}
