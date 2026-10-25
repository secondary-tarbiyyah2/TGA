// Shared types and helpers for the Weekly digest admin pages.

export type DigestFamily = {
  parent_user_id: string;
  parent_name: string;
  parent_email: string;
  children: string[];
  children_detail?: { name: string; year_group: string | null }[];
  is_test?: boolean;
  opted_out: boolean;
  this_week: "sending" | "sent" | "failed" | null;
  this_week_sent_at?: string | null;
  this_week_detail?: string | null;
};

export type DigestView = "overview" | "families" | "history" | "settings" | "preview";

export const STATUS_TEXT: Record<string, string> = { sent: "Sent", sending: "Sending", failed: "Failed" };

export function digestHref(p: { view?: DigestView; parent?: string } = {}): string {
  const q = new URLSearchParams();
  if (p.view && p.view !== "overview") q.set("view", p.view);
  if (p.parent) q.set("parent", p.parent);
  const s = q.toString();
  return `/admin/digest${s ? `?${s}` : ""}`;
}

/** The UK wall-clock parts of an instant. */
function ukParts(d: Date): { y: number; m: number; day: number; wd: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")), day: Number(get("day")), wd, h: Number(get("hour")), min: Number(get("minute")) };
}

/** The next Friday-afternoon send (the scheduled run is 15:05 UK time), as a UK date label. */
export function nextSendLabel(now = new Date()): string {
  const p = ukParts(now);
  let add = (5 - p.wd + 7) % 7;
  if (add === 0 && (p.h > 15 || (p.h === 15 && p.min >= 30))) add = 7;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.day + add, 12));
  const label = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${add === 0 ? "Today" : label}, about 3pm`;
}

export const stampLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "–";

export const weekLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
