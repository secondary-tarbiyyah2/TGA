// Shared types and small helpers for Messages (MessagesHub, MessageThread,
// NewConversation, GroupInfo). The data comes from 0204's my_message_threads().

export type InboxRow = {
  thread_id: string;
  kind: "parent_teacher" | "staff" | "direct" | "group";
  title: string;
  subtitle: string | null;
  other_user_id: string | null;
  group_type: "class" | "year_group" | "staff" | "ad_hoc" | null;
  member_count: number;
  includes_pupils: boolean;
  my_role: "staff" | "parent" | "pupil" | null;
  is_admin: boolean;
  members_can_reply: boolean;
  can_post: boolean;
  created_at: string;
  last_at: string | null;
  last_preview: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  unread: number;
};

export type Person = { user_id: string; full_name: string; roles: string[]; detail: string | null };

export const STAFF_ROLE_IDS = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco", "digital_lead"];

/** Files staff may attach: documents and pictures (the bucket's own list, 0204). */
export const ATTACH_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif";
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACH_MAX_FILES = 5;

export const GROUP_TYPE_LABEL: Record<string, string> = { class: "Class group", year_group: "Year group", staff: "Staff group", ad_hoc: "Group" };

export function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function ago(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000 && d.toDateString() === new Date().toDateString()) return timeOf(iso);
  if (diff < 6 * 86_400_000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
