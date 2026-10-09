// Feedback and improvement tickets (migration 0092_feedback_tickets.sql).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent } from "@/lib/learn/activityLog";

export type FeedbackKind = "problem" | "idea" | "question";
export type FeedbackStatus = "new" | "in_progress" | "planned" | "done" | "wont_fix";
export type FeedbackPriority = "low" | "normal" | "high";
export type FeedbackAttachment = { path: string; name: string; mime: string; size: number };

export type FeedbackTicket = {
  id: string;
  number: number;
  submitted_by: string | null;
  submitter_roles: string[];
  kind: FeedbackKind;
  title: string;
  details: string;
  page_path: string | null;
  activity: ActivityEvent[];
  environment: Record<string, string | number | boolean> | null;
  attachments: FeedbackAttachment[];
  status: FeedbackStatus;
  priority: FeedbackPriority;
  response: string | null;
  responded_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; email?: string | null } | null;
};

export const FEEDBACK_BUCKET = "feedback-attachments";
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Mirrors the bucket's allowed_mime_types in 0092. */
export const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.mp4,.webm,.mov";

export const KIND_LABEL: Record<FeedbackKind, string> = {
  problem: "Something's not working",
  idea: "Idea to improve",
  question: "Question",
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  in_progress: "Being looked at",
  planned: "Planned",
  done: "Done",
  wont_fix: "Not going ahead",
};

/** Pill colours per status (text on tint, AA contrast). */
export const STATUS_TONE: Record<FeedbackStatus, string> = {
  new: "bg-gold-100 text-gold-900",
  in_progress: "bg-teal-100 text-teal-900",
  planned: "bg-cream text-ink",
  done: "bg-green-50 text-green-800",
  wont_fix: "bg-cream text-ink/70",
};

export const ticketRef = (n: number) => `FB-${String(n).padStart(4, "0")}`;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a file can't be attached, or null if it's fine. */
export function fileProblem(f: File): string | null {
  if (f.size > MAX_FILE_BYTES) return `${f.name} is over 10 MB.`;
  if (f.type && !ALLOWED_MIME.includes(f.type)) return `${f.name} isn't a supported file type.`;
  if (!f.type && !/\.(png|jpe?g|webp|gif|heic|heif|pdf|txt|csv|docx|xlsx|pptx|mp4|webm|mov)$/i.test(f.name)) return `${f.name} isn't a supported file type.`;
  return null;
}

/** Browser details that help reproduce a problem. No identifiers. */
export function environmentSnapshot(): Record<string, string | number | boolean> {
  return {
    userAgent: navigator.userAgent.slice(0, 300),
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${window.screen.width}×${window.screen.height}`,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: navigator.onLine,
  };
}

const safeFileName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").slice(-100) || "file";

/**
 * Upload files into the sender's own folder, then create the ticket. If the
 * ticket can't be saved, the uploaded files are removed again.
 */
export async function submitFeedback(
  supabase: SupabaseClient,
  input: { kind: FeedbackKind; title: string; details: string; pagePath: string; activity: ActivityEvent[]; files: File[] },
): Promise<{ ok: true; number: number } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You've been signed out. Sign in again and try once more." };

  const batch = crypto.randomUUID();
  const uploaded: FeedbackAttachment[] = [];
  for (const [i, f] of input.files.entries()) {
    const path = `${user.id}/${batch}/${i + 1}-${safeFileName(f.name)}`;
    const { error } = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) {
      if (uploaded.length) await supabase.storage.from(FEEDBACK_BUCKET).remove(uploaded.map((u) => u.path));
      return { ok: false, error: `Couldn't upload ${f.name}. Check the file and try again.` };
    }
    uploaded.push({ path, name: f.name.slice(0, 200), mime: f.type || "application/octet-stream", size: f.size });
  }

  const { data, error } = await supabase
    .from("feedback_tickets")
    .insert({
      kind: input.kind,
      title: input.title.trim(),
      details: input.details.trim(),
      page_path: input.pagePath.slice(0, 500),
      activity: input.activity.slice(-80),
      environment: environmentSnapshot(),
      attachments: uploaded,
    })
    .select("number")
    .single();
  if (error || !data) {
    if (uploaded.length) await supabase.storage.from(FEEDBACK_BUCKET).remove(uploaded.map((u) => u.path));
    return { ok: false, error: "Your feedback couldn't be sent. Try again in a moment." };
  }
  return { ok: true, number: (data as { number: number }).number };
}

/** A short-lived link to open one attached file. */
export async function attachmentUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl || null;
}
