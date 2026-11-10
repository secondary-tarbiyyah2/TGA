"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, StatusChip, ui } from "@/components/learn/ui";
import { ReportDocument, PrintStyles, fmtPct, overallOf } from "./ReportDocument";
import { asNarrative } from "./summary";

type Row = {
  id: string;
  report_id: string;
  version: number;
  child_id: string;
  overall_comment: string | null;
  subject_comments: Record<string, string> | null;
  narrative: unknown;
  released_at: string | null;
  children?: { name: string } | null;
  terms?: { name: string; starts_on: string } | null;
};

const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * Issued progress reports for the signed-in parent or pupil: a list of reports
 * (one per child per term, newest first), and one report at a time to read or
 * print. Only the latest issued copy of each is shown (0097); RLS limits rows
 * to the caller's own children.
 */
export function ReleasedReports({ audience = "family" }: { audience?: "family" | "student" } = {}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [child, setChild] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  // Opening a report swaps the list for the report: start it at the top, and
  // put the reader back where they were in the list when they return.
  const listScroll = useRef(0);
  const topRef = useRef<HTMLDivElement | null>(null);
  const openReport = (id: string) => {
    listScroll.current = window.scrollY;
    setOpenId(id);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  };
  const closeReport = () => {
    setOpenId(null);
    requestAnimationFrame(() => window.scrollTo({ top: listScroll.current }));
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("term_report_versions")
      .select("id, report_id, version, child_id, overall_comment, subject_comments, narrative, released_at, children(name), terms(name, starts_on)")
      .order("released_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        const latest = new Map<string, Row>();
        for (const r of (data as unknown as Row[]) || []) {
          const cur = latest.get(r.report_id);
          if (!cur || r.version > cur.version) latest.set(r.report_id, r);
        }
        setRows([...latest.values()].sort((a, b) => (b.terms?.starts_on || b.released_at || "").localeCompare(a.terms?.starts_on || a.released_at || "")));
      });
    return () => {
      alive = false;
    };
  }, []);

  const children = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) m.set(r.child_id, r.children?.name || "Pupil");
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const activeChild = child && children.some((c) => c.id === child) ? child : children[0]?.id || "";
  const list = (rows || []).filter((r) => children.length < 2 || r.child_id === activeChild);
  const open = (rows || []).find((r) => r.id === openId) || null;

  const print = () => {
    setPrinting(true);
    window.addEventListener("afterprint", () => setPrinting(false), { once: true });
    setTimeout(() => window.print(), 100);
  };

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-4">
      <PrintStyles />
      <div className="print:hidden">
        <PageHeader
          title={audience === "student" ? "My reports" : "Progress reports"}
          subtitle={audience === "student" ? "Your end-of-term reports, with what your teachers say about your work." : "End-of-term reports from the school: attendance, homework, merits, Qur'an and grades, with your teachers' comments."}
        />
      </div>

      {rows === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : rows.length === 0 ? (
        <EmptyState title="No reports yet" icon="fileText" tile="tile-blue">
          Reports are written at the end of each term and appear here the day the school issues them.
        </EmptyState>
      ) : open ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <button type="button" onClick={closeReport} className={`${ui.btnSecondary} ${ui.sm}`}>
              ‹ All reports
            </button>
            <button type="button" onClick={print} className={`${ui.btnSecondary} ${ui.sm}`}>
              Print or save as PDF
            </button>
          </div>
          <ReportDocument
            childName={open.children?.name || "Pupil"}
            termLabel={open.terms?.name || "All time"}
            issuedAt={open.released_at}
            narrative={asNarrative(open.narrative)}
            comment={open.overall_comment}
            subjectComments={open.subject_comments || undefined}
            printing={printing}
          />
        </div>
      ) : (
        <>
          {children.length > 1 && <Tabs variant="switch" label="Child" value={activeChild} onChange={setChild} items={children.map((c) => ({ key: c.id, label: c.name.split(/\s+/)[0] }))} />}
          <ul data-guide="reports-list" className="grid gap-3 sm:grid-cols-2">
            {list.map((r) => {
              const n = asNarrative(r.narrative);
              const o = n ? overallOf(Object.values(n.classes)) : null;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => openReport(r.id)} className="block h-full w-full rounded-2xl border border-gold-light bg-white p-4 text-left transition hover:border-teal-500/40 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{r.terms?.name || "All time"}</p>
                        <p className="text-xs text-ink/65">
                          {audience === "student" || !r.children?.name ? "Issued" : `${r.children.name} · issued`} {longDate(r.released_at)}
                        </p>
                      </div>
                      {r.version > 1 && <StatusChip tone="info">Corrected</StatusChip>}
                    </div>
                    {o && (
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-cream/60 p-2">
                          <dt className="text-[11px] text-ink/65">Attendance</dt>
                          <dd className="text-sm font-semibold text-ink">{fmtPct(o.rate)}</dd>
                        </div>
                        <div className="rounded-lg bg-cream/60 p-2">
                          <dt className="text-[11px] text-ink/65">Homework</dt>
                          <dd className="text-sm font-semibold text-ink">{o.hwTotal ? `${o.hwDone}/${o.hwTotal}` : "–"}</dd>
                        </div>
                        <div className="rounded-lg bg-cream/60 p-2">
                          <dt className="text-[11px] text-ink/65">Average</dt>
                          <dd className="text-sm font-semibold text-ink">{fmtPct(o.avg)}</dd>
                        </div>
                      </dl>
                    )}
                    <p className="mt-3 text-sm font-medium text-teal-700">Read the report &rarr;</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
