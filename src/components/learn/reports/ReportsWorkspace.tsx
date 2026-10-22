"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { ReportDocument, PrintStyles, StatusBadge, fmtPct } from "./ReportDocument";
import { asNarrative, buildClassSummaries, mergeNarrative, termRange, type ClassSummary, type ReportNarrative, type TermOption } from "./summary";
import { EmptyState, Notice, StatusChip, ui } from "@/components/learn/ui";
import { Tabs } from "@/components/learn/Tabs";

type Mode = "admin" | "teach";
type Child = { id: string; name: string };
type ClassTile = { id: string; name: string; group: string; sort: number; teacher: string | null };
type ReportRow = { id: string; child_id: string; status: string; overall_comment: string | null; narrative: unknown; written_by: string | null; returned_reason: string | null; version: number };
type ListRow = {
  id: string;
  status: string;
  overall_comment: string | null;
  released_at: string | null;
  updated_at: string;
  children?: { name: string } | null;
  terms?: { name: string } | null;
};
type CommentSnippet = { id: string; text: string };

const btnPrimary = ui.btnPrimary;
const btnGhost = ui.btnSecondary;
const card = ui.card;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–";
}

export function ReportsWorkspace({ mode }: { mode: Mode }) {
  const supabase = getSupabaseClient();
  const [terms, setTerms] = useState<TermOption[] | null>(null);
  const [termId, setTermId] = useState("");
  const [classes, setClasses] = useState<ClassTile[] | null>(null);
  const [classId, setClassId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [snippets, setSnippets] = useState<CommentSnippet[]>([]);

  const [roster, setRoster] = useState<Child[]>([]);
  const [reports, setReports] = useState<Record<string, ReportRow>>({});
  const [summaries, setSummaries] = useState<Record<string, ClassSummary>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [openChild, setOpenChild] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [printId, setPrintId] = useState<string | null>(null);

  const [awaiting, setAwaiting] = useState<ListRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [recent, setRecent] = useState<ListRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"classes" | "awaiting" | "recent">("classes");
  // Sending a report back to its teacher: which one, and the reason being typed.
  const [returning, setReturning] = useState<{ id: string; reason: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const reqRef = useRef(0);

  const term = useMemo(() => (terms || []).find((t) => t.id === termId) || null, [terms, termId]);
  const termLabel = term ? term.name : "All time";
  const cls = useMemo(() => (classes || []).find((c) => c.id === classId) || null, [classes, classId]);

  const editable = useCallback((status: string) => (status === "released" ? false : mode === "admin" ? true : status === "draft" || status === "pending_approval"), [mode]);

  // ── static data: terms, user, snippets, classes ──
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: termRows }, { data: auth }, { data: snipRows }] = await Promise.all([
        supabase.from("terms").select("id, name, starts_on, ends_on").order("starts_on", { ascending: false }),
        supabase.auth.getUser(),
        supabase.from("comment_bank").select("id, text").limit(8),
      ]);
      setTerms((termRows as TermOption[]) || []);
      setSnippets((snipRows as CommentSnippet[]) || []);
      const uid = auth.user?.id || null;
      setUserId(uid);

      let ids: string[] | null = null;
      if (mode === "teach") {
        if (!uid) return setClasses([]);
        ids = (await myTeachingClasses()).map((c) => c.id);
        if (ids.length === 0) return setClasses([]);
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
      setClasses(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          group: r.year_groups?.name || "Other classes",
          sort: r.year_groups?.sort_order ?? 9999,
          teacher: teachers[r.id] || null,
        }))
      );
    })();
  }, [supabase, mode]);

  // ── bottom/top lists ──
  const loadLists = useCallback(async () => {
    if (!supabase) return;
    const cols = "id, status, overall_comment, released_at, updated_at, children(name), terms(name)";
    if (mode === "admin") {
      const { data: aw } = await supabase.from("term_reports").select(cols).in("status", ["pending_approval", "approved"]).order("updated_at", { ascending: false });
      setAwaiting((aw as unknown as ListRow[]) || []);
      const { data: rc } = await supabase.from("term_reports").select(cols).eq("status", "released").order("released_at", { ascending: false }).limit(15);
      setRecent((rc as unknown as ListRow[]) || []);
    } else {
      const { data: rc } = await supabase.from("term_reports").select(cols).in("status", ["draft", "pending_approval"]).order("updated_at", { ascending: false }).limit(15);
      setRecent((rc as unknown as ListRow[]) || []);
    }
  }, [supabase, mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadLists();
  }, [loadLists]);

  // ── roster for the selected class + term ──
  const loadRoster = useCallback(async () => {
    if (!supabase || !cls) return;
    const req = ++reqRef.current;
    setRosterLoading(true);
    const { data: en } = await supabase.from("enrolments").select("children(id, name)").eq("class_id", cls.id);
    const kids = ((en as unknown as { children: Child | null }[]) || [])
      .map((r) => r.children)
      .filter((c): c is Child => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
    const ids = kids.map((k) => k.id);
    const repMap: Record<string, ReportRow> = {};
    let sums: Record<string, ClassSummary> = {};
    if (ids.length > 0) {
      let rq = supabase.from("term_reports").select("id, child_id, status, overall_comment, narrative, written_by, returned_reason, version").in("child_id", ids);
      rq = term ? rq.eq("term_id", term.id) : rq.is("term_id", null);
      const [{ data: repRows }, built] = await Promise.all([rq, buildClassSummaries(supabase, { id: cls.id, name: cls.name }, ids, termRange(term))]);
      for (const r of (repRows as ReportRow[]) || []) repMap[r.child_id] = r;
      sums = built;
    }
    if (req !== reqRef.current) return;
    setRoster(kids);
    setReports(repMap);
    setSummaries(sums);
    setDrafts({});
    // The open report stays open after saving or refreshing figures.
    setRosterLoading(false);
  }, [supabase, cls, term]);

  useEffect(() => {
    if (!cls) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing derived state when the selection clears
      setRoster([]);
      return;
    }
    loadRoster();
  }, [cls, loadRoster]);

  const refresh = async () => {
    await Promise.all([loadRoster(), loadLists()]);
  };

  const fail = (what: string, error: { message: string } | null): boolean => {
    if (error) {
      setMsg(`${what} failed: ${error.message}`);
      return true;
    }
    return false;
  };

  const narrativeFor = (childId: string): ReportNarrative | null => {
    const stored = asNarrative(reports[childId]?.narrative);
    const live = summaries[childId];
    if (reports[childId] && !editable(reports[childId].status) && stored) return stored;
    return live ? mergeNarrative(stored, live, termLabel) : stored;
  };

  const commentFor = (childId: string): string => drafts[childId] ?? reports[childId]?.overall_comment ?? "";

  // ── actions ──
  const writeReport = async (child: Child, status: string) => {
    if (!supabase || !userId) return;
    setBusy(true);
    setMsg(null);
    try {
      const ex = reports[child.id];
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        overall_comment: commentFor(child.id).trim() || null,
        narrative: narrativeFor(child.id),
        status,
      };
      if (status === "released") {
        payload.approved_by = userId;
        payload.approved_at = now;
        payload.released_at = now;
      }
      if (ex) {
        if (mode === "teach") payload.written_by = userId;
        const { error } = await supabase.from("term_reports").update(payload).eq("id", ex.id);
        if (fail("Saving", error)) return;
      } else {
        const { error } = await supabase.from("term_reports").insert({ child_id: child.id, term_id: term ? term.id : null, written_by: userId, ...payload });
        if (fail("Saving", error)) return;
      }
      setMsg(status === "released" ? `Issued ${child.name}'s report to the family.` : status === "pending_approval" ? `Submitted ${child.name}'s report for approval.` : `Saved ${child.name}'s report.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const generateAll = async () => {
    if (!supabase || !userId || !cls) return;
    setBusy(true);
    setMsg(null);
    try {
      const inserts: Record<string, unknown>[] = [];
      const updates: PromiseLike<{ error: { message: string } | null }>[] = [];
      for (const k of roster) {
        const live = summaries[k.id];
        if (!live) continue;
        const ex = reports[k.id];
        if (!ex) {
          inserts.push({ child_id: k.id, term_id: term ? term.id : null, status: "draft", narrative: mergeNarrative(null, live, termLabel), written_by: userId });
        } else if (editable(ex.status)) {
          updates.push(supabase.from("term_reports").update({ narrative: mergeNarrative(asNarrative(ex.narrative), live, termLabel) }).eq("id", ex.id));
        }
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from("term_reports").insert(inserts);
        if (fail("Generating", error)) return;
      }
      const results = await Promise.all(updates);
      const bad = results.find((r) => r.error);
      if (bad && fail("Refreshing", bad.error)) return;
      setMsg(`Generated ${inserts.length} new draft${inserts.length === 1 ? "" : "s"}, refreshed ${updates.length}. Add comments, then ${mode === "admin" ? "issue" : "submit"}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const submitAllDrafts = async () => {
    if (!supabase) return;
    const ready = roster.filter((k) => reports[k.id]?.status === "draft" && (reports[k.id]?.overall_comment || "").trim() && asNarrative(reports[k.id]?.narrative));
    const ids = ready.map((k) => reports[k.id].id);
    const notReady = roster.filter((k) => reports[k.id]?.status === "draft").length - ready.length;
    if (ids.length === 0) return setMsg("No drafts are ready to submit. Each needs a saved comment and the generated summary.");
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("term_reports").update({ status: "pending_approval" }).in("id", ids);
      if (fail("Submitting", error)) return;
      setMsg(`Submitted ${ids.length} report${ids.length === 1 ? "" : "s"} for approval.${notReady > 0 ? ` ${notReady} still need${notReady === 1 ? "s" : ""} a comment or summary.` : ""}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const releaseIds = async (ids: string[], backfill: boolean) => {
    if (!supabase || !userId || ids.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (backfill) {
        // Reports with no stored summary get a snapshot before being issued.
        const fills = roster
          .filter((k) => reports[k.id] && ids.includes(reports[k.id].id) && !asNarrative(reports[k.id].narrative) && summaries[k.id])
          .map((k) => supabase.from("term_reports").update({ narrative: mergeNarrative(null, summaries[k.id], termLabel) }).eq("id", reports[k.id].id));
        await Promise.all(fills);
      }
      const now = new Date().toISOString();
      const { error } = await supabase.from("term_reports").update({ status: "released", approved_by: userId, approved_at: now, released_at: now }).in("id", ids);
      if (fail("Issuing", error)) return;
      setMsg(`Issued ${ids.length} report${ids.length === 1 ? "" : "s"} to families.`);
      setSelected([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** Head/admin: back to the teacher as a draft, with a reason they will see. */
  const sendBack = async (id: string, reason: string) => {
    if (!supabase) return;
    if (!reason.trim()) return setMsg("Say what needs changing, so the teacher knows.");
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("term_reports").update({ status: "draft", returned_reason: reason.trim() }).eq("id", id);
      if (fail("Sending back", error)) return;
      setMsg("Sent back to the teacher with your note.");
      setReturning(null);
      setSelected((s) => s.filter((x) => x !== id));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** Head/admin: reopen an issued report for a correction. The family keeps the issued copy until it is issued again. */
  const reopen = async (id: string) => {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("term_reports").update({ status: "draft", returned_reason: "Reopened for a correction." }).eq("id", id);
      if (fail("Reopening", error)) return;
      setMsg("Reopened. Families still see the issued copy until you issue it again.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  /** What still stops a report being submitted or issued. */
  const missing = (childId: string): string[] => {
    const out: string[] = [];
    if (!commentFor(childId).trim()) out.push("a comment");
    if (!narrativeFor(childId)) out.push("the attendance, homework and grades summary (press Generate)");
    return out;
  };

  const print = (childId: string) => {
    setPrintId(childId);
    window.addEventListener("afterprint", () => setPrintId(null), { once: true });
    setTimeout(() => window.print(), 100);
  };

  const groups = useMemo(() => {
    const m = new Map<string, { sort: number; items: ClassTile[] }>();
    for (const c of classes || []) {
      const g = m.get(c.group) || { sort: c.sort, items: [] };
      g.items.push(c);
      m.set(c.group, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]));
  }, [classes]);

  const releasableInRoster = roster.map((k) => reports[k.id]).filter((r): r is ReportRow => !!r && (r.status === "pending_approval" || r.status === "approved")).map((r) => r.id);

  const ordered = roster;
  const openIdx = openChild ? ordered.findIndex((k) => k.id === openChild) : -1;
  const openKid = openIdx >= 0 ? ordered[openIdx] : null;
  const counts = {
    notStarted: roster.filter((k) => !reports[k.id]).length,
    draft: roster.filter((k) => reports[k.id]?.status === "draft").length,
    waiting: roster.filter((k) => reports[k.id]?.status === "pending_approval" || reports[k.id]?.status === "approved").length,
    issued: roster.filter((k) => reports[k.id]?.status === "released").length,
  };
  const viewTabs =
    mode === "admin"
      ? [
          { key: "classes" as const, label: "Write and review" },
          { key: "awaiting" as const, label: "Awaiting approval", count: awaiting.length, countAlert: awaiting.length > 0 },
          { key: "recent" as const, label: "Recently issued" },
        ]
      : [
          { key: "classes" as const, label: "My classes" },
          { key: "recent" as const, label: "Recent" },
        ];

  return (
    <div className="space-y-5">
      <PrintStyles />
      <PageHeader title="Progress reports" subtitle="Built from the attendance, homework, grades and Qur'an progress already recorded. Add a comment, then submit or issue." />

      <Tabs variant="switch" items={viewTabs} value={view} onChange={setView} label="Reports" />

      {msg && (
        <p role="status" className="rounded-lg border border-gold-light/60 bg-cream px-4 py-2 text-sm text-ink/80">
          {msg}
        </p>
      )}

      {view === "classes" && (
        <>
          <div className={`${card} grid gap-3 sm:grid-cols-2`}>
            <label className={ui.label}>
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={`mt-1 ${ui.input}`}>
                <option value="">{classes === null ? "Loading…" : classes.length === 0 ? "No classes yet" : "Choose a class…"}</option>
                {groups.map(([name, g]) => (
                  <optgroup key={name} label={name}>
                    {g.items.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.teacher ? ` (${c.teacher})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className={ui.label}>
              Term
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className={`mt-1 ${ui.input}`}>
                <option value="">All time</option>
                {(terms || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {terms !== null && terms.length === 0 && (
                <span className="mt-1 block text-xs font-normal text-ink/65">
                  {mode === "admin" ? (
                    <>
                      No terms yet:{" "}
                      <Link href="/admin/calendar?tab=terms" className="font-medium text-teal-700 underline">
                        add them
                      </Link>{" "}
                      so each report covers one term.
                    </>
                  ) : (
                    "No terms yet, so reports cover all time."
                  )}
                </span>
              )}
            </label>
          </div>

          {cls && (
            <section className="rounded-2xl border border-gold-light bg-white" aria-labelledby="roster-heading">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light px-4 py-3">
                <div>
                  <h2 id="roster-heading" className="font-serif text-h3 font-semibold text-ink">
                    {cls.name}
                  </h2>
                  <p className="text-sm text-ink/65">
                    {termLabel} · {roster.length} pupils
                    {roster.length > 0 && ` · ${counts.issued} issued, ${counts.waiting} awaiting approval, ${counts.draft} drafts, ${counts.notStarted} not started`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || rosterLoading || roster.length === 0} onClick={generateAll} className={btnPrimary}>
                    {counts.notStarted === roster.length ? "Create reports for the class" : "Refresh the figures"}
                  </button>
                  {mode === "teach" && counts.draft > 0 && (
                    <button type="button" disabled={busy || rosterLoading} onClick={submitAllDrafts} className={btnGhost}>
                      Submit ready drafts
                    </button>
                  )}
                  {mode === "admin" && releasableInRoster.length > 0 && (
                    <button type="button" disabled={busy} onClick={() => releaseIds(releasableInRoster, true)} className={btnGhost}>
                      Issue to families ({releasableInRoster.length})
                    </button>
                  )}
                </div>
              </div>
              {rosterLoading ? (
                <div className="m-4 h-24 animate-pulse rounded-lg bg-cream" />
              ) : roster.length === 0 ? (
                <p className="p-4 text-sm text-ink/65">No pupils are enrolled in this class yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Reports for {cls.name}</caption>
                    <thead>
                      <tr className="border-b border-gold-light text-left text-xs uppercase tracking-wide text-ink/65">
                        <th scope="col" className="px-4 py-2 font-semibold">Pupil</th>
                        <th scope="col" className="hidden px-2 py-2 font-semibold sm:table-cell">Attendance</th>
                        <th scope="col" className="hidden px-2 py-2 font-semibold sm:table-cell">Homework</th>
                        <th scope="col" className="hidden px-2 py-2 font-semibold md:table-cell">Average</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Comment</th>
                        <th scope="col" className="px-4 py-2 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((k) => {
                        const rep = reports[k.id];
                        const sm = summaries[k.id];
                        return (
                          <tr key={k.id} className="border-b border-gold-light/50 last:border-0 hover:bg-cream/50">
                            <th scope="row" className="px-4 py-2.5 text-left font-medium">
                              <button type="button" onClick={() => setOpenChild(k.id)} className="text-ink hover:text-teal-800 hover:underline">
                                {k.name}
                              </button>
                            </th>
                            <td className="hidden px-2 py-2.5 tabular-nums sm:table-cell">{sm ? fmtPct(sm.attendance.rate) : "–"}</td>
                            <td className="hidden px-2 py-2.5 tabular-nums sm:table-cell">{sm ? `${sm.homework.done}/${sm.homework.total}` : "–"}</td>
                            <td className="hidden px-2 py-2.5 tabular-nums md:table-cell">{sm ? fmtPct(sm.assessments.average_percent) : "–"}</td>
                            <td className="px-2 py-2.5">{(rep?.overall_comment || "").trim() ? <span className="text-green-800">Written</span> : <span className="text-ink/65">Not yet</span>}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="inline-flex flex-wrap justify-end gap-1">
                                {rep?.status === "draft" && rep.returned_reason && <StatusChip tone="warn">Sent back</StatusChip>}
                                {rep ? <StatusBadge status={rep.status} /> : <StatusChip>Not started</StatusChip>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-4 py-2 text-xs text-ink/65">Choose a pupil to see their report and write the comment.</p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {view === "awaiting" && mode === "admin" && (
        <section className={card} aria-label="Awaiting approval">
          {awaiting.length === 0 ? (
            <EmptyState title="Nothing is waiting for approval." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" disabled={busy || selected.length === 0} onClick={() => releaseIds(selected, false)} className={btnPrimary}>
                  Approve and issue selected ({selected.length})
                </button>
                <button type="button" disabled={busy} onClick={() => releaseIds(awaiting.map((x) => x.id), false)} className={btnGhost}>
                  Issue all
                </button>
              </div>
              <ul className="mt-3 divide-y divide-gold-light/30">
                {awaiting.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
                    <input type="checkbox" aria-label={`Select ${x.children?.name || "report"}`} checked={selected.includes(x.id)} onChange={(e) => setSelected((sl) => (e.target.checked ? [...sl, x.id] : sl.filter((y) => y !== x.id)))} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {x.children?.name || "Pupil"} <span className="font-normal text-ink/65">· {x.terms?.name || "All time"}</span>
                      </p>
                      {x.overall_comment && <p className="line-clamp-2 text-ink/70">{x.overall_comment}</p>}
                    </div>
                    <button type="button" disabled={busy} onClick={() => setReturning(returning?.id === x.id ? null : { id: x.id, reason: "" })} className={`${btnGhost} ${ui.sm}`}>
                      Send back
                    </button>
                    <button type="button" disabled={busy} onClick={() => releaseIds([x.id], false)} className={`${btnPrimary} ${ui.sm}`}>
                      Issue
                    </button>
                    {returning?.id === x.id && (
                      <div className="basis-full pl-7">
                        <label htmlFor={`return-${x.id}`} className="block text-xs font-medium text-ink">
                          What needs changing? The teacher sees this.
                        </label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <input id={`return-${x.id}`} value={returning.reason} onChange={(e) => setReturning({ id: x.id, reason: e.target.value })} className={`min-w-0 flex-1 ${ui.input}`} placeholder="e.g. Please mention his progress in Qur'an recitation." />
                          <button type="button" disabled={busy} onClick={() => sendBack(x.id, returning.reason)} className={btnPrimary}>
                            Send back
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {view === "recent" && (
        <section className={card} aria-label={mode === "admin" ? "Recently issued" : "Recent reports"}>
          {recent.length === 0 ? (
            <EmptyState title={mode === "admin" ? "Nothing has been issued yet." : "You haven't started any reports yet."} />
          ) : (
            <ul className="divide-y divide-gold-light/30">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 font-medium text-ink">{r.children?.name || "Pupil"}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/65">
                    <span>{r.terms?.name || "All time"}</span>
                    <span>{fmtDate(mode === "admin" ? r.released_at : r.updated_at)}</span>
                    <StatusBadge status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* One pupil's report in a side panel: the report as the family will see it, the comment, and the next step. */}
      {openKid && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 print:static print:bg-transparent" role="dialog" aria-modal="true" aria-label={`${openKid.name}: progress report`}>
          <button type="button" aria-label="Close" className="flex-1 cursor-default print:hidden" onClick={() => setOpenChild(null)} />
          <div className="flex h-full w-full max-w-3xl flex-col bg-cream shadow-2xl print:max-w-none print:shadow-none">
            <div className="flex items-center gap-2 border-b border-gold-light bg-white px-4 py-3 print:hidden">
              <button type="button" className={`${btnGhost} ${ui.sm}`} disabled={openIdx <= 0} onClick={() => setOpenChild(ordered[openIdx - 1].id)}>
                ‹ Previous
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink">
                {openKid.name} <span className="font-normal text-ink/65">· {openIdx + 1} of {ordered.length}</span>
              </p>
              <button type="button" className={`${btnGhost} ${ui.sm}`} disabled={openIdx >= ordered.length - 1} onClick={() => setOpenChild(ordered[openIdx + 1].id)}>
                Next ›
              </button>
              <button type="button" className={`${btnGhost} ${ui.sm}`} onClick={() => setOpenChild(null)}>
                Close
              </button>
            </div>
            {(() => {
              const k = openKid;
              const rep = reports[k.id];
              const canEdit = !rep || editable(rep.status);
              const need = missing(k.id);
              return (
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {rep?.status === "draft" && rep.returned_reason && (
                    <Notice tone="warn">
                      <span className="font-semibold">Sent back:</span> {rep.returned_reason}
                    </Notice>
                  )}
                  <ReportDocument childName={k.name} termLabel={termLabel} status={rep?.status} narrative={narrativeFor(k.id)} comment={commentFor(k.id) || null} printing={printId === k.id} live={!rep || editable(rep.status)} />
                  <div className={`${card} print:hidden`}>
                    <label htmlFor={`comment-${k.id}`} className={ui.label}>
                      Comment for {k.name}
                    </label>
                    <textarea id={`comment-${k.id}`} rows={5} disabled={!canEdit} value={commentFor(k.id)} onChange={(e) => setDrafts((d) => ({ ...d, [k.id]: e.target.value }))} className={`mt-1 ${ui.input}`} />
                    {canEdit && snippets.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-teal-700">Add a sentence from the comment bank</summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {snippets.map((c) => (
                            <button key={c.id} type="button" onClick={() => setDrafts((d) => ({ ...d, [k.id]: commentFor(k.id) ? `${commentFor(k.id)} ${c.text}` : c.text }))} className={ui.chip}>
                              + {c.text.slice(0, 40)}
                              {c.text.length > 40 ? "…" : ""}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                    {canEdit && need.length > 0 && <p className="mt-2 text-xs text-ink/70">Before it can be {mode === "admin" ? "issued" : "submitted"}, this report needs {need.join(" and ")}.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit && (
                        <button type="button" disabled={busy} onClick={() => writeReport(k, rep?.status || "draft")} className={btnGhost}>
                          Save
                        </button>
                      )}
                      {mode === "teach" && canEdit && (
                        <button type="button" disabled={busy || need.length > 0 || rep?.status === "pending_approval"} onClick={() => writeReport(k, "pending_approval")} className={btnPrimary}>
                          Submit for approval
                        </button>
                      )}
                      {mode === "admin" && canEdit && (
                        <button type="button" disabled={busy || need.length > 0} onClick={() => writeReport(k, "released")} className={btnPrimary}>
                          Approve and issue
                        </button>
                      )}
                      {mode === "admin" && rep?.status === "released" && (
                        <button type="button" disabled={busy} onClick={() => reopen(rep.id)} className={btnGhost}>
                          Reopen for a correction
                        </button>
                      )}
                      <button type="button" onClick={() => print(k.id)} className={btnGhost}>
                        Print or save as PDF
                      </button>
                    </div>
                    {mode === "teach" && <p className="mt-2 text-xs text-ink/65">Once submitted, the Headteacher approves it and issues it to the family.</p>}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
