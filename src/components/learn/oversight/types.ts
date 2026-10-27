export type Category = "staff_staff" | "staff_parent" | "group";

export type OversightThread = {
  thread_id: string;
  kind: string;
  category: Category;
  name_a: string | null;
  role_a: string;
  name_b: string | null;
  role_b: string;
  child_name: string | null;
  created_at: string;
  last_at: string | null;
  last_preview: string | null;
  last_sender_id: string | null;
  message_count: number;
  flagged_count: number;
};

export type OversightMessage = {
  id: string;
  sender_id: string;
  sender_name: string | null;
  body: string;
  original_body: string | null;
  created_at: string;
  flagged: boolean;
  flagged_keywords: string[] | null;
  edited_at: string | null;
  recalled_at: string | null;
};

export function threadTitle(t: OversightThread): string {
  return `${t.name_a || "Unknown"} ↔ ${t.name_b || "Unknown"}`;
}

export function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // UK time, whatever zone the viewer's browser is in.
  const day = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  if (day(d) === day(new Date())) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}
