"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { ReportDocument, PrintStyles } from "./ReportDocument";
import { asNarrative } from "./summary";
import { EmptyState } from "@/components/learn/ui";

type Row = {
  id: string;
  report_id: string;
  version: number;
  overall_comment: string | null;
  subject_comments: Record<string, string> | null;
  narrative: unknown;
  released_at: string | null;
  children?: { name: string } | null;
  terms?: { name: string } | null;
};

/** Issued progress reports for the signed-in parent/student (latest issued version of each). RLS limits rows to the caller's own child. */
export function ReleasedReports() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // The issued copies (0097): a report reopened for a correction keeps
    // showing its last issued version here until it is issued again.
    supabase
      .from("term_report_versions")
      .select("id, report_id, version, overall_comment, subject_comments, narrative, released_at, children(name), terms(name)")
      .order("released_at", { ascending: false })
      .then(({ data }) => {
        const latest = new Map<string, Row>();
        for (const r of (data as unknown as Row[]) || []) {
          const cur = latest.get(r.report_id);
          if (!cur || r.version > cur.version) latest.set(r.report_id, r);
        }
        setRows([...latest.values()].sort((a, b) => (b.released_at || "").localeCompare(a.released_at || "")));
      });
  }, [supabase]);

  const print = (id: string) => {
    setPrintId(id);
    window.addEventListener("afterprint", () => setPrintId(null), { once: true });
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="space-y-4">
      <PrintStyles />
      <PageHeader title="Progress Reports" subtitle="Reports issued by the school, built from attendance, homework and grades." />
      {rows === null ? (
        <p className="text-sm text-ink/65">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No reports yet" icon="fileText" tile="tile-blue">Reports are written at the end of each term and appear here the day the school releases them, with a note from the form tutor.</EmptyState>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="space-y-2">
            <ReportDocument
              childName={r.children?.name || "Student"}
              termLabel={r.terms?.name || "All time"}
              issuedAt={r.released_at}
              narrative={asNarrative(r.narrative)}
              comment={r.overall_comment}
              subjectComments={r.subject_comments || undefined}
              printing={printId === r.id}
            />
            <div className="flex justify-end print:hidden">
              <button type="button" onClick={() => print(r.id)} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-cream">
                Print / Save as PDF
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
