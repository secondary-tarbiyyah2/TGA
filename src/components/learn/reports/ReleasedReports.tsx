"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { ReportDocument, PrintStyles } from "./ReportDocument";
import { asNarrative } from "./summary";

type Row = {
  id: string;
  overall_comment: string | null;
  subject_comments: Record<string, string> | null;
  narrative: unknown;
  released_at: string | null;
  children?: { name: string } | null;
  terms?: { name: string } | null;
};

/** Released progress reports for the signed-in parent/student. RLS limits rows to the caller's own released reports. */
export function ReleasedReports() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("term_reports")
      .select("id, overall_comment, subject_comments, narrative, released_at, children(name), terms(name)")
      .eq("status", "released")
      .order("released_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) || []));
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
        <p className="text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/60">No reports have been issued yet. They will appear here once the school releases them.</div>
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
