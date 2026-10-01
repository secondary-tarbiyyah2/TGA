"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

// A small, friendly house table. Data comes from house_standings() (0073):
// aggregate points per house only (merits are added automatically, plus any
// bonus points the school awards), never any child's name. Renders nothing
// until the school has set up houses.

export type HouseRow = {
  house_id: string;
  name: string;
  colour: string;
  motto: string | null;
  merit_points: number;
  bonus_points: number;
  total_points: number;
  member_count: number;
  is_mine: boolean;
  rank: number;
};

type Period = "week" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function HouseTable({ title = "House points" }: { title?: string }) {
  const [period, setPeriod] = useState<Period>("week");
  const [rows, setRows] = useState<HouseRow[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("house_standings", { p_days: period === "week" ? 7 : null });
      if (cancelled) return;
      setRows(error ? [] : ((data as HouseRow[] | null) || []));
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Nothing to show before houses exist (or if the table isn't available).
  if (rows !== null && rows.length === 0) return null;

  const max = Math.max(1, ...(rows || []).map((r) => r.total_points));

  return (
    <section aria-labelledby="house-table-heading" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-4 py-3">
        <h2 id="house-table-heading" className="text-sm font-semibold text-ink">
          {title}
        </h2>
        <div role="group" aria-label="Time period" className="flex gap-0.5 rounded-lg bg-cream p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${period === p.id ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4" aria-live="polite">
        {rows === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-cream" />
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <li key={r.house_id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center text-xs font-semibold tabular-nums text-ink/50">
                    <span className="sr-only">Place </span>
                    {r.rank}
                  </span>
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: HEX.test(r.colour) ? r.colour : "#B08E45" }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                  {r.is_mine && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">Your house</span>}
                  <span className="tabular-nums font-semibold text-ink">{r.total_points}</span>
                </div>
                <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-cream">
                  <div className="h-full rounded-full motion-safe:transition-all" style={{ width: `${Math.round((r.total_points / max) * 100)}%`, backgroundColor: HEX.test(r.colour) ? r.colour : "#B08E45" }} />
                </div>
              </li>
            ))}
          </ol>
        )}
        {rows !== null && rows.length > 0 && <p className="mt-3 text-[11px] text-ink/50">Every merit earns points for your house.</p>}
      </div>
    </section>
  );
}
