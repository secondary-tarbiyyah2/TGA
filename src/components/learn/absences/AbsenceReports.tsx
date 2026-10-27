"use client";

import { useMemo } from "react";
import { useLearnPermission } from "@/lib/learn/session";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { ukToday } from "@/lib/learn/ukTime";
import { REASONS, reasonLabel, type Absence } from "./data";

/** Reasons breakdown, plus a CSV export for those with can_export_data (RLS stays the real gate). */
export function AbsenceReports({ absences, periodLabel }: { absences: Absence[] | null; periodLabel: string }) {
  const canExport = useLearnPermission("can_export_data");
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (absences || []).filter((a) => {
      const k = `${a.childId}|${a.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [absences]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { none: 0 };
    REASONS.forEach((r) => (c[r.value] = 0));
    rows.forEach((a) => (c[a.reasonCode || "none"] = (c[a.reasonCode || "none"] || 0) + 1));
    return c;
  }, [rows]);

  const exportCsv = () => {
    const header = ["Date", "Student", "Class", "Status", "Reason"];
    const kind = { authorised: "Authorised", unauthorised: "Not authorised", unexplained: "Unexplained" } as const;
    saveCsv(
      `absences-with-reasons-${ukToday()}.csv`,
      toCsv(
        header,
        rows.map((a) => [a.date, a.childName, a.className, kind[a.kind], reasonLabel(a.reasonCode) || "Not recorded"]),
      ),
    );
  };

  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/60 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Reasons for absence</h2>
          <p className="text-xs text-ink/65">{periodLabel}. One count per child and day.</p>
        </div>
        {canExport && (
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
            Export CSV
          </button>
        )}
      </div>
      {absences === null ? (
        <p className="px-4 py-4 text-sm text-ink/65">Loading…</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gold-light/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink/65">Reason</th>
              <th className="border-b border-gold-light/50 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink/65">Days</th>
            </tr>
          </thead>
          <tbody>
            {[...REASONS.map((r) => ({ key: r.value, label: r.label })), { key: "none", label: "No reason recorded" }].map((r) => (
              <tr key={r.key}>
                <td className="border-b border-gold-light/20 px-4 py-2 text-ink">{r.label}</td>
                <td className="border-b border-gold-light/20 px-4 py-2 text-right tabular-nums">{counts[r.key] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!canExport && <p className="border-t border-gold-light/40 px-4 py-3 text-xs text-ink/65">Exporting needs the data export permission.</p>}
    </section>
  );
}
