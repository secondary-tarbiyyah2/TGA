"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  ATTENTION_LABEL,
  GCSE_COLUMNS,
  GCSE_HISTORY_COLUMNS,
  GCSE_ROW_TINT,
  GCSE_STATUS_META,
  TREND_META,
  actualTrend,
  attentionReasons,
  attentionScore,
  downloadCsv,
  gcseStatus,
  toCsv,
  trendDirection,
  type GcseHistoryRow,
  type GcseRow,
  type GcseStatus,
  type TrendPoint,
} from "@/lib/learn/gcse";
import { GcseStatusChip, GradeChip } from "@/components/learn/gcse/GcseParts";
import { GcsePupilDrawer, type PupilSubjectRow } from "@/components/learn/gcse/GcsePupilDrawer";
import { Select } from "@/components/learn/Select";

type Row = GcseRow & { children: { name: string } | null; subjects: { name: string } | null; classes: { name: string; year_group: string | null } | null };

const STATUSES: GcseStatus[] = ["behind", "on_track", "ahead", "no_data"];
const SELECT = "rounded-lg border border-gold-light/60 bg-white px-3 py-1.5 text-sm";

const pupilName = (r: Row) => r.children?.name || "Pupil";
const subjectName = (r: Row) => r.subjects?.name || "Subject";

/**
 * Head/admin overview of GCSE progress: a "needs attention" list, status tiles,
 * filters (year group, class, subject, status, name), a pupils x subjects grid
 * or a per-subject summary, CSV export and the pupil drawer.
 */
