"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { myTeachingClasses } from "@/lib/learn/classes";
import { ReportDocument, PrintStyles, StatusBadge, fmtPct } from "./ReportDocument";
import { asNarrative, buildClassSummaries, mergeNarrative, termRange, type ClassSummary, type ReportNarrative, type TermOption } from "./summary";

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

const btnPrimary = "rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50";
const btnGhost = "rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-cream disabled:opacity-50";
const card = "rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6";

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
    setOpenChild(null);
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

  return (
    <div className="space-y-6">
      <PrintStyles />
      <PageHeader
        title="Progress Reports"
        subtitle="Built from Qur'an progress, attendance, homework and grades already recorded, with your comment added. Safeguarding records never appear."
      />

      <div className="space-y-6">
        <div className={card}>
          <label htmlFor="report-term" className="block text-sm font-medium text-ink">
            Term
          </label>
          <select id="report-term" value={termId} onChange={(e) => setTermId(e.target.value)} className="mt-1 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm sm:w-72">
            <option value="">All time</option>
            {(terms || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {terms !== null && terms.length === 0 && (
            <p className="mt-2 text-sm text-ink/60">
              {mode === "admin" ? (
                <>
                  <Link href="/admin/calendar?tab=terms" className="font-medium text-teal-700 underline">
                    Add this year&apos;s terms
                  </Link>{" "}
                  (Calendar › Terms) so each report covers one term. Until then reports cover all time.
                </>
              ) : (
                "No terms are set up yet, so reports cover all time. The head or office can add terms under Calendar › Terms."
              )}
            </p>
          )}
        </div>

        {msg && (
          <p role="status" className="rounded-lg border border-gold-light/60 bg-cream px-4 py-2 text-sm text-ink/80">
            {msg}
          </p>
        )}

        {mode === "admin" && awaiting.length > 0 && (
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-h3 font-semibold text-ink">Awaiting approval ({awaiting.length})</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || selected.length === 0} onClick={() => releaseIds(selected, false)} className={btnPrimary}>
                  Approve &amp; release selected ({selected.length})
                </button>
                <button type="button" disabled={busy} onClick={() => releaseIds(awaiting.map((a) => a.id), false)} className={btnGhost}>
                  Release all
                </button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-gold-light/30">
              {awaiting.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.children?.name || "report"}`}
                    checked={selected.includes(a.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      {a.children?.name || "Student"} <span className="font-normal text-ink/60">· {a.terms?.name || "All time"}</span>
                    </p>
                    {a.overall_comment && <p className="line-clamp-2 text-ink/70">{a.overall_comment}</p>}
                  </div>
                  <StatusBadge status={a.status} />
                  <button type="button" disabled={busy} onClick={() => setReturning(returning?.id === a.id ? null : { id: a.id, reason: "" })} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
                    Send back
                  </button>
                  <button type="button" disabled={busy} onClick={() => releaseIds([a.id], false)} className="rounded-lg bg-gold-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-900 disabled:opacity-50">
                    Release
                  </button>
                  {returning?.id === a.id && (
                    <div className="basis-full pl-7">
                      <label htmlFor={`return-${a.id}`} className="block text-xs font-medium text-ink">
                        What needs changing? The teacher sees this.
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input
                          id={`return-${a.id}`}
                          value={returning.reason}
                          onChange={(e) => setReturning({ id: a.id, reason: e.target.value })}
                          className="min-w-0 flex-1 rounded-md border border-gold-light/60 px-3 py-1.5 text-sm"
                          placeholder="e.g. Please mention his progress in Qur'an recitation."
                        />
                        <button type="button" disabled={busy} onClick={() => sendBack(a.id, returning.reason)} className={btnPrimary}>
                          Send back
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={card}>
          <h2 className="font-serif text-h3 font-semibold text-ink">{mode === "admin" ? "Classes" : "Your classes"}</h2>
          {classes === null ? (
            <p className="mt-2 text-sm text-ink/60">Loading…</p>
          ) : classes.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">
              {mode === "admin" ? (
                <>
                  No classes yet. Set them up under{" "}
                  <Link href="/admin/academic" className="font-medium text-teal-700 underline">
                    Academic setup
                  </Link>
                  .
                </>
              ) : (
                "You are not assigned to any classes yet."
              )}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {groups.map(([name, g]) => (
                <details key={name} open className="rounded-xl border border-gold-light/40">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink">
                    {name} · {g.items.length} class{g.items.length === 1 ? "" : "es"}
                  </summary>
                  <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={c.id === classId}
                        onClick={() => setClassId(c.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${c.id === classId ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-gold-light/60 bg-white hover:bg-cream"}`}
                      >
                        <span className="block text-sm font-semibold text-ink">{c.name}</span>
                        {c.teacher && <span className="block text-xs text-ink/60">{c.teacher}</span>}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {cls && (
          <div className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-h3 font-semibold text-ink">{cls.name}</h2>
                <p className="text-sm text-ink/60">
                  {termLabel} · {roster.length} student{roster.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || rosterLoading || roster.length === 0} onClick={generateAll} className={btnPrimary}>
                  Generate for whole class
                </button>
                {mode === "teach" && (
                  <button type="button" disabled={busy || rosterLoading} onClick={submitAllDrafts} className={btnGhost}>
                    Submit all drafts
                  </button>
                )}
                {mode === "admin" && (
                  <button type="button" disabled={busy || releasableInRoster.length === 0} onClick={() => releaseIds(releasableInRoster, true)} className={btnGhost}>
                    Release class ({releasableInRoster.length})
                  </button>
                )}
              </div>
            </div>

            {rosterLoading ? (
              <p className="mt-4 text-sm text-ink/60">Building summaries…</p>
            ) : roster.length === 0 ? (
              <p className="mt-4 text-sm text-ink/60">No students are enrolled in this class yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-gold-light/30 rounded-xl border border-gold-light/40">
                {roster.map((k) => {
                  const rep = reports[k.id];
                  const s = summaries[k.id];
                  const isOpen = openChild === k.id;
                  const canEdit = !rep || editable(rep.status);
                  return (
                    <li key={k.id}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenChild(isOpen ? null : k.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cream/50"
                      >
                        <span className="min-w-0 font-medium text-ink">{k.name}</span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/60">
                          {s && (
                            <>
                              <span>Attendance {fmtPct(s.attendance.rate)}</span>
                              <span>
                                Homework {s.homework.done}/{s.homework.total}
                              </span>
                              <span>Avg {fmtPct(s.assessments.average_percent)}</span>
                            </>
                          )}
                          {rep?.status === "draft" && rep.returned_reason && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-900">Sent back</span>}
                          {rep ? <StatusBadge status={rep.status} /> : <span className="rounded-full bg-cream px-2 py-0.5 font-medium text-ink/60">Not started</span>}
                          {rep?.status === "released" && rep.version > 1 && <span className="text-ink/60">version {rep.version}</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="space-y-3 border-t border-gold-light/30 bg-cream/20 p-3 sm:p-4">
                          {rep?.status === "draft" && rep.returned_reason && (
                            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:hidden">
                              <span className="font-semibold">Sent back:</span> {rep.returned_reason}
                            </p>
                          )}
                          <ReportDocument
                            childName={k.name}
                            termLabel={termLabel}
                            status={rep?.status}
                            narrative={narrativeFor(k.id)}
                            comment={commentFor(k.id) || null}
                            printing={printId === k.id}
                            live={!rep || editable(rep.status)}
                          />
                          <div className="print:hidden">
                            <label htmlFor={`comment-${k.id}`} className="block text-sm font-medium text-ink">
                              Comment for {k.name}
                            </label>
                            <textarea
                              id={`comment-${k.id}`}
                              rows={4}
                              disabled={!canEdit}
                              value={commentFor(k.id)}
                              onChange={(e) => setDrafts((d) => ({ ...d, [k.id]: e.target.value }))}
                              className="mt-1 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm disabled:bg-cream"
                            />
                            {canEdit && snippets.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {snippets.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setDrafts((d) => ({ ...d, [k.id]: commentFor(k.id) ? `${commentFor(k.id)} ${c.text}` : c.text }))}
                                    className="rounded-lg border border-gold-light bg-white px-2 py-1.5 text-xs font-medium text-ink/80 transition-colors hover:bg-cream"
                                  >
                                    + {c.text.slice(0, 30)}
                                    {c.text.length > 30 ? "…" : ""}
                                  </button>
                                ))}
                              </div>
                            )}
                            {canEdit && missing(k.id).length > 0 && (
                              <p className="mt-2 text-xs text-ink/70">Before it can be {mode === "admin" ? "issued" : "submitted"}, this report needs {missing(k.id).join(" and ")}.</p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {canEdit && (
                                <button type="button" disabled={busy} onClick={() => writeReport(k, rep?.status || "draft")} className={btnGhost}>
                                  {rep ? "Save" : "Generate report"}
                                </button>
                              )}
                              {mode === "teach" && canEdit && (
                                <button type="button" disabled={busy || missing(k.id).length > 0 || rep?.status === "pending_approval"} onClick={() => writeReport(k, "pending_approval")} className={btnPrimary}>
                                  Submit for approval
                                </button>
                              )}
                              {mode === "admin" && canEdit && (
                                <button type="button" disabled={busy || missing(k.id).length > 0} onClick={() => writeReport(k, "released")} className={btnPrimary}>
                                  Approve &amp; release
                                </button>
                              )}
                              {mode === "admin" && rep?.status === "released" && (
                                <button type="button" disabled={busy} onClick={() => reopen(rep.id)} className={btnGhost}>
                                  Reopen for a correction
                                </button>
                              )}
                              <button type="button" onClick={() => print(k.id)} className={btnGhost}>
                                Print / Save as PDF
                              </button>
                            </div>
                            {mode === "teach" && <p className="mt-2 text-xs text-ink/65">Once submitted, only the Headteacher or an admin can approve and release it to the family.</p>}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className={card}>
          <h2 className="font-serif text-h3 font-semibold text-ink">{mode === "admin" ? "Recently issued" : "Recent reports"}</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">{mode === "admin" ? "Nothing has been issued yet." : "You haven't started any reports yet. Pick a class above."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-gold-light/30">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 font-medium text-ink">{r.children?.name || "Student"}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60">
                    <span>{r.terms?.name || "All time"}</span>
                    <span>{fmtDate(mode === "admin" ? r.released_at : r.updated_at)}</span>
                    <StatusBadge status={r.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
