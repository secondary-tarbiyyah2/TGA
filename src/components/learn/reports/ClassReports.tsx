"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Notice, StatusChip, ui, type Tone } from "@/components/learn/ui";
import { fmtPct } from "./ReportDocument";
import { asNarrative, buildClassSummaries, mergeNarrative, termRange, type ClassSummary, type TermOption } from "./summary";
import { STATE_LABEL, loadEnrolments, loadIssuedChildren, loadTermReports, reportsHref, stateOf, type ClassInfo, type Mode, type Pupil, type PupilState, type ReportRow } from "./data";

import { Select } from "@/components/ui/Dropdown";
const STATE_TONE: Record<PupilState, Tone> = { not_started: "neutral", draft: "info", returned: "warn", pending: "warn", released: "good" };
type Filter = "all" | PupilState;

/** One class for one term: who has a report, how far each has got, and the class-wide actions. */
export function ClassReports({ mode, cls, term, termKey, me, onChanged }: { mode: Mode; cls: ClassInfo; term: TermOption | null; termKey: string; me: { id: string; name: string } | null; onChanged: () => void }) {
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [reports, setReports] = useState<Record<string, ReportRow>>({});
  const [issued, setIssued] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Record<string, ClassSummary>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad" | "info"; text: string } | null>(null);
  const req = useRef(0);
  const termLabel = term ? term.name : "All time";

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const n = ++req.current;
    const enrol = await loadEnrolments(supabase, [cls.id]);
    const kids = enrol[cls.id] || [];
    const ids = kids.map((k) => k.id);
    const [reps, iss, sums] = await Promise.all([loadTermReports(supabase, term?.id || null, ids), loadIssuedChildren(supabase, term?.id || null, ids), buildClassSummaries(supabase, { id: cls.id, name: cls.name }, ids, termRange(term))]);
    if (n !== req.current) return;
    setPupils(kids);
    setReports(reps);
    setIssued(iss);
    setSummaries(sums);
  }, [cls.id, cls.name, term]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const editable = (status: string) => (status === "released" ? false : mode === "admin" ? true : status === "draft" || status === "pending_approval");

  const rows = useMemo(
    () =>
      (pupils || []).map((p) => {
        const rep = reports[p.id];
        const n = asNarrative(rep?.narrative);
        return { ...p, rep, state: stateOf(rep, issued.has(p.id)), sum: summaries[p.id], rated: !!n?.ratings?.[cls.id], commented: !!(rep?.overall_comment || "").trim() };
      }),
    [pupils, reports, issued, summaries, cls.id]
  );
  type R = (typeof rows)[number];
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, not_started: 0, draft: 0, returned: 0, pending: 0, released: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.state === filter);

  const fail = (what: string, error: { message: string } | null) => {
    if (!error) return false;
    setMsg({ tone: "bad", text: `${what} failed: ${error.message}` });
    return true;
  };

  /** Create a draft (with the figures) for every pupil without one, and refresh the figures on editable drafts. */
  const generateAll = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !me) return;
    setBusy(true);
    setMsg(null);
    try {
      const inserts: Record<string, unknown>[] = [];
      const updates: PromiseLike<{ error: { message: string } | null }>[] = [];
      for (const r of rows) {
        if (!r.sum || r.state === "released") continue;
        if (!r.rep) inserts.push({ child_id: r.id, term_id: term ? term.id : null, status: "draft", narrative: mergeNarrative(null, r.sum, termLabel), written_by: me.id });
        else if (editable(r.rep.status)) updates.push(supabase.from("term_reports").update({ narrative: mergeNarrative(asNarrative(r.rep.narrative), r.sum, termLabel) }).eq("id", r.rep.id));
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from("term_reports").insert(inserts);
        if (fail("Creating drafts", error)) return;
      }
      const bad = (await Promise.all(updates)).find((x) => x.error);
      if (bad && fail("Refreshing figures", bad.error)) return;
      setMsg({ tone: "good", text: `${inserts.length} new draft${inserts.length === 1 ? "" : "s"} created${updates.length ? `, figures refreshed on ${updates.length}` : ""}. Open each pupil to add your comments.` });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const ready = rows.filter((r) => r.rep && (r.state === "draft" || r.state === "returned") && r.commented && asNarrative(r.rep.narrative));
  const submitReady = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || ready.length === 0) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("term_reports").update({ status: "pending_approval" }).in("id", ready.map((r) => r.rep!.id));
    setBusy(false);
    if (fail("Submitting", error)) return;
    const left = counts.draft + counts.returned - ready.length;
    setMsg({ tone: "good", text: `Submitted ${ready.length} report${ready.length === 1 ? "" : "s"} for approval.${left > 0 ? ` ${left} still need${left === 1 ? "s" : ""} a comment.` : ""}` });
    await load();
    onChanged();
  };

  const pending = rows.filter((r) => r.state === "pending" && r.rep);
  const issuePending = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || pending.length === 0) return;
    if (!window.confirm(`Approve and issue ${pending.length} report${pending.length === 1 ? "" : "s"} to families now?`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("term_reports").update({ status: "released" }).in("id", pending.map((r) => r.rep!.id));
    setBusy(false);
    if (fail("Issuing", error)) return;
    setMsg({ tone: "good", text: `Issued ${pending.length} report${pending.length === 1 ? "" : "s"} to families.` });
    await load();
    onChanged();
  };

  const href = (childId: string) => reportsHref(mode, { view: "pupil", term: termKey, cls: cls.id, child: childId });
  const columns: Column<R>[] = [
    {
      key: "name",
      header: "Pupil",
      sort: (r) => r.name,
      csv: (r) => r.name,
      cell: (r) => (
        <Link href={href(r.id)} className="font-medium text-ink hover:text-teal-800 hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "att", header: "Attendance", sort: (r) => r.sum?.attendance.rate ?? -1, csv: (r) => r.sum?.attendance.rate ?? "", cell: (r) => <span className="tabular-nums">{r.sum ? fmtPct(r.sum.attendance.rate) : "–"}</span>, hideOnPhone: true },
    { key: "hw", header: "Homework", sort: (r) => r.sum?.homework.rate ?? -1, cell: (r) => <span className="tabular-nums">{r.sum && r.sum.homework.total ? `${r.sum.homework.done}/${r.sum.homework.total}` : "–"}</span>, hideOnPhone: true },
    { key: "section", header: "Your section", sort: (r) => (r.rated ? 1 : 0), cell: (r) => (r.rated ? <span className="text-green-800">Done</span> : <span className="text-ink/65">Not yet</span>), hideOnPhone: true },
    { key: "comment", header: "Comment", sort: (r) => (r.commented ? 1 : 0), cell: (r) => (r.commented ? <span className="text-green-800">Written</span> : <span className="text-ink/65">Not yet</span>) },
    {
      key: "status",
      header: "Status",
      align: "right",
      sort: (r) => ["returned", "not_started", "draft", "pending", "released"].indexOf(r.state),
      csv: (r) => STATE_LABEL[r.state],
      cell: (r) => <StatusChip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</StatusChip>,
    },
  ];

  const allStarted = counts.not_started === 0;
  return (
    <div className="space-y-4">
      <section className={`${ui.card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {cls.name} · {termLabel}
          </p>
          <p className="text-xs text-ink/65">
            {pupils === null ? "Loading…" : `${counts.all} pupils · ${counts.released} issued · ${counts.pending} awaiting approval · ${counts.draft + counts.returned} drafts · ${counts.not_started} not started`}
            {mode === "admin" && cls.teacher ? ` · ${cls.teacher}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || pupils === null || counts.all === 0 || counts.released === counts.all} onClick={generateAll} className={allStarted ? ui.btnSecondary : ui.btnPrimary}>
            {allStarted ? "Refresh the figures" : counts.not_started === counts.all ? "Create drafts for the class" : `Create ${counts.not_started} missing draft${counts.not_started === 1 ? "" : "s"}`}
          </button>
          {mode === "teach" && ready.length > 0 && (
            <button type="button" disabled={busy} onClick={submitReady} className={allStarted ? ui.btnPrimary : ui.btnSecondary}>
              Submit {ready.length} ready for approval
            </button>
          )}
          {mode === "admin" && pending.length > 0 && (
            <button type="button" disabled={busy} onClick={issuePending} className={ui.btnPrimary}>
              Approve and issue {pending.length}
            </button>
          )}
        </div>
      </section>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <DataTable
        caption={`Reports for ${cls.name}`}
        rows={pupils === null ? null : shown}
        rowKey={(r) => r.id}
        columns={columns}
        search={{ text: (r) => r.name, placeholder: "Search pupils" }}
        filters={
          <Select allowEmpty value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Show" className={`${ui.input} !w-auto`}>
            <option value="all">All pupils ({counts.all})</option>
            {(["not_started", "draft", "returned", "pending", "released"] as PupilState[]).map((k) => (
              <option key={k} value={k}>
                {STATE_LABEL[k]} ({counts[k]})
              </option>
            ))}
          </Select>
        }
        initialSort={{ key: "name", dir: "asc" }}
        csvName={`reports-${cls.name}`}
        empty="No pupils are enrolled in this class yet."
        emptyFiltered="No pupils match."
      />
      <p className="text-xs text-ink/65">Choose a pupil to open their report. You can move through the class with Previous and Next.</p>
    </div>
  );
}
