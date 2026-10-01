import { getSupabaseClient } from "@/lib/supabase/client";

// Homework feedback loop (supabase/migrations/0071_homework_feedback.sql).
// Teacher feedback is typed text and/or a short audio note kept in the private
// 'homework-feedback-audio' bucket. The status workflow per submission is
//   submitted -> feedback_given -> resubmission_requested -> resubmitted
// where "submitted" simply means there is no feedback row yet.

export type FeedbackStatus = "feedback_given" | "resubmission_requested" | "resubmitted";

export type HomeworkFeedback = {
  id: string;
  submission_id: string;
  status: FeedbackStatus;
  feedback_text: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  resubmit_count: number;
  given_at: string;
  requested_at: string | null;
  resubmitted_at: string | null;
};

export const FEEDBACK_COLUMNS =
  "id, submission_id, status, feedback_text, audio_path, audio_seconds, resubmit_count, given_at, requested_at, resubmitted_at";

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, { label: string; className: string }> = {
  feedback_given: { label: "Feedback given", className: "bg-teal-100 text-teal-800" },
  resubmission_requested: { label: "Resubmission requested", className: "bg-amber-100 text-amber-800" },
  resubmitted: { label: "Resubmitted", className: "bg-green-100 text-green-700" },
};

export const FEEDBACK_AUDIO_BUCKET = "homework-feedback-audio";

/** The bucket rejects anything larger, so the browser checks first. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** A recording stops by itself at this length (keeps notes short and under the size cap). */
export const MAX_AUDIO_SECONDS = 120;

export type AudioMime = "audio/webm" | "audio/mp4";

/** Reduces "audio/webm;codecs=opus" and friends to the two types the bucket accepts. */
export function audioMimeBase(type: string | null | undefined): AudioMime | null {
  const base = (type || "").split(";")[0].trim().toLowerCase();
  if (base === "audio/webm") return "audio/webm";
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  return null;
}

/** Can this browser record audio at all? (False on old browsers and insecure origins.) */
export function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** The best recorder format the browser supports (Chrome/Firefox: webm, Safari: mp4). */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A short-lived signed URL; createSignedUrl enforces the same RLS as a direct read. */
export async function getFeedbackAudioUrl(path: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.storage.from(FEEDBACK_AUDIO_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl || null;
}

/** Uploads a feedback audio note into <homework_id>/<child_id>/ and returns its object name. */
export async function uploadFeedbackAudio(
  blob: Blob,
  mime: AudioMime,
  homeworkId: string,
  childId: string
): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { path: null, error: "Not connected." };
  if (blob.size > MAX_AUDIO_BYTES) return { path: null, error: "That recording is over 2MB. Please record a shorter note." };
  const ext = mime === "audio/webm" ? "webm" : "m4a";
  const path = `${homeworkId}/${childId}/feedback-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(FEEDBACK_AUDIO_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function removeFeedbackAudio(path: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.storage.from(FEEDBACK_AUDIO_BUCKET).remove([path]);
}

/** "Late & missing" row, from the homework_attention view. */
export type AttentionKind = "missing" | "late" | "resubmission_requested";
export type AttentionRow = {
  homework_id: string;
  homework_title: string | null;
  class_id: string;
  class_name: string | null;
  due_at: string;
  child_id: string;
  child_name: string | null;
  submission_id: string | null;
  submitted_at: string | null;
  attention: AttentionKind;
  resubmission_requested_at: string | null;
};

export const ATTENTION_META: Record<AttentionKind, { label: string; className: string }> = {
  missing: { label: "Missing", className: "bg-red-100 text-red-700" },
  late: { label: "Late", className: "bg-amber-100 text-amber-700" },
  resubmission_requested: { label: "Resubmission requested", className: "bg-amber-100 text-amber-800" },
};
