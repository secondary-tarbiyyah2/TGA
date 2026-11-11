import type { DayItem, Directory } from "./useCalendarData";
import type { ClosureRow, TermRow } from "./useCalendarTerms";
import { CLOSURE_LABEL } from "./useCalendarTerms";
import { addDays, toHijri } from "@/lib/learn/hijri";
import { localDateKey } from "@/lib/learn/calendar";

export type CalView = { kind: "all" } | { kind: "child"; id: string } | { kind: "class"; id: string } | { kind: "teacher"; id: string };

/** Per-child colours for the child filter chips (parents with several children). */
export const CHILD_COLOURS = ["var(--cal-lesson)", "var(--cal-homework)", "var(--cal-meeting)", "var(--cal-assessment)", "var(--cal-event)", "var(--cal-holiday)", "var(--cal-islamic)", "var(--cal-admissions)"];

// ── Categories (owner feedback 11 Nov 2026, item 4) ──────────────────────
export type Category = "lesson" | "assessment" | "homework" | "event" | "holiday" | "islamic" | "meeting" | "admissions";

export const CATEGORIES: { key: Category; label: string; short: string; colour: string; staffOnly?: boolean }[] = [
  { key: "lesson", label: "Lessons", short: "Lesson", colour: "var(--cal-lesson)" },
  { key: "assessment", label: "Assessments", short: "Assessment", colour: "var(--cal-assessment)" },
  { key: "homework", label: "Homework and deadlines", short: "Due", colour: "var(--cal-homework)" },
  { key: "event", label: "School events", short: "Event", colour: "var(--cal-event)" },
  { key: "holiday", label: "Holidays and term dates", short: "Term dates", colour: "var(--cal-holiday)" },
  { key: "islamic", label: "Islamic dates", short: "Islamic", colour: "var(--cal-islamic)" },
  { key: "meeting", label: "Meetings", short: "Meeting", colour: "var(--cal-meeting)" },
  { key: "admissions", label: "Admissions", short: "Admissions", colour: "var(--cal-admissions)", staffOnly: true },
];
export const CAT: Record<Category, (typeof CATEGORIES)[number]> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<Category, (typeof CATEGORIES)[number]>;

/** calendar_events.category (0207) to the calendar's category. */
export const EVENT_CATEGORY: Record<string, Category> = {
  school_event: "event",
  meeting: "meeting",
  assessment: "assessment",
  deadline: "homework",
  holiday: "holiday",
  admissions: "admissions",
  islamic: "islamic",
};
export const EVENT_CATEGORY_CHOICES: { value: string; label: string }[] = [
  { value: "school_event", label: "School event" },
  { value: "meeting", label: "Meeting" },
  { value: "assessment", label: "Assessment" },
  { value: "deadline", label: "Deadline" },
  { value: "holiday", label: "Holiday or closure" },
  { value: "islamic", label: "Islamic date" },
  { value: "admissions", label: "Admissions" },
];

export function viewKey(v: CalView): string {
  return v.kind === "all" ? "all" : `${v.kind}:${v.id}`;
}

/** Whole-school items (term dates, Islamic dates, school-wide events) stay in every view. */
const schoolWide = (i: DayItem) => !i.classId && (i.kind === "term" || i.kind === "islamic" || i.kind === "event");

/** Narrow the month's items to what the current filter selects. */
export function applyView(items: DayItem[], view: CalView, dir: Directory): DayItem[] {
  if (view.kind === "all") return items;
  if (view.kind === "class") return items.filter((i) => i.classId === view.id || schoolWide(i));
  if (view.kind === "teacher") return items.filter((i) => i.teacherId === view.id || schoolWide(i));
  const classes = dir.childClasses.get(view.id);
  return items.filter((i) => {
    if (schoolWide(i)) return true;
    if (i.childId) return i.childId === view.id;
    if (i.kind === "assessment") return i.childIds.includes(view.id);
    return !!i.classId && !!classes?.has(i.classId);
  });
}

