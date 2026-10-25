"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { fetchAll, type Sb, type TermOption } from "./summary";

// Shared data and URL helpers for the progress-report workflow:
//   Overview (per term, every class) -> Class (pupil list) -> Pupil editor
//   -> Approval queue (Headteacher) -> Issued (what families see).
// Every view is a query-param step on the one page, so the browser's Back
// button works and a link can be shared with a colleague.

export type Mode = "admin" | "teach";
export type ReportView = "overview" | "class" | "pupil" | "approval" | "issued" | "settings";

export type ClassInfo = { id: string; name: string; group: string; sort: number; teacher: string | null };
export type Pupil = { id: string; name: string };
export type ReportRow = {
  id: string;
  child_id: string;
  term_id: string | null;
  status: string;
  overall_comment: string | null;
  narrative: unknown;
  written_by: string | null;
  returned_reason: string | null;
  updated_at: string;
  submitted_at: string | null;
};
export const REPORT_COLS = "id, child_id, term_id, status, overall_comment, narrative, written_by, returned_reason, updated_at, submitted_at";

/** Where one pupil's report is in the workflow. */
export type PupilState = "not_started" | "draft" | "returned" | "pending" | "released";
export const STATE_LABEL: Record<PupilState, string> = {
  not_started: "Not started",
  draft: "Draft",
  returned: "Sent back",
  pending: "Awaiting approval",
  released: "Issued",
};
export function stateOf(rep: ReportRow | undefined, issued: boolean): PupilState {
  if (!rep) return issued ? "released" : "not_started";
  if (rep.status === "released") return "released";
  if (rep.status === "pending_approval" || rep.status === "approved") return "pending";
  return rep.returned_reason ? "returned" : "draft";
}

/** "all" = reports that cover all time (no term). */
export const ALL_TIME = "all";

export function reportsHref(mode: Mode, p: { view?: ReportView; term?: string; cls?: string; child?: string } = {}): string {
  const q = new URLSearchParams();
  if (p.view && p.view !== "overview") q.set("view", p.view);
  if (p.term) q.set("term", p.term);
  if (p.cls) q.set("class", p.cls);
  if (p.child) q.set("child", p.child);
  const s = q.toString();
  return `${mode === "admin" ? "/admin/reports" : "/teach/reports"}${s ? `?${s}` : ""}`;
}

/** The term in progress, else the latest one that has started, else the first. */
export function defaultTerm(terms: TermOption[], today: string): TermOption | null {
  const current = terms.find((t) => t.starts_on <= today && today <= t.ends_on);
  if (current) return current;
  const started = terms.filter((t) => t.starts_on <= today).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  return started[0] || terms[0] || null;
}

/** Terms, the classes this person reports on, and who they are. Loaded once per page. */
export function useReportsBase(mode: Mode) {
  const [terms, setTerms] = useState<TermOption[] | null>(null);
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [{ data: termRows }, { data: auth }] = await Promise.all([supabase.from("terms").select("id, name, starts_on, ends_on").order("starts_on", { ascending: false }), supabase.auth.getUser()]);
      if (!alive) return;
      setTerms((termRows as TermOption[]) || []);
      const uid = auth.user?.id || null;
      if (uid) {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
        if (alive) setMe({ id: uid, name: (prof as { full_name: string | null } | null)?.full_name || "" });
      }

      let ids: string[] | null = null;
      if (mode === "teach") {
        if (!uid) return setClasses([]);
        ids = (await myTeachingClasses()).map((c) => c.id);
        if (ids.length === 0) return alive && setClasses([]);
      }
      let q = supabase.from("classes").select("id, name, year_groups(name, sort_order)");
      if (ids) q = q.in("id", ids);
      const { data: clsRows } = await q.order("name");
      const rows = (clsRows as unknown as { id: string; name: string; year_groups: { name: string; sort_order: number } | null }[]) || [];

      const teachers: Record<string, string> = {};
      if (mode === "admin" && rows.length > 0) {
        const { data: tr } = await supabase.from("user_roles").select("user_id, scope_id").eq("scope_type", "class").eq("role", "teacher");
        const trows = (tr as { user_id: string; scope_id: string | null }[]) || [];
        const uids = Array.from(new Set(trows.map((r) => r.user_id)));
        if (uids.length > 0) {
          const { data: pr } = await supabase.from("profiles").select("id, full_name").in("id", uids);
          const names: Record<string, string> = {};
          for (const p of (pr as { id: string; full_name: string }[]) || []) names[p.id] = p.full_name;
          for (const r of trows) if (r.scope_id && names[r.user_id] && !teachers[r.scope_id]) teachers[r.scope_id] = names[r.user_id];
        }
      }
      if (!alive) return;
      setClasses(
        rows
          .map((r) => ({ id: r.id, name: r.name, group: r.year_groups?.name || "Other classes", sort: r.year_groups?.sort_order ?? 9999, teacher: teachers[r.id] || null }))
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      );
    })();
    return () => {
      alive = false;
    };
  }, [mode]);

  return { terms, classes, me };
}

/** Pupils enrolled in the given classes, keyed by class. */
export async function loadEnrolments(supabase: Sb, classIds: string[]): Promise<Record<string, Pupil[]>> {
  const out: Record<string, Pupil[]> = {};
  if (classIds.length === 0) return out;
  const rows: { class_id: string; children: Pupil | null }[] = [];
  for (let i = 0; i < classIds.length; i += 40) {
    const slice = classIds.slice(i, i + 40);
    rows.push(...(await fetchAll<{ class_id: string; children: Pupil | null }>((f, t) => supabase.from("enrolments").select("class_id, children(id, name)").in("class_id", slice).range(f, t))));
  }
  for (const r of rows) if (r.children) (out[r.class_id] ||= []).push(r.children);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Reports for one term (or all time), by child id. RLS limits a teacher to drafts and submitted reports of pupils they teach. */
export async function loadTermReports(supabase: Sb, termId: string | null, childIds?: string[]): Promise<Record<string, ReportRow>> {
  const out: Record<string, ReportRow> = {};
  if (childIds && childIds.length === 0) return out;
  const chunks = childIds ? Array.from({ length: Math.ceil(childIds.length / 150) }, (_, i) => childIds.slice(i * 150, i * 150 + 150)) : [null];
  for (const chunk of chunks) {
    const rows = await fetchAll<ReportRow>((f, t) => {
      let q = supabase.from("term_reports").select(REPORT_COLS);
      q = termId ? q.eq("term_id", termId) : q.is("term_id", null);
      if (chunk) q = q.in("child_id", chunk);
      return q.range(f, t);
    });
    for (const r of rows) out[r.child_id] = r;
  }
  return out;
}

/** Children with at least one issued version for the term (teachers can't read released rows in term_reports). */
export async function loadIssuedChildren(supabase: Sb, termId: string | null, childIds?: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (childIds && childIds.length === 0) return out;
  const chunks = childIds ? Array.from({ length: Math.ceil(childIds.length / 150) }, (_, i) => childIds.slice(i * 150, i * 150 + 150)) : [null];
  for (const chunk of chunks) {
    const rows = await fetchAll<{ child_id: string }>((f, t) => {
      let q = supabase.from("term_report_versions").select("child_id");
      q = termId ? q.eq("term_id", termId) : q.is("term_id", null);
      if (chunk) q = q.in("child_id", chunk);
      return q.range(f, t);
    });
    for (const r of rows) out.add(r.child_id);
  }
  return out;
}

export function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
