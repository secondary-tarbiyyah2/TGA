export type AnnouncementRow = {
  id: string;
  scope: "class" | "school";
  class_id: string | null;
  title: string;
  body: string;
  author_id: string;
  created_at: string;
  edited_at: string | null;
  recalled_at: string | null;
  pinned: boolean;
  expires_at: string | null;
  classes?: { name: string } | null;
  profiles?: { full_name: string | null } | null;
};

export const ANNOUNCEMENT_COLUMNS =
  "id, scope, class_id, title, body, author_id, created_at, edited_at, recalled_at, pinned, expires_at, classes(name), profiles(full_name)";

export const NEW_DAYS = 3;

export function isExpired(a: { expires_at: string | null }): boolean {
  return a.expires_at !== null && new Date(a.expires_at).getTime() <= Date.now();
}

export function isNew(a: { created_at: string }): boolean {
  return Date.now() - new Date(a.created_at).getTime() < NEW_DAYS * 24 * 60 * 60 * 1000;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
