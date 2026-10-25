"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { ui } from "@/components/learn/ui";
import { ReportDocument } from "./ReportDocument";
import { asNarrative, fetchAll, type TermOption } from "./summary";
import { fmtDate } from "./data";

type Version = {
  id: string;
  report_id: string;
  version: number;
  child_id: string;
  overall_comment: string | null;
  subject_comments: Record<string, string> | null;
  narrative: unknown;
  released_at: string;
  children: { name: string } | null;
};

/** Issued reports for the term, exactly as families see them (the latest issued copy of each). */
export function IssuedReports({ term }: { term: TermOption | null; termKey: string }) {
  const [rows, setRows] = useState<Version[] | null>(null);
  const [open, setOpen] = useState<Version | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const data = await fetchAll<Version>((f, t) => {
        let q = supabase.from("term_report_versions").select("id, report_id, version, child_id, overall_comment, subject_comments, narrative, released_at, children(name)");
        q = term ? q.eq("term_id", term.id) : q.is("term_id", null);
        return q.order("released_at", { ascending: false }).range(f, t);
      });
      const latest = new Map<string, Version>();
      for (const r of data) {
        const cur = latest.get(r.report_id);
        if (!cur || r.version > cur.version) latest.set(r.report_id, r);
      }
      if (alive) setRows([...latest.values()]);
    })();
    return () => {
      alive = false;
    };
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const columns = useMemo<Column<Version>[]>(
    () => [
      {
        key: "name",
        header: "Pupil",
        sort: (r) => r.children?.name || "",
        csv: (r) => r.children?.name || "",
        cell: (r) => (
          <button type="button" onClick={() => setOpen(r)} className="font-medium text-ink hover:text-teal-800 hover:underline">
            {r.children?.name || "Pupil"}
          </button>
        ),
      },
      { key: "issued", header: "Issued", sort: (r) => r.released_at, csv: (r) => fmtDate(r.released_at), cell: (r) => fmtDate(r.released_at) },
      { key: "version", header: "Copy", sort: (r) => r.version, cell: (r) => (r.version > 1 ? `Corrected (v${r.version})` : "Original"), hideOnPhone: true },
      {
        key: "open",
        header: "",
        align: "right",
        cell: (r) => (
          <button type="button" onClick={() => setOpen(r)} className={`${ui.btnSecondary} ${ui.sm}`}>
            View
          </button>
        ),
      },
    ],
    []
  );

  const print = () => {
    setPrinting(true);
    window.addEventListener("afterprint", () => setPrinting(false), { once: true });
    setTimeout(() => window.print(), 100);
  };

  return (
    <>
      <div className="print:hidden">
        <DataTable
          caption="Issued reports"
          rows={rows}
          rowKey={(r) => r.id}
          columns={columns}
          search={{ text: (r) => r.children?.name || "", placeholder: "Search pupils" }}
          initialSort={{ key: "name", dir: "asc" }}
          csvName={`issued-reports-${term?.name || "all-time"}`}
          empty="Nothing has been issued for this term yet."
        />
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 print:static print:bg-transparent" role="dialog" aria-modal="true" aria-label={`${open.children?.name || "Pupil"}: issued report`}>
          <button type="button" aria-label="Close" className="flex-1 cursor-default print:hidden" onClick={() => setOpen(null)} />
          <div className="flex h-full w-full max-w-3xl flex-col bg-cream shadow-2xl print:max-w-none print:shadow-none">
            <div className="flex items-center gap-2 border-b border-gold-light bg-white px-4 py-3 print:hidden">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{open.children?.name || "Pupil"}: as the family sees it</p>
              <button type="button" onClick={print} className={`${ui.btnSecondary} ${ui.sm}`}>
                Print or PDF
              </button>
              <button type="button" onClick={() => setOpen(null)} className={`${ui.btnSecondary} ${ui.sm}`} autoFocus>
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ReportDocument
                childName={open.children?.name || "Pupil"}
                termLabel={term?.name || "All time"}
                issuedAt={open.released_at}
                narrative={asNarrative(open.narrative)}
                comment={open.overall_comment}
                subjectComments={open.subject_comments || undefined}
                printing={printing}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
