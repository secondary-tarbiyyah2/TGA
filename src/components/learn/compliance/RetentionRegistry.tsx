"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type ScheduleRow = { id: string; data_type: string; description: string; retention_period: string; action_on_expiry: string; owner_job: string | null; last_run_at: string | null };
type RunRow = { id: number; data_type: string; run_at: string; action: string; rows_affected: number };

/**
 * Read-only view of the retention registry (0015_compliance.sql) — the
 * schedule itself and a log of what each retention job actually did on its
 * last few runs. Writes to retention_schedule stay Head Teacher/Admin-only
 * and aren't exposed here (this is a compliance viewer, not a settings
 * page); retention_job_runs has no client write policy at all (service
 * role only).
 */
export function RetentionRegistry() {
  const supabase = getSupabaseClient();
  const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("retention_schedule").select("id, data_type, description, retention_period, action_on_expiry, owner_job, last_run_at").order("data_type").then(({ data }) => setSchedule((data as ScheduleRow[]) || []));
    supabase.from("retention_job_runs").select("id, data_type, run_at, action, rows_affected").order("run_at", { ascending: false }).limit(20).then(({ data }) => setRuns((data as RunRow[]) || []));
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Retention schedule</h2>
      <p className="mt-1 text-xs text-ink/50">By data type, fed by the school&apos;s actual scheduled jobs — not a duplicated set of numbers.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="pb-2 pr-3">Data type</th>
              <th className="pb-2 pr-3">Retention period</th>
              <th className="pb-2 pr-3">On expiry</th>
              <th className="pb-2 pr-3">Last run</th>
            </tr>
          </thead>
          <tbody>
            {(schedule || []).map((s) => (
              <tr key={s.id} className="border-t border-gold-light/30">
                <td className="py-2 pr-3">{s.data_type}<p className="text-xs text-ink/50">{s.description}</p></td>
                <td className="py-2 pr-3">{s.retention_period}</td>
                <td className="py-2 pr-3 capitalize">{s.action_on_expiry}</td>
                <td className="py-2 pr-3">{s.last_run_at ? new Date(s.last_run_at).toLocaleString("en-GB") : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {schedule?.length === 0 && <p className="mt-2 text-sm text-ink/60">No retention schedule entries.</p>}
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/60">Recent retention job runs</p>
      <ul className="mt-2 space-y-1">
        {(runs || []).map((r) => (
          <li key={r.id} className="text-sm text-ink/70">
            {new Date(r.run_at).toLocaleString("en-GB")} — {r.data_type}: {r.action}d {r.rows_affected} row(s)
          </li>
        ))}
        {runs?.length === 0 && <p className="text-sm text-ink/60">No retention jobs have run yet.</p>}
      </ul>
    </div>
  );
}
