"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

// Data for the Moodle-style "My classes" grid and class pages. Every query
// here runs as the signed-in user, so Postgres RLS decides what comes back:
// a teacher gets their own classes, a student their enrolments, a parent
// their own child's enrolments (see the classes/enrolments policies in
// supabase/migrations). Nothing here is a security boundary.

export type ClassSummary = {
  id: string;
  name: string;
  subject: string | null;
  yearGroup: string | null;
};

/** Who is looking: a teacher, or a student/parent looking at one child. */
export type ClassViewer = { kind: "teacher" } | { kind: "student"; childId: string } | { kind: "parent"; childId: string };

type ClassRow = {
  id: string;
  name: string;
  subject: string | null;
  year_group: string | null;
  subjects?: { name: string } | null;
  year_groups?: { name: string } | null;
};

const CLASS_COLUMNS = "id, name, subject, year_group, subjects(name), year_groups(name)";

function toSummary(r: ClassRow): ClassSummary {
  return {
    id: r.id,
    name: r.name,
    subject: r.subjects?.name || r.subject || null,
    yearGroup: r.year_groups?.name || r.year_group || null,
  };
}

function byName(a: ClassSummary, b: ClassSummary) {
  return a.name.localeCompare(b.name);
}

export async function fetchTeacherClasses(): Promise<ClassSummary[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("user_roles")
    .select(`scope_id, classes(${CLASS_COLUMNS})`)
    .eq("user_id", user.id)
    .eq("scope_type", "class")
    .in("role", ["teacher", "teaching_assistant_cover"]);
  const rows = ((data as unknown as { classes: ClassRow | null }[]) || []).map((r) => r.classes).filter(Boolean) as ClassRow[];
  // One class can appear twice (teacher + cover role rows) — dedupe by id.
  const seen = new Map<string, ClassSummary>();
  rows.forEach((r) => seen.set(r.id, toSummary(r)));
  return [...seen.values()].sort(byName);
}

export async function fetchChildClasses(childId: string): Promise<ClassSummary[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !childId) return [];
  const { data } = await supabase.from("enrolments").select(`class_id, classes(${CLASS_COLUMNS})`).eq("child_id", childId);
  const rows = ((data as unknown as { classes: ClassRow | null }[]) || []).map((r) => r.classes).filter(Boolean) as ClassRow[];
  return rows.map(toSummary).sort(byName);
}

export async function fetchClass(classId: string): Promise<ClassSummary | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !classId) return null;
  const { data } = await supabase.from("classes").select(CLASS_COLUMNS).eq("id", classId).maybeSingle();
  return data ? toSummary(data as unknown as ClassRow) : null;
}

export function useViewerClasses(viewer: ClassViewer | null): ClassSummary[] | null {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const key = viewer ? (viewer.kind === "teacher" ? "teacher" : `${viewer.kind}:${viewer.childId}`) : "";
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    (viewer.kind === "teacher" ? fetchTeacherClasses() : fetchChildClasses(viewer.childId)).then((c) => {
      if (!cancelled) setClasses(c);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the viewer's identity, not the object
  }, [key]);
  return classes;
}

/** The signed-in student's own child record (undefined while loading). */
export function useStudentChildId(): string | null | undefined {
  const [childId, setChildId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setChildId(null);
      const { data } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
      setChildId((data?.child_id as string | undefined) ?? null);
    })();
  }, []);
  return childId;
}

export type FamilyChild = { id: string; name: string; yearGroup: string | null };

/** A parent's own children (RLS: children.parent_user_id = auth.uid()). */
export function useFamilyChildren(): FamilyChild[] | null {
  const [children, setChildren] = useState<FamilyChild[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("children")
      .select("id, name, year_groups(name)")
      .order("name")
      .then(({ data }) =>
        setChildren(
          ((data as unknown as { id: string; name: string; year_groups?: { name: string } | null }[]) || []).map((c) => ({
            id: c.id,
            name: c.name,
            yearGroup: c.year_groups?.name || null,
          })),
        ),
      );
  }, []);
  return children;
}

// ── Class colours ─────────────────────────────────────────────────────
// Moodle gives each course without an image a generated colour pattern so
// the grid is scannable at a glance. Same idea here: a stable colour per
// class (hashed from its id) behind a subtle eight-point-star tile.
const CLASS_COLOURS = ["#1f6f6b", "#7d6428", "#3f4c8a", "#6b3f69", "#2f6b45", "#9a4b2f", "#2d5f86", "#5b5f2a"];

export function classColour(classId: string): string {
  let h = 0;
  for (let i = 0; i < classId.length; i++) h = (h * 31 + classId.charCodeAt(i)) >>> 0;
  return CLASS_COLOURS[h % CLASS_COLOURS.length];
}

const STAR_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.16' stroke-width='1.2'%3E%3Cpath d='M24 8l4.7 11.3L40 24l-11.3 4.7L24 40l-4.7-11.3L8 24l11.3-4.7z'/%3E%3Crect x='14' y='14' width='20' height='20' transform='rotate(45 24 24)'/%3E%3C/g%3E%3C/svg%3E\")";

/** Inline style for a class banner: its colour plus the star pattern. */
export function classBannerStyle(classId: string): CSSProperties {
  return { backgroundColor: classColour(classId), backgroundImage: STAR_TILE, backgroundSize: "48px 48px" };
}

// ── Recently accessed ─────────────────────────────────────────────────
// Per-browser convenience only (like Moodle's "Recently accessed items"
// block). Wrapped in try/catch: storage can be blocked or unavailable.
const RECENT_KEY = "tga:recent-pages";
export type RecentPage = { href: string; title: string; subtitle?: string; colourId?: string; at: number };

export function recordRecentPage(page: Omit<RecentPage, "at">) {
  try {
    const list: RecentPage[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const next = [{ ...page, at: Date.now() }, ...list.filter((p) => p.href !== page.href)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

export function readRecentPages(prefix: string): RecentPage[] {
  try {
    const list: RecentPage[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return list.filter((p) => p.href.startsWith(prefix));
  } catch {
    return [];
  }
}
