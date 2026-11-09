import type { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";

import type { IconName } from "@/components/learn/Icon";
export type Sb = NonNullable<ReturnType<typeof getSupabaseClient>>;

export type BehaviourKind = "merit" | "demerit" | "incident";
export type DetentionStatus = "scheduled" | "served" | "missed" | "cancelled";

export type BehaviourRecord = {
  id: string;
  child_id: string;
  class_id: string | null;
  kind: BehaviourKind;
  points: number;
  category: string;
  note: string | null;
  occurred_on: string;
  created_at: string;
  voided_at: string | null;
  children?: { name: string; year_group_id: string | null } | null;
  classes?: { name: string } | null;
};

export type Detention = {
  id: string;
  child_id: string;
  behaviour_record_id: string | null;
  scheduled_for: string;
  duration_minutes: number;
  status: DetentionStatus;
  notes: string | null;
  children?: { name: string; year_group_id: string | null } | null;
};

export type BadgeAward = {
  id: string;
  child_id: string;
  badge: string;
  awarded_on: string;
  children?: { name: string; year_group_id: string | null } | null;
};

/** One student in one class (a child in two classes appears twice). */
export type StudentOption = { childId: string; name: string; classId: string | null; className: string | null; yearGroupId: string | null };

export const RECORD_SELECT =
  "id, child_id, class_id, kind, points, category, note, occurred_on, created_at, voided_at, children(name, year_group_id), classes(name)";
export const DETENTION_SELECT = "id, child_id, behaviour_record_id, scheduled_for, duration_minutes, status, notes, children(name, year_group_id)";
export const BADGE_SELECT = "id, child_id, badge, awarded_on, children(name, year_group_id)";

export const MERIT_CATEGORIES: { label: string; points: number }[] = [
  { label: "Excellent work", points: 2 },
  { label: "Helpfulness", points: 1 },
  { label: "Good manners", points: 1 },
  { label: "Great recitation", points: 2 },
  { label: "Punctuality", points: 1 },
  { label: "Leadership", points: 2 },
];

export const DEMERIT_CATEGORIES: { label: string; points: number }[] = [
  { label: "Disruption", points: -1 },
  { label: "Lateness", points: -1 },
  { label: "Missing homework", points: -1 },
  { label: "Disrespect", points: -2 },
  { label: "Phone/device misuse", points: -2 },
];

export const INCIDENT_CATEGORIES: string[] = ["Classroom disruption", "Bullying or unkindness", "Physical incident", "Damage to property", "Online conduct", "Other"];

// Portal icons, not emojis (owner, Nov 2026: "remove the emojis and make it more suitable for the system").
export const BADGE_TYPES: { name: string; icon: IconName }[] = [
  { name: "Star of the week", icon: "star" },
  { name: "Great effort", icon: "target" },
  { name: "Kindness", icon: "heartHandshake" },
  { name: "Punctuality", icon: "clock" },
  { name: "Best Qur'an recitation", icon: "bookOpen" },
];

export function badgeIcon(name: string): IconName {
  return BADGE_TYPES.find((b) => b.name === name)?.icon || "award";
}

// ── dates (all local, ISO yyyy-mm-dd) ───────────────────────────────────
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Today in the UK: the school's day, whatever zone the browser is in. */
export function todayIso(): string {
  return ukToday();
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Monday of the week containing the given ISO date. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const back = (d.getDay() + 6) % 7;
  return addDaysIso(iso, -back);
}

export function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export type Period = "week" | "last_week" | "month" | "all";
export const PERIOD_LABEL: Record<Period, string> = { week: "This week", last_week: "Last week", month: "Last 30 days", all: "All time" };
export type PeriodRange = { start: string | null; end: string | null; prevStart: string | null; prevEnd: string | null };

export function periodRange(p: Period, today: string = todayIso()): PeriodRange {
  const mon = mondayOf(today);
  if (p === "week") return { start: mon, end: addDaysIso(mon, 6), prevStart: addDaysIso(mon, -7), prevEnd: addDaysIso(mon, -1) };
  if (p === "last_week") {
    const start = addDaysIso(mon, -7);
    return { start, end: addDaysIso(mon, -1), prevStart: addDaysIso(start, -7), prevEnd: addDaysIso(start, -1) };
  }
  if (p === "month") {
    const start = addDaysIso(today, -29);
    return { start, end: today, prevStart: addDaysIso(start, -30), prevEnd: addDaysIso(start, -1) };
  }
  return { start: null, end: null, prevStart: null, prevEnd: null };
}

export function inRange(date: string, start: string | null, end: string | null): boolean {
  return (!start || date >= start) && (!end || date <= end);
}

// ── aggregation ─────────────────────────────────────────────────────────
export type BehaviourStats = {
  allTimePoints: number;
  merits: number;
  meritsPrev: number | null;
  demerits: number;
  detentionsOutstanding: number;
  incidents: number;
};

export function computeStats(records: BehaviourRecord[], detentions: Detention[], range: PeriodRange): BehaviourStats {
  const live = records.filter((r) => !r.voided_at);
  let allTimePoints = 0;
  let merits = 0;
  let meritsPrev = 0;
  let demerits = 0;
  let incidents = 0;
  for (const r of live) {
    if (r.kind !== "incident") allTimePoints += r.points;
    if (inRange(r.occurred_on, range.start, range.end)) {
      if (r.kind === "merit") merits += 1;
      else if (r.kind === "demerit") demerits += 1;
      else incidents += 1;
    }
    if (r.kind === "merit" && range.prevStart && inRange(r.occurred_on, range.prevStart, range.prevEnd)) meritsPrev += 1;
  }
  return {
    allTimePoints,
    merits,
    meritsPrev: range.prevStart ? meritsPrev : null,
    demerits,
    detentionsOutstanding: detentions.filter((d) => d.status === "scheduled").length,
    incidents,
  };
}

// ── loading ─────────────────────────────────────────────────────────────
const PAGE = 1000;

export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    const rows = (res.data as T[] | null) || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type EnrolRow = {
  child_id: string;
  class_id: string;
  children: { name: string; year_group_id: string | null } | null;
  classes: { name: string } | null;
};

/** Students (via enrolments) the caller can see, optionally limited to some classes. */
export async function loadStudents(supabase: Sb, classIds?: string[]): Promise<StudentOption[]> {
  if (classIds && classIds.length === 0) return [];
  const rows = await fetchAllRows<EnrolRow>((f, t) => {
    let q = supabase.from("enrolments").select("child_id, class_id, children(name, year_group_id), classes(name)");
    if (classIds) q = q.in("class_id", classIds);
    return q.range(f, t);
  });
  return rows
    .filter((r) => r.children)
    .map((r) => ({
      childId: r.child_id,
      name: r.children?.name || "Student",
      classId: r.class_id,
      className: r.classes?.name || null,
      yearGroupId: r.children?.year_group_id || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type LoadScope = { childIds?: string[] };

export async function loadRecords(supabase: Sb, scope: LoadScope = {}): Promise<BehaviourRecord[]> {
  if (scope.childIds && scope.childIds.length === 0) return [];
  return fetchAllRows<BehaviourRecord>((f, t) => {
    let q = supabase.from("behaviour_records").select(RECORD_SELECT);
    if (scope.childIds) q = q.in("child_id", scope.childIds);
    return q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(f, t);
  });
}

export async function loadDetentions(supabase: Sb, scope: LoadScope = {}): Promise<Detention[]> {
  if (scope.childIds && scope.childIds.length === 0) return [];
  return fetchAllRows<Detention>((f, t) => {
    let q = supabase.from("detentions").select(DETENTION_SELECT);
    if (scope.childIds) q = q.in("child_id", scope.childIds);
    return q.order("scheduled_for", { ascending: true }).range(f, t);
  });
}

export async function loadBadges(supabase: Sb, scope: LoadScope = {}): Promise<BadgeAward[]> {
  if (scope.childIds && scope.childIds.length === 0) return [];
  return fetchAllRows<BadgeAward>((f, t) => {
    let q = supabase.from("behaviour_badges").select(BADGE_SELECT);
    if (scope.childIds) q = q.in("child_id", scope.childIds);
    return q.order("awarded_on", { ascending: false }).range(f, t);
  });
}

/** Distinct students from a list of options (a child in two classes counts once). */
export function uniqueChildIds(students: StudentOption[]): string[] {
  return Array.from(new Set(students.map((s) => s.childId)));
}