export function GcseOverview() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [history, setHistory] = useState<GcseHistoryRow[]>([]);
  const [year, setYear] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<"all" | GcseStatus>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "subjects">("grid");
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [drawerChild, setDrawerChild] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: g, error: gErr }, { data: h }] = await Promise.all([
      supabase.from("gcse_grades").select(`${GCSE_COLUMNS}, children(name), subjects(name), classes(name, year_group)`).limit(3000),
      supabase.from("gcse_grade_history").select(GCSE_HISTORY_COLUMNS).order("recorded_at", { ascending: true }).limit(8000),
    ]);
    setLoadError(Boolean(gErr));
    setRows((g as unknown as Row[]) || []);
    setHistory((h as GcseHistoryRow[] | null) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  const trends = useMemo(() => {
    const grouped = new Map<string, GcseHistoryRow[]>();
    for (const h of history) {
      const k = `${h.child_id}|${h.subject_id}`;
      grouped.set(k, [...(grouped.get(k) || []), h]);
    }
    const out = new Map<string, TrendPoint[]>();
    grouped.forEach((v, k) => out.set(k, actualTrend(v)));
    return out;
  }, [history]);
  const trendOf = useCallback((r: Row) => trends.get(`${r.child_id}|${r.subject_id}`) || [], [trends]);

  const years = useMemo(() => [...new Set((rows || []).map((r) => r.classes?.year_group).filter((y): y is string => !!y))].sort(), [rows]);
  const classOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) if (r.class_id && (!year || r.classes?.year_group === year)) m.set(r.class_id, r.classes?.name || "Class");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, year]);
  const subjectOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows || []) m.set(r.subject_id, subjectName(r));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Everything except the status filter, so the tiles can show counts for the current scope.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter(
      (r) => (!year || r.classes?.year_group === year) && (!classId || r.class_id === classId) && (!subjectId || r.subject_id === subjectId) && (!q || pupilName(r).toLowerCase().includes(q))
    );
  }, [rows, year, classId, subjectId, search]);

  const counts = useMemo(() => {
    const m: Record<GcseStatus, number> = { behind: 0, no_data: 0, on_track: 0, ahead: 0 };
    for (const r of scoped) m[gcseStatus(r).status] += 1;
    return m;
  }, [scoped]);

  const shown = useMemo(() => scoped.filter((r) => status === "all" || gcseStatus(r).status === status), [scoped, status]);

  const attention = useMemo(() => {
    return scoped
      .map((r) => {
        const reasons = attentionReasons(r, trendOf(r));
        return { r, reasons, score: attentionScore(reasons, gcseStatus(r).gap) };
      })
      .filter((a) => a.reasons.length > 0 && a.reasons.some((x) => x !== "no_prediction"))
      .sort((a, b) => b.score - a.score || pupilName(a.r).localeCompare(pupilName(b.r)));
  }, [scoped, trendOf]);

  // Grid: one line per pupil, one column per subject.
  const grid = useMemo(() => {
    const subjects = new Map<string, string>();
    const pupils = new Map<string, { name: string; cls: string; cells: Map<string, Row> }>();
    for (const r of shown) {
      subjects.set(r.subject_id, subjectName(r));
      const p = pupils.get(r.child_id) || { name: pupilName(r), cls: r.classes?.name || "", cells: new Map<string, Row>() };
      p.cells.set(r.subject_id, r);
      pupils.set(r.child_id, p);
    }
    return {
      subjects: [...subjects.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      pupils: [...pupils.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)),
    };
  }, [shown]);

  const subjectSummary = useMemo(() => {
    const m = new Map<string, { name: string; n: number; counts: Record<GcseStatus, number>; actual: number[]; predicted: number[] }>();
    for (const r of shown) {
      const e = m.get(r.subject_id) || { name: subjectName(r), n: 0, counts: { behind: 0, no_data: 0, on_track: 0, ahead: 0 } as Record<GcseStatus, number>, actual: [], predicted: [] };
      e.n += 1;
      e.counts[gcseStatus(r).status] += 1;
      if (r.actual_grade !== null) e.actual.push(r.actual_grade);
      if (r.predicted_grade !== null) e.predicted.push(r.predicted_grade);
      m.set(r.subject_id, e);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [shown]);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const exportCsv = () => {
    const out = shown
      .slice()
      .sort((a, b) => pupilName(a).localeCompare(pupilName(b)) || subjectName(a).localeCompare(subjectName(b)))
      .map((r) => {
        const { status: s, gap } = gcseStatus(r);
        return [pupilName(r), r.classes?.year_group || "", r.classes?.name || "", subjectName(r), r.target_grade, r.predicted_grade, r.actual_grade, gap, GCSE_STATUS_META[s].label, TREND_META[trendDirection(trendOf(r))].label, r.comment];
      });
    downloadCsv("gcse-progress.csv", toCsv(["Pupil", "Year group", "Class", "Subject", "Target", "Predicted", "Actual", "Gap", "Status", "Trend", "Comment"], out));
  };

  const drawerRows: PupilSubjectRow[] = drawerChild ? (rows || []).filter((r) => r.child_id === drawerChild).map((r) => ({ ...r, subject_name: subjectName(r) })) : [];
  const drawerName = drawerChild ? (rows || []).find((r) => r.child_id === drawerChild)?.children?.name || "Pupil" : "";

  const clearFilters = () => {
    setYear("");
    setClassId("");
    setSubjectId("");
    setStatus("all");
    setSearch("");
  };
  const filtered = !!(year || classId || subjectId || search || status !== "all");

  if (rows === null) return <p className="text-sm text-ink/65">Loading…</p>;
  if (loadError)
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        GCSE grades couldn&apos;t be loaded.{" "}
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Try again
        </button>
      </p>
    );

  const visibleAttention = showAllAttention ? attention : attention.slice(0, 6);

  return (
    <div className="space-y-6">
      <section aria-labelledby="gcse-attn" className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="gcse-attn" className="font-serif text-h3 font-semibold text-ink">
            Needs attention {attention.length > 0 && <span className="ml-1 text-base font-normal text-ink/65">({attention.length})</span>}
          </h2>
          <span className="text-xs text-ink/65">Behind prediction, predicted below target, or a grade that has just dropped.</span>
        </div>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-ink/70">{scoped.length === 0 ? "No GCSE grades recorded yet." : "Nobody in this selection needs attention right now."}</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-amber-100">
              {visibleAttention.map(({ r, reasons }) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setDrawerChild(r.child_id)} className="text-sm font-medium text-ink underline-offset-2 hover:underline">
                      {pupilName(r)}
                    </button>
                    <span className="ml-2 text-xs text-ink/65">
                      {subjectName(r)}
                      {r.classes?.name ? ` · ${r.classes.name}` : ""}
                    </span>
                    <p className="text-xs text-amber-900">{reasons.map((x) => ATTENTION_LABEL[x]).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <GradeChip grade={r.target_grade} kind="Target" muted />
                    <GradeChip grade={r.predicted_grade} kind="Predicted" muted />
                    <GradeChip grade={r.actual_grade} kind="Actual" />
                    <GcseStatusChip row={r} />
                  </div>
                </li>
              ))}
            </ul>
            {attention.length > 6 && (
              <button type="button" onClick={() => setShowAllAttention((v) => !v)} className="mt-2 text-xs font-medium text-ink/70 underline">
                {showAllAttention ? "Show fewer" : `Show all ${attention.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl border border-gold-light/50 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-h3 font-semibold text-ink">Overview</h2>
          <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Export CSV ({shown.length})
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus((cur) => (cur === s ? "all" : s))}
              className={`rounded-xl border p-3 text-left transition-colors ${status === s ? "border-gold-700 ring-1 ring-gold-700" : "border-gold-light/60 hover:bg-cream/60"}`}
            >
              <span className="block text-2xl font-semibold tabular-nums text-ink">{counts[s]}</span>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${GCSE_STATUS_META[s].className}`}>{GCSE_STATUS_META[s].label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 text-xs font-medium text-ink/70">
          <label>
            Year group
            <Select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setClassId("");
              }}
              className={`${SELECT} mt-1 block`}
            >
              <option value="">All</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Class
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className={`${SELECT} mt-1 block`}>
              <option value="">All</option>
              {classOpts.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Subject
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={`${SELECT} mt-1 block`}>
              <option value="">All</option>
              {subjectOpts.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Pupil
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className={`${SELECT} mt-1 block`} />
          </label>
          {filtered && (
            <button type="button" onClick={clearFilters} className="pb-2 text-xs font-medium text-ink/70 underline">
              Clear filters
            </button>
          )}
          <div role="group" aria-label="View" className="ml-auto flex gap-0.5 rounded-lg bg-cream p-0.5">
            {([
              ["grid", "Pupils × subjects"],
              ["subjects", "By subject"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${view === id ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {shown.length === 0 ? (
            <p className="text-sm text-ink/65">{rows.length === 0 ? "No GCSE grades recorded yet." : "Nothing matches these filters."}</p>
          ) : view === "grid" ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink/65">
                  <th scope="col" className="sticky left-0 bg-white py-1.5 pr-4 font-medium">Pupil</th>
                  {grid.subjects.map(([id, name]) => (
                    <th key={id} scope="col" className="py-1.5 pr-3 font-medium">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/30">
                {grid.pupils.map(([childId, p]) => (
                  <tr key={childId}>
                    <th scope="row" className="sticky left-0 bg-white py-1.5 pr-4 text-left font-medium text-ink">
                      <button type="button" onClick={() => setDrawerChild(childId)} className="text-left underline-offset-2 hover:underline">
                        {p.name}
                      </button>
                      {p.cls && <span className="block text-[11px] font-normal text-ink/65">{p.cls}</span>}
                    </th>
                    {grid.subjects.map(([sid]) => {
                      const r = p.cells.get(sid);
                      if (!r) return <td key={sid} className="py-1.5 pr-3 text-ink/30">–</td>;
                      const s = gcseStatus(r);
                      const dir = TREND_META[trendDirection(trendOf(r))];
                      return (
                        <td key={sid} className="py-1 pr-3">
                          <button
                            type="button"
                            onClick={() => setDrawerChild(childId)}
                            title={`${GCSE_STATUS_META[s.status].label}${s.gap ? ` (${s.gap > 0 ? "+" : ""}${s.gap})` : ""}. Target ${r.target_grade ?? "–"}, predicted ${r.predicted_grade ?? "–"}, actual ${r.actual_grade ?? "–"}.`}
                            className={`flex w-full min-w-[5.5rem] items-center gap-2 rounded-lg border border-gold-light/40 px-2 py-1 text-left ${GCSE_ROW_TINT[s.status] || "bg-white"} ${s.status === "behind" ? "border-amber-300" : ""}`}
                          >
                            <GradeChip grade={r.actual_grade} kind="Actual" />
                            <span className="text-[11px] leading-tight text-ink/65">
                              T{r.target_grade ?? "–"} P{r.predicted_grade ?? "–"}
                            </span>
                            <span className={`text-[10px] ${dir.className}`} aria-hidden="true">
                              {trendDirection(trendOf(r)) === "none" ? "" : dir.symbol}
                            </span>
                            <span className="sr-only">{GCSE_STATUS_META[s.status].label}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink/65">
                  <th className="py-1.5 pr-3 font-medium">Subject</th>
                  <th className="py-1.5 pr-3 font-medium">Pupils</th>
                  <th className="py-1.5 pr-3 font-medium">Avg predicted</th>
                  <th className="py-1.5 pr-3 font-medium">Avg actual</th>
                  <th className="min-w-[10rem] py-1.5 font-medium">Status mix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/30">
                {subjectSummary.map(([id, s]) => {
                  const ap = avg(s.predicted);
                  const aa = avg(s.actual);
                  return (
                    <tr key={id}>
                      <td className="py-2 pr-3 font-medium text-ink">
                        <button
                          type="button"
                          onClick={() => {
                            setSubjectId(id);
                            setView("grid");
                          }}
                          title="Show every pupil in this subject"
                          className="underline-offset-2 hover:underline"
                        >
                          {s.name}
                        </button>
                      </td>
                      <td className="py-2 pr-3">{s.n}</td>
                      <td className="py-2 pr-3">{ap === null ? "–" : ap.toFixed(1)}</td>
                      <td className="py-2 pr-3">{aa === null ? "–" : aa.toFixed(1)}</td>
                      <td className="py-2">
                        <div className="flex h-3 overflow-hidden rounded-full bg-cream" role="img" aria-label={STATUSES.map((st) => `${GCSE_STATUS_META[st].label} ${s.counts[st]}`).join(", ")}>
                          {STATUSES.map((st) =>
                            s.counts[st] > 0 ? <span key={st} style={{ width: `${(s.counts[st] / s.n) * 100}%` }} className={st === "behind" ? "bg-amber-400" : st === "on_track" ? "bg-teal-500" : st === "ahead" ? "bg-green-500" : "bg-ink/15"} /> : null
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-ink/65">
                          {s.counts.behind} behind · {s.counts.on_track} on track · {s.counts.ahead} ahead · {s.counts.no_data} awaiting
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {view === "grid" && shown.length > 0 && <p className="mt-3 text-[11px] text-ink/65">Each cell shows the actual grade, then T = target and P = predicted. Amber means behind. Select a pupil for their history.</p>}
      </section>

      {drawerChild && (
        <GcsePupilDrawer
          childId={drawerChild}
          childName={drawerName}
          rows={drawerRows}
          canEdit
          onClose={() => setDrawerChild(null)}
          onChanged={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
