import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/learn/edge";

// Curriculum planner data (migration 0179): each subject's units per year group and half
// term, with a week-by-week plan. Saved straight to the database; the "Sync curriculum from
// the portal" workflow copies changes into content/syllabus and rebuilds the syllabus pack.

export const HALF_TERMS = [
  { key: "autumn1", label: "Autumn 1", short: "Aut 1" },
  { key: "autumn2", label: "Autumn 2", short: "Aut 2" },
  { key: "spring1", label: "Spring 1", short: "Spr 1" },
  { key: "spring2", label: "Spring 2", short: "Spr 2" },
  { key: "summer1", label: "Summer 1", short: "Sum 1" },
  { key: "summer2", label: "Summer 2", short: "Sum 2" },
] as const;
export type HalfTerm = (typeof HALF_TERMS)[number]["key"];
export const halfTermLabel = (h: string | null | undefined) => HALF_TERMS.find((x) => x.key === h)?.label || "Not placed yet";

/** KS4 units are placed by the board's recommended term instead of a half term. */
export const TERMS = ["Autumn", "Spring", "Summer"] as const;

export type WeekPlan = { week: number; lessons: string[]; vocabulary: string[]; home: string };

export type CurriculumUnit = {
  id: string;
  subject_slug: string;
  subject: string;
  kind: "syllabus" | "spec";
  year: string;
  half_term: HalfTerm | null;
  term: string | null;
  position: number;
  ref: string | null;
  paper: string | null;
  title: string;
  focus: string[];
  skills: string[];
  key_terms: string[];
  assess: string | null;
  prereq: string | null;
  leads_to: string | null;
  weeks: WeekPlan[];
  resources: string | null;
  founding_year: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

export const UNIT_COLUMNS =
  "id, subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, updated_at, updated_by_name";

/** Fields staff edit (everything except who/when, which the database stamps). */
export type UnitDraft = Omit<CurriculumUnit, "id" | "updated_at" | "updated_by_name"> & { id?: string };

export type UnitVersion = { id: string; action: "update" | "delete"; snapshot: CurriculumUnit; edited_by_name: string | null; edited_at: string };

export type SyncProblem = { scope?: string; text: string };
export type SyncRun = { started_at: string; finished_at: string | null; ok: boolean; sent_units: number; sent_lessons: number; problems: SyncProblem[]; message: string | null };

/** "Autumn 1: Dinosaur Planet" -> "autumn1". */
export function halfTermFromTitle(title: string): HalfTerm | null {
  const m = title.match(/^\s*(autumn|spring|summer)\s*([12])\b/i);
  return m ? (`${m[1].toLowerCase()}${m[2]}` as HalfTerm) : null;
}

/** Keep a "Spring 1: …" title in step with the half term the unit was moved to. */
export function retitleForHalfTerm(title: string, h: HalfTerm | null): string {
  if (!h || !halfTermFromTitle(title)) return title;
  return title.replace(/^\s*(autumn|spring|summer)\s*[12]\b/i, halfTermLabel(h));
}

/** Every unit for every year (a few hundred rows), so reordering can renumber a whole subject. */
export async function loadUnits(): Promise<CurriculumUnit[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Not connected.");
  const out: CurriculumUnit[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("curriculum_units").select(UNIT_COLUMNS).order("subject").order("position").order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data as unknown as CurriculumUnit[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out.map((u) => ({ ...u, weeks: Array.isArray(u.weeks) ? u.weeks : [] }));
}

const HT_INDEX = (h: string | null) => {
  const i = HALF_TERMS.findIndex((x) => x.key === h);
  return i < 0 ? HALF_TERMS.length : i;
};

/** Teaching order, the same as the repo export: KS1-3 by half term then position, KS4 by position. */
export function sortUnits<T extends Pick<CurriculumUnit, "kind" | "half_term" | "position" | "title">>(units: T[]): T[] {
  return [...units].sort((a, b) => (a.kind === "syllabus" ? HT_INDEX(a.half_term) - HT_INDEX(b.half_term) : 0) || a.position - b.position || a.title.localeCompare(b.title));
}

/**
 * Plain-English checks before saving, the same as the repo's content checks, so a saved unit
 * can always be copied to the syllabus pack.
 */
export function unitProblems(u: UnitDraft): string[] {
  const p: string[] = [];
  if (!u.title.trim()) p.push("Give the unit a title.");
  if (!u.focus.some((x) => x.trim())) p.push(u.kind === "spec" ? "Add at least one specification point." : "Add at least one line under What it covers.");
  if (u.kind === "spec") {
    if (!u.ref?.trim()) p.push("Add the specification reference (for example 3.1.1).");
    if (!u.paper?.trim()) p.push("Say which paper the unit is examined in.");
  }
  return p;
}

const clean = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);

/** Tidy a draft for saving: trim lines, drop empty weeks and blank fields. */
export function tidyUnit(u: UnitDraft): UnitDraft {
  return {
    ...u,
    title: u.title.trim(),
    focus: clean(u.focus),
    skills: clean(u.skills),
    key_terms: clean(u.key_terms),
    assess: blank(u.assess),
    prereq: blank(u.prereq),
    leads_to: blank(u.leads_to),
    resources: blank(u.resources),
    founding_year: blank(u.founding_year),
    ref: blank(u.ref),
    paper: blank(u.paper),
    term: blank(u.term),
    weeks: u.weeks
      .map((w, i) => ({ week: Number(w.week) || i + 1, lessons: clean(w.lessons), vocabulary: clean(w.vocabulary), home: w.home.trim() }))
      .filter((w) => w.lessons.length || w.vocabulary.length || w.home),
  };
}

/**
 * Save a unit. `expected` is the updated_at the editor opened; if someone else saved the unit
 * since, nothing is written and this throws Error("edited_elsewhere").
 */
export async function saveUnit(u: UnitDraft, expected?: string): Promise<CurriculumUnit> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Not connected.");
  const { id, ...rest } = tidyUnit(u);
  if (id) {
    // A unit's subject and kind never change (and staff may not write them, migration 0179).
    const { subject_slug: _slug, kind: _kind, ...fields } = rest;
    void _slug;
    void _kind;
    let q = supabase.from("curriculum_units").update(fields).eq("id", id);
    if (expected) q = q.eq("updated_at", expected);
    const { data, error } = await q.select(UNIT_COLUMNS);
    if (error) throw error;
    if (!data?.length) throw new Error("edited_elsewhere");
    return data[0] as unknown as CurriculumUnit;
  }
  const { data, error } = await supabase.from("curriculum_units").insert(rest).select(UNIT_COLUMNS).single();
  if (error) throw error;
  return data as unknown as CurriculumUnit;
}

export async function removedUnits(year: string): Promise<UnitVersion[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("curriculum_unit_versions")
    .select("id, action, snapshot, edited_by_name, edited_at")
    .eq("year", year)
    .eq("action", "delete")
    .is("restored_at", null)
    .order("edited_at", { ascending: false })
    .limit(20);
  return (data as UnitVersion[]) || [];
}

/** Put a removed unit back exactly as it was (once). */
export async function restoreRemovedUnit(versionId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.rpc("curriculum_restore_unit", { p_version: versionId });
  if (error) throw error;
}

/**
 * A note from a sync run. "Not sent yet" notes are repeated by every run until fixed, so only the
 * latest run's count. A clash (both sides changed; the portal version was kept) is reported once,
 * so it is kept from every recent run until someone edits that unit or lesson again.
 */
export type SyncNote = SyncProblem & { at: string; clash: boolean };

const isClash = (text: string) => !/^Not sent yet/i.test(text) && !/while the sync ran/i.test(text);

/**
 * The notes for one part: a unit ("unit:<id>"), a lesson ("lesson:<subject>/<year>/<n>") or a
 * whole year ("syllabus:<subject>:<year>", "spec:<subject>"). `editedAt` is when that unit or lesson
 * was last changed: a clash noted before then has been dealt with.
 */
export function problemsFor(notes: SyncNote[], scopes: string[], editedAt?: string | null): string[] {
  return notes.filter((n) => scopes.includes(n.scope || "") && !(n.clash && editedAt && editedAt > n.at)).map((n) => n.text);
}

/** Notes from the last month of sync runs: everything from the latest run, and clashes from earlier ones. */
export async function syncNotes(): Promise<{ latest: SyncRun | null; notes: SyncNote[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { latest: null, notes: [] };
  const since = new Date(Date.now() - 31 * 86400 * 1000).toISOString();
  const { data } = await supabase
    .from("curriculum_sync_runs")
    .select("started_at, finished_at, ok, sent_units, sent_lessons, problems, message")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(200);
  const runs = ((data as (Omit<SyncRun, "problems"> & { problems: (SyncProblem | string)[] | null })[]) || []).map((r) => ({ ...r, problems: (r.problems || []).map((p) => (typeof p === "string" ? { text: p } : p)) }));
  const seen = new Set<string>();
  const notes: SyncNote[] = [];
  runs.forEach((r, i) => {
    for (const p of r.problems) {
      const clash = isClash(p.text);
      if (i > 0 && !clash) continue;
      const key = `${p.scope || ""}|${p.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({ ...p, at: r.started_at, clash });
    }
  });
  return { latest: runs[0] || (await lastSyncRun()), notes };
}

/** A snapshot from the history, as a draft to save again. */
export function draftFromSnapshot(s: CurriculumUnit, keepId: boolean): UnitDraft {
  return {
    ...(keepId ? { id: s.id } : {}),
    subject_slug: s.subject_slug,
    subject: s.subject,
    kind: s.kind,
    year: s.year,
    half_term: s.half_term,
    term: s.term,
    position: s.position,
    ref: s.ref,
    paper: s.paper,
    title: s.title,
    focus: s.focus || [],
    skills: s.skills || [],
    key_terms: s.key_terms || [],
    assess: s.assess,
    prereq: s.prereq,
    leads_to: s.leads_to,
    weeks: Array.isArray(s.weeks) ? s.weeks : [],
    resources: s.resources,
    founding_year: s.founding_year,
  };
}

export async function deleteUnit(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.from("curriculum_units").delete().eq("id", id);
  if (error) throw error;
}

/** Save a new order: each unit's position becomes its index in the list. */
export async function savePositions(units: { id: string; position: number }[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Not connected.");
  for (const u of units) {
    const { error } = await supabase.from("curriculum_units").update({ position: u.position }).eq("id", u.id);
    if (error) throw error;
  }
}

export async function unitHistory(unitId: string): Promise<UnitVersion[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase.from("curriculum_unit_versions").select("id, action, snapshot, edited_by_name, edited_at").eq("unit_id", unitId).order("edited_at", { ascending: false }).limit(50);
  return (data as UnitVersion[]) || [];
}

export async function lastSyncRun(): Promise<SyncRun | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("curriculum_sync_runs").select("started_at, finished_at, ok, sent_units, sent_lessons, problems, message").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const run = data as Omit<SyncRun, "problems"> & { problems: (SyncProblem | string)[] | null };
  return { ...run, problems: (run.problems || []).map((p) => (typeof p === "string" ? { text: p } : p)) };
}

/**
 * After a save: ask GitHub to copy the change into the repo and rebuild the slides and the
 * syllabus pack. Never throws; returns the message to show beside "Saved".
 */
export async function triggerCurriculumSync(what: "unit" | "lesson"): Promise<string> {
  const r = await callEdgeFunction("curriculum-sync", {});
  const after = what === "lesson" ? "The slides, lesson plan and PDFs are rebuilt automatically" : "The syllabus pack is rebuilt automatically";
  if (r.ok) return `Saved. ${after}, usually within 30 minutes.`;
  return `Saved. ${after} within the hour.`;
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
