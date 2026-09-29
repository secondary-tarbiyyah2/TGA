"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";

type AuditRow = { id: number; actor_email: string | null; action: string; target_table: string; target_id: string | null; created_at: string };
const PAGE_SIZE = 25;

/**
 * A genuine filterable, paginated viewer over audit_log — restricted to
 * /learn Head Teacher/Admin at the RLS level (0015's additive policy),
 * broader than the safeguarding log since audit entries span every phase,
 * narrower than every other compliance permission holder. Export (CSV) is
 * gated behind can_export_data, matching the pattern already established
 * for document-signature exports (src/app/learn/admin/documents/page.tsx).
 */
export function AuditLogViewer() {
  const supabase = getSupabaseClient();
  const canExport = useLearnPermission("can_export_data");
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);

  const load = async () => {
    if (!supabase) return;
    let query = supabase.from("audit_log").select("id, actor_email, action, target_table, target_id, created_at", { count: "exact" });
    if (actor.trim()) query = query.ilike("actor_email", `%${actor.trim()}%`);
    if (action.trim()) query = query.ilike("action", `%${action.trim()}%`);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const { data, count: c } = await query.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setRows((data as AuditRow[]) || []);
    setCount(c || 0);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter/page change re-fetches, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, page]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    load();
  };

  const exportCsv = async () => {
    if (!supabase) return;
    let query = supabase.from("audit_log").select("actor_email, action, target_table, target_id, created_at");
    if (actor.trim()) query = query.ilike("actor_email", `%${actor.trim()}%`);
    if (action.trim()) query = query.ilike("action", `%${action.trim()}%`);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const { data } = await query.order("created_at", { ascending: false }).limit(10000);
    const csv = ["actor_email,action,target_table,target_id,created_at", ...(data || []).map((r) => `"${r.actor_email || ""}","${r.action}","${r.target_table}","${r.target_id || ""}","${r.created_at}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit-log.csv";
    a.click();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Audit log</h2>
      <p className="mt-1 text-xs text-ink/50">Every insert/update/delete captured by trigger, across every phase of the app.</p>

      <form onSubmit={applyFilters} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Actor email contains…" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action contains…" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
        <button type="submit" className="rounded-full border border-gold-500 px-4 py-1.5 text-xs text-gold-700 hover:bg-cream sm:col-span-1">Filter</button>
        {canExport && (
          <button type="button" onClick={exportCsv} className="rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:brightness-95 sm:col-span-1">
            Export CSV
          </button>
        )}
      </form>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="pb-2 pr-3">When</th>
              <th className="pb-2 pr-3">Actor</th>
              <th className="pb-2 pr-3">Action</th>
              <th className="pb-2 pr-3">Target</th>
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
              <tr key={r.id} className="border-t border-gold-light/30">
                <td className="py-1.5 pr-3">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td className="py-1.5 pr-3">{r.actor_email || "—"}</td>
                <td className="py-1.5 pr-3">{r.action}</td>
                <td className="py-1.5 pr-3">{r.target_table}{r.target_id ? ` #${r.target_id}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && <p className="mt-2 text-sm text-ink/60">No matching audit entries.</p>}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-ink/60">
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full border border-gold-light/60 px-3 py-1 disabled:opacity-40">Previous</button>
        <span>Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE_SIZE))} ({count} total)</span>
        <button type="button" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-gold-light/60 px-3 py-1 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
