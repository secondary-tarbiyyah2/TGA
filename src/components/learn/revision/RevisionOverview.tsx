"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/learn/Select";
import { ui } from "@/components/learn/ui";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { yearLabel } from "@/lib/learn/curriculum";
import { TONE, band, revisionOverview, type OverviewRow } from "@/lib/learn/revision";

/** Every unit your pupils have revised, newest activity first, linking to each unit's results. */
export function RevisionOverview({ area }: { area: "teach" | "admin" }) {
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    revisionOverview()
      .then(setRows)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't load revision results.");
        setRows([]);
      });
  }, []);

  // Filters and a download (owner feedback 11 Nov 2026, item 19).
  const [year, setYear] = useState("");
  const [subject, setSubject] = useState("");
  const [weakOnly, setWeakOnly] = useState(false);
  const years = useMemo(() => [...new Set((rows || []).map((r) => r.year))].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true })), [rows]);
  const subjects = useMemo(() => [...new Set((rows || []).map((r) => r.subject))].sort(), [rows]);
  const shown = (rows || []).filter((r) => (!year || r.year === year) && (!subject || r.subject === subject) && (!weakOnly || r.under60 > 0));
  const download = () =>
    saveCsv(
      "revision-results.csv",
      toCsv(
        ["Unit", "Year", "Subject", "Pupils", "Average %", "Under 60%", "Weakest topic", "Weakest topic %"],
        shown.map((r) => [r.title, yearLabel(r.year), r.subject, r.takers, r.avg_pct ?? "", r.under60, r.weakest?.topic || "", r.weakest?.pct ?? ""]),
      ),
    );

  const href = (r: OverviewRow) =>
    `/${area}/curriculum?${new URLSearchParams({ year: r.year, subject: r.subject_slug, unit: r.unit, tab: "results" }).toString()}`;

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {rows === null && <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />}
      {rows && rows.length === 0 && !error && (
        <div className="space-y-2 rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">
          <p>No pupils have done any unit revision yet.</p>
          <p>
            Each unit&apos;s revision pack is in the{" "}
            <Link href={`/${area}/curriculum`} className="font-medium text-teal-700 underline">
              Lesson library
            </Link>
            , under the unit&apos;s “Revision pack” tab. Results appear here and on the unit&apos;s “Pupil results” tab.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-guide="revision-filters">
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" className={`${ui.select} w-full sm:w-40`}>
            <option value="">Every year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {yearLabel(y)}
              </option>
            ))}
          </Select>
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className={`${ui.select} w-full sm:w-48`}>
            <option value="">Every subject</option>
            {subjects.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <label className="inline-flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={weakOnly} onChange={(e) => setWeakOnly(e.target.checked)} className="h-4 w-4 accent-forest-700" />
            Only units with pupils under 60%
          </label>
          <span className="t-meta">
            {shown.length} of {rows.length} units
          </span>
          <button type="button" onClick={download} disabled={!shown.length} className={`${ui.btnSecondary} ${ui.sm} sm:ml-auto`}>
            Download CSV
          </button>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div data-guide="revision-overview" className="overflow-x-auto rounded-2xl border border-gold-light bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs text-ink/70">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Unit
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Pupils
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Average
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Under 60%
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Weakest topic
                </th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const b = r.avg_pct === null ? null : band(r.avg_pct);
                return (
                  <tr key={r.unit_id} className="border-t border-gold-light/70">
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-ink">{r.title}</span>
                      <span className="block text-xs text-ink/65">
                        {yearLabel(r.year)} · {r.subject}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.takers}</td>
                    <td className="px-3 py-3">{b ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[b.tone].chip}`}>{r.avg_pct}%</span> : "–"}</td>
                    <td className={`px-3 py-3 tabular-nums ${r.under60 ? "font-semibold text-red-800" : "text-ink/70"}`}>{r.under60}</td>
                    <td className="px-3 py-3 text-ink/80">{r.weakest ? `${r.weakest.topic} (${r.weakest.pct}%)` : "–"}</td>
                    <td className="px-3 py-3 text-right">
                      <Link href={href(r)} className="whitespace-nowrap rounded-md border border-gold-light px-2.5 py-1 text-sm font-medium text-ink/80 hover:bg-cream">
                        See results
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
