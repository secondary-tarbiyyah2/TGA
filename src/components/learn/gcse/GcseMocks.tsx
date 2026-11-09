"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { GCSE_HISTORY_COLUMNS, downloadCsv, toCsv, type GcseHistoryRow } from "@/lib/learn/gcse";
import { GradeChip } from "@/components/learn/gcse/GcseParts";

import { Select } from "@/components/ui/Dropdown";
type MockRow = GcseHistoryRow & { children: { name: string } | null; subjects: { name: string } | null; classes: { name: string } | null };

const SELECT = "rounded-lg border border-gold-light/60 bg-white px-3 py-1.5 text-sm";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const ukIso = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * Every mock exam result in one table (newest first): filter by subject, paper
 * or pupil, see the average per paper, export to CSV. Results are added from a
 * pupil's drawer (Overview tab: select a pupil), where the grade boundaries live.
 */
export function GcseMocks() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<MockRow[] | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [paper, setPaper] = useState("");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("gcse_grade_history")
      .select(`${GCSE_HISTORY_COLUMNS}, children(name), subjects(name), classes(name)`)
      .eq("kind", "mock")
      .order("recorded_at", { ascending: false })
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadError(Boolean(error));
        setRows(error ? [] : ((data as unknown as MockRow[] | null) || []));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) m.set(r.subject_id, r.subjects?.name || "Subject");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const papers = useMemo(() => [...new Set((rows || []).map((r) => r.label || "Mock exam"))].sort(), [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter((r) => (!subjectId || r.subject_id === subjectId) && (!paper || (r.label || "Mock exam") === paper) && (!q || (r.children?.name || "").toLowerCase().includes(q)));
  }, [rows, subjectId, paper, search]);

  const summary = useMemo(() => {
    // pct is summed over `marked` rows only, so a result without a mark doesn't drag the average down.
    const m = new Map<string, { subject: string; paper: string; n: number; pct: number; marked: number; grade: number; graded: number }>();
    for (const r of shown) {
      const k = `${r.subject_id}|${r.label || "Mock exam"}`;
      const e = m.get(k) || { subject: r.subjects?.name || "Subject", paper: r.label || "Mock exam", n: 0, pct: 0, marked: 0, grade: 0, graded: 0 };
      e.n += 1;
      if (r.mark !== null && r.out_of) {
        e.pct += (r.mark / r.out_of) * 100;
        e.marked += 1;
      }
      if (r.actual_grade !== null) {
        e.grade += r.actual_grade;
        e.graded += 1;
      }
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.paper.localeCompare(b.paper));
  }, [shown]);

  const exportCsv = () =>
    downloadCsv(
      "gcse-mock-results.csv",
      toCsv(
        ["Pupil", "Class", "Subject", "Paper", "Date", "Mark", "Out of", "Percent", "Grade"],
        shown.map((r) => [r.children?.name, r.classes?.name, r.subjects?.name, r.label || "Mock exam", ukIso(r.recorded_at), r.mark, r.out_of, r.mark !== null && r.out_of ? Math.round((r.mark / r.out_of) * 1000) / 10 : null, r.actual_grade])
      )
    );

  if (rows === null) return <p className="text-sm text-ink/65">Loading…</p>;
  if (loadError) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">Mock exam results couldn&apos;t be loaded. Refresh the page to try again.</p>;

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6" aria-labelledby="gcse-mocks-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="gcse-mocks-h" className="font-serif text-h3 font-semibold text-ink">
          Mock exams
        </h2>
        <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
          Export CSV ({shown.length})
        </button>
      </div>
      <p className="mt-1 text-sm text-ink/65">To add a result, open a pupil from the Overview tab and use &ldquo;Add a mock exam result&rdquo; (paper, date sat, mark and optional grade boundaries).</p>

      <div className="mt-3 flex flex-wrap items-end gap-3 text-xs font-medium text-ink/70">
        <label>
          Subject
          <Select allowEmpty value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={`${SELECT} mt-1 block`}>
            <option value="">All</option>
            {subjects.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Paper
          <Select allowEmpty value={paper} onChange={(e) => setPaper(e.target.value)} className={`${SELECT} mt-1 block`}>
            <option value="">All</option>
            {papers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Pupil
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className={`${SELECT} mt-1 block`} />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-ink/65">{rows.length === 0 ? "No mock exam results recorded yet." : "Nothing matches these filters."}</p>
      ) : (
        <>
          {summary.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Averages per paper">
              {summary.map((s) => (
                <li key={`${s.subject}|${s.paper}`} className="rounded-lg border border-gold-light/60 bg-cream/40 px-3 py-1.5">
                  <span className="font-medium text-ink">
                    {s.subject} · {s.paper}
                  </span>
                  <span className="ml-2 text-ink/65">
                    {s.n} {s.n === 1 ? "pupil" : "pupils"}
                    {s.marked > 0 ? ` · avg ${(s.pct / s.marked).toFixed(0)}%` : ""}
                    {s.graded > 0 ? ` · avg grade ${(s.grade / s.graded).toFixed(1)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink/65">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Pupil</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Subject</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Paper</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Mark</th>
                  <th scope="col" className="py-1.5 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/30">
                {shown.slice(0, 400).map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 font-medium text-ink">{r.children?.name || "Pupil"}</td>
                    <td className="py-1.5 pr-3">{r.subjects?.name || "Subject"}</td>
                    <td className="py-1.5 pr-3">{r.label || "Mock exam"}</td>
                    <td className="py-1.5 pr-3 text-ink/70">{fmtDate(r.recorded_at)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.mark !== null && r.out_of !== null ? `${r.mark}/${r.out_of}` : "–"}</td>
                    <td className="py-1.5">
                      <GradeChip grade={r.actual_grade} kind="Grade" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 400 && <p className="mt-2 text-xs text-ink/65">Showing the newest 400 of {shown.length}. Use the filters or export for everything.</p>}
          </div>
        </>
      )}
    </section>
  );
}