export function groupByDate(items: DayItem[]): Map<string, DayItem[]> {
  const m = new Map<string, DayItem[]>();
  for (const i of items) {
    const l = m.get(i.date);
    if (l) l.push(i);
    else m.set(i.date, [i]);
  }
  return m;
}

export function itemColour(i: DayItem): string {
  return CAT[i.category].colour;
}

export function countByCategory(list: DayItem[]): Record<Category, number> {
  const c = Object.fromEntries(CATEGORIES.map((x) => [x.key, 0])) as Record<Category, number>;
  for (const i of list) c[i.category]++;
  return c;
}

/** Order inside a day: all-day items first, then by time. */
export function sortDay(list: DayItem[]): DayItem[] {
  const rank = (i: DayItem) => (i.kind === "term" ? 0 : i.kind === "islamic" ? 1 : !i.time ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title));
}

const BLANK = { time: null, endTime: null, subject: null, classId: null, className: null, teacherId: null, teacherName: null, childId: null, childName: null, childIds: [], room: null, joinUrl: null, href: null, note: null };

function eachDay(from: string, to: string, f: (key: string) => void) {
  let d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (d <= end) {
    f(localDateKey(d));
    d = addDays(d, 1);
  }
}

/** Term starts and ends, half terms and closures as calendar items between two dates. */
export function termItems(terms: TermRow[] | null, closures: ClosureRow[], from: string, to: string): DayItem[] {
  const out: DayItem[] = [];
  const within = (k: string) => k >= from && k <= to;
  for (const t of terms || []) {
    if (within(t.starts_on)) out.push({ ...BLANK, id: `ts-${t.id}`, kind: "term", category: "holiday", date: t.starts_on, title: `${t.name} starts` });
    if (within(t.ends_on)) out.push({ ...BLANK, id: `te-${t.id}`, kind: "term", category: "holiday", date: t.ends_on, title: `${t.name} ends` });
    if (t.half_term_starts_on && t.half_term_ends_on) {
      const a = t.half_term_starts_on > from ? t.half_term_starts_on : from;
      const b = t.half_term_ends_on < to ? t.half_term_ends_on : to;
      if (a <= b) eachDay(a, b, (k) => out.push({ ...BLANK, id: `th-${t.id}-${k}`, kind: "term", category: "holiday", date: k, title: "Half-term break", note: `${t.name} half term` }));
    }
  }
  for (const c of closures) {
    const a = c.starts_on > from ? c.starts_on : from;
    const b = c.ends_on < to ? c.ends_on : to;
    if (a <= b) eachDay(a, b, (k) => out.push({ ...BLANK, id: `cl-${c.id}-${k}`, kind: "term", category: "holiday", date: k, title: c.name, note: [CLOSURE_LABEL[c.kind], c.notes].filter(Boolean).join(". ") }));
  }
  return out;
}

// Days the school marks from the Hijri calendar (the Umm al-Qura dates the
// calendar already shows; a local moon sighting may differ by a day).
const ISLAMIC_DAYS: { month: number; day: number; title: string; note?: string }[] = [
  { month: 1, day: 1, title: "Islamic New Year", note: "1 Muharram" },
  { month: 1, day: 10, title: "Day of Ashura", note: "10 Muharram" },
  { month: 9, day: 1, title: "Ramadan begins", note: "Expected; depends on the moon sighting" },
  { month: 10, day: 1, title: "Eid al-Fitr", note: "Expected; depends on the moon sighting" },
  { month: 12, day: 1, title: "Dhul Hijjah begins", note: "The first ten days of Dhul Hijjah" },
  { month: 12, day: 9, title: "Day of Arafah" },
  { month: 12, day: 10, title: "Eid al-Adha" },
];

export function islamicItems(from: string, to: string): DayItem[] {
  const out: DayItem[] = [];
  eachDay(from, to, (k) => {
    const h = toHijri(new Date(`${k}T12:00:00`));
    for (const x of ISLAMIC_DAYS) if (x.month === h.month && x.day === h.day) out.push({ ...BLANK, id: `is-${k}-${x.month}-${x.day}`, kind: "islamic", category: "islamic", date: k, title: x.title, note: x.note || null });
  });
  return out;
}
