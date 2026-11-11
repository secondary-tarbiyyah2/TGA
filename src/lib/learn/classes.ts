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
export type ClassViewer =
  | { kind: "teacher" }
  | { kind: "staff" } // headteacher / admin: every class, read via manage_academic
  | { kind: "student"; childId: string }
  | { kind: "parent"; childId: string };

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

export type TeachingClass = { id: string; name: string; subject_id: string | null; subject_name: string | null; year_group: string | null; year_group_name: string | null; pupils: number };

/**
 * The signed-in teacher's classes: the database's single answer (0096
 * my_teaching_classes: class role, subject mapping or published timetable),
 * the same rule its permissions use, so My classes, Today and every class
 * picker agree.
 */
export async function myTeachingClasses(): Promise<TeachingClass[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_teaching_classes");
  if (error) return [];
  return (data as TeachingClass[]) || [];
}

export async function fetchTeacherClasses(): Promise<ClassSummary[]> {
  const rows = await myTeachingClasses();
  return rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject_name, yearGroup: r.year_group_name || r.year_group })).sort(byName);
}

/** Every class staff can read (RLS: manage_academic), demo classes last. */
export async function fetchAllClasses(): Promise<ClassSummary[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase.from("classes").select(CLASS_COLUMNS).order("name");
  return ((data as unknown as ClassRow[]) || []).map(toSummary).sort((a, b) => Number(a.name.startsWith("Demo:")) - Number(b.name.startsWith("Demo:")) || byName(a, b));
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
  const key = viewer ? (viewer.kind === "teacher" || viewer.kind === "staff" ? viewer.kind : `${viewer.kind}:${viewer.childId}`) : "";
  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    (viewer.kind === "teacher" ? fetchTeacherClasses() : viewer.kind === "staff" ? fetchAllClasses() : fetchChildClasses(viewer.childId)).then((c) => {
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

export function classColour(classId: string | null | undefined): string {
  if (!classId) return CLASS_COLOURS[0];
  let h = 0;
  for (let i = 0; i < classId.length; i++) h = (h * 31 + classId.charCodeAt(i)) >>> 0;
  return CLASS_COLOURS[h % CLASS_COLOURS.length];
}

// Fine diagonal lines (no star motif: owner, 11 Nov 2026).
const BANNER_TILE =
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 16px)";

/** Inline style for a class banner: its colour plus a fine line texture. */
export function classBannerStyle(classId: string): CSSProperties {
  return { backgroundColor: classColour(classId), backgroundImage: BANNER_TILE };
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
