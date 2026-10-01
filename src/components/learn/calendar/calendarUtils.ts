import { classColour } from "@/lib/learn/classes";
import type { DayItem, Directory, ItemKind } from "./useCalendarData";

export type CalView = { kind: "all" } | { kind: "child"; id: string } | { kind: "class"; id: string } | { kind: "teacher"; id: string };

export const CHILD_COLOURS = ["#0f766e", "#b45309", "#7c3aed", "#be185d", "#1d4ed8", "#4d7c0f", "#c2410c", "#0e7490"];

export const KIND_LABEL: Record<ItemKind, string> = { lesson: "Live lessons", homework: "Homework due", assessment: "Assessments", announcement: "Announcements" };

export function viewKey(v: CalView): string {
  return v.kind === "all" ? "all" : `${v.kind}:${v.id}`;
}

/** Narrow the month's items to what the current filter selects. */
export function applyView(items: DayItem[], view: CalView, dir: Directory): DayItem[] {
  if (view.kind === "all") return items;
  if (view.kind === "class") return items.filter((i) => i.classId === view.id || (i.kind === "announcement" && !i.classId));
  if (view.kind === "teacher") return items.filter((i) => i.teacherId === view.id);
  const classes = dir.childClasses.get(view.id);
  return items.filter((i) => {
    if (i.childId) return i.childId === view.id;
    if (i.kind === "assessment") return i.childIds.includes(view.id);
    if (i.kind === "announcement" && !i.classId) return true;
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

/** Colour for an item: per child for parents, otherwise per class. */
export function itemColour(i: DayItem, childOrder: string[]): string {
  if (i.childId && childOrder.length > 1) {
    const idx = childOrder.indexOf(i.childId);
    if (idx >= 0) return CHILD_COLOURS[idx % CHILD_COLOURS.length];
  }
  return classColour(i.classId || "school");
}

export function countByKind(list: DayItem[]): Record<ItemKind, number> {
  const c: Record<ItemKind, number> = { lesson: 0, homework: 0, assessment: 0, announcement: 0 };
  for (const i of list) c[i.kind]++;
  return c;
}
