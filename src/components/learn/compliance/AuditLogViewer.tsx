"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuditRow = {
  id: number;
  created_at: string;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string;
  changed_fields: string[] | null;
  masked: boolean;
  total_count: number | string;
};
type Filters = { actor: string; table: string; action: string; from: string; to: string };
type Facet = { kind: "table" | "action"; value: string };

const PAGE_SIZE = 25;
const EXPORT_CHUNK = 500;
const EXPORT_MAX = 20000;
const EMPTY: Filters = { actor: "", table: "", action: "", from: "", to: "" };

function startOfDayIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function dayAfterIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}
const tableLabel = (t: string | null) => (t ? t.replace(/_/g, " ") : "—");

/**
 * Audit log viewer for the Headteacher and Admin. Reads through the
 * audit_log_search() RPC (0075), which builds each summary on the server:
 * only field NAMES are listed (never values, bar a few harmless status-like
 * fields) and rows about safeguarding, health, messages, admissions and other
 * restricted tables say only that a change happened. The export is built from
 * the same masked output and is itself recorded in the audit log.
 */
export function AuditLogViewer() {
  const supabase = getSupabaseClient();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const args = useCallback(
    (f: Filters, limit: number, offset: number) => ({
      p_actor: f.actor.trim() || null,
      p_table: f.table || null,
      p_action: f.action || null,
      p_from: startOfDayIso(f.from),
      p_to: dayAfterIso(f.to),
      p_limit: limit,
      p_offset: offset,
    }),
    [],
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase.rpc("audit_log_search", args(applied, PAGE_SIZE, page * PAGE_SIZE));
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setError(null);
    const list = (data as AuditRow[] | null) || [];
    setRows(list);
    setTotal(list.length > 0 ? Number(list[0].total_count) : 0);
  }, [supabase, applied, page, args]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter/page change re-fetches, not a render-cycle sync
    load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("audit_log_facets").then(({ data }) => {
      const facets = (data as Facet[] | null) || [];
      setTables(facets.filter((f) => f.kind === "table").map((f) => f.value));
      setActions(facets.filter((f) => f.kind === "action").map((f) => f.value));
    });
  }, [supabase]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setApplied(filters);
  };
  const clearFilters = () => {
    setFilters(EMPTY);
    setApplied(EMPTY);
    setPage(0);
  };

  const exportCsv = async () => {
    if (!supabase) return;
    setExporting(true);
    setError(null);
    const all: AuditRow[] = [];
    for (let offset = 0; offset < EXPORT_MAX; offset += EXPORT_CHUNK) {
      const { data, error: err } = await supabase.rpc("audit_log_search", args(applied, EXPORT_CHUNK, offset));
      if (err) {
        setError(err.message);
        setExporting(false);
        return;
      }
      const chunk = (data as AuditRow[] | null) || [];
      all.push(...chunk);
      if (chunk.length < EXPORT_CHUNK) break;
    }
    const header = ["when", "who", "action", "table", "record_id", "summary"];
    const lines = [header, ...all.map((r) => [r.created_at, r.actor_email || "", r.action, r.target_table || "", r.target_id || "", r.summary])]
      .map((cols) => cols.map(csvCell).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" }));
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    await supabase.rpc("audit_log_record_export", { p_rows: all.length, p_filters: applied });
    setExporting(false);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Audit log</h2>
      <p className="mt-1 text-xs text-ink/65">
        Every change captured by the database, newest first. Summaries show which fields changed, never what they changed to. Anything involving safeguarding, health, messages or admissions shows only that a change happened. Exporting is itself logged.
      </p>

      <form onSubmit={applyFilters} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs text-ink/70 lg:col-span-2">
          Who (email contains)
          <input value={filters.actor} onChange={(e) => setFilters({ ...filters, actor: e.target.value })} placeholder="e.g. head@…" className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-ink/70">
          Table
          <select value={filters.table} onChange={(e) => setFilters({ ...filters, table: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-2 py-1.5 text-sm">
            <option value="">All tables</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {tableLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink/70">
          Action
          <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-2 py-1.5 text-sm">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink/70">
          From
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-ink/70">
          To
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-900">
            Apply filters
          </button>
          <button type="button" onClick={clearFilters} className="rounded-lg border border-gold-light bg-white px-4 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            Clear
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting || total === 0} className="rounded-lg border border-gold-light bg-white px-4 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            {exporting ? "Preparing…" : `Export CSV (${Math.min(total, EXPORT_MAX)} rows)`}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink/65">
              <th className="pb-2 pr-3">When</th>
              <th className="pb-2 pr-3">Who</th>
              <th className="pb-2 pr-3">What happened</th>
              <th className="pb-2 pr-3">Table</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={4} className="py-2 text-sm text-ink/60">
                  Loading…
                </td>
              </tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.id} className="border-t border-gold-light/30 align-top">
                <td className="whitespace-nowrap py-1.5 pr-3">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td className="py-1.5 pr-3">{r.actor_email || "System"}</td>
                <td className="py-1.5 pr-3">
                  <span className="mr-2 rounded bg-cream px-1.5 py-0.5 text-[11px] font-semibold text-ink/70">{r.action}</span>
                  {r.summary}
                  {r.masked && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Restricted</span>}
                </td>
                <td className="py-1.5 pr-3 capitalize">{tableLabel(r.target_table)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && !error && <p className="mt-2 text-sm text-ink/60">No matching audit entries.</p>}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-ink/60">
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 font-medium text-ink/80 hover:bg-cream disabled:opacity-40">
          Previous
        </button>
        <span>
          Page {page + 1} of {pages} ({total} total)
        </span>
        <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 font-medium text-ink/80 hover:bg-cream disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}
