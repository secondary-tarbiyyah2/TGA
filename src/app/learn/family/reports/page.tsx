"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PrintButton } from "@/components/learn/PrintButton";
import { useLearnSignOut } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type Report = {
  id: string;
  overall_comment: string | null;
  subject_comments: Record<string, string>;
  released_at: string | null;
  children?: { name: string } | null;
  terms?: { name: string } | null;
};

function FamilyReportsContent() {
  const signOut = useLearnSignOut();
  const supabase = getSupabaseClient();
  const [reports, setReports] = useState<Report[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("term_reports")
      .select("id, overall_comment, subject_comments, released_at, children(name), terms(name)")
      .order("released_at", { ascending: false })
      .then(({ data }) => setReports((data as unknown as Report[]) || []));
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-h2 font-semibold text-ink">Term reports</h1>
          <div className="print:hidden flex items-center gap-2">
            <PrintButton />
            <button type="button" onClick={signOut} className="rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
              Sign out
            </button>
          </div>
        </div>
      </div>
      {reports === null ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink/60">No reports released yet.</p>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
            <h2 className="font-serif text-h3 font-semibold text-ink">
              {r.children?.name} — {r.terms?.name}
            </h2>
            {r.overall_comment && <p className="mt-2 text-sm text-ink/80">{r.overall_comment}</p>}
            {Object.entries(r.subject_comments || {}).length > 0 && (
              <ul className="mt-3 space-y-2">
                {Object.entries(r.subject_comments || {}).map(([subject, comment]) => (
                  <li key={subject} className="rounded-lg border border-gold-light/40 p-3 text-sm">
                    <span className="font-medium">{subject}:</span> {comment}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function FamilyReportsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilyReportsContent />
      </LearnGate>
    </section>
  );
}
