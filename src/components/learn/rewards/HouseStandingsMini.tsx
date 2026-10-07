"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { HouseRow } from "@/components/learn/rewards/HouseTable";

// A compact live ranking that sits next to the bonus-points form. It reads
// house_standings() again whenever `refreshKey` changes (after an award or a
// void) and shows how each house has moved since the page opened: points
// gained and places climbed or lost. Plain CSS bars, no chart library.

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function HouseStandingsMini({ refreshKey, highlightHouseId }: { refreshKey: number; highlightHouseId?: string }) {
  const [rows, setRows] = useState<HouseRow[] | null>(null);
  const baseline = useRef<Map<string, { total: number; rank: number }> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("house_standings", { p_days: null });
      if (cancelled) return;
      const list = error ? [] : ((data as HouseRow[] | null) || []);
      if (baseline.current === null) baseline.current = new Map(list.map((r) => [r.house_id, { total: r.total_points, rank: r.rank }] as const));
      setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (rows !== null && rows.length === 0) return null;
  const max = Math.max(1, ...(rows || []).map((r) => r.total_points));

  return (
    <aside aria-label="Live house standings" className="rounded-xl border border-gold-light/60 bg-cream/40 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/55">Live standings</h3>
        <span className="text-[10px] text-ink/45">all time</span>
      </div>
      {rows === null ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-white/70" />
      ) : (
        <ol className="mt-2 space-y-2.5" aria-live="polite">
          {rows.map((r) => {
            const b = baseline.current?.get(r.house_id);
            const gained = b ? r.total_points - b.total : 0;
            const moved = b ? b.rank - r.rank : 0;
            const colour = HEX.test(r.colour) ? r.colour : "#B08E45";
            return (
              <li key={r.house_id} className={highlightHouseId === r.house_id ? "rounded-md bg-white/70 px-1 py-0.5" : ""}>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-4 text-center font-semibold tabular-nums text-ink/50">{r.rank}</span>
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.name}</span>
                  {moved !== 0 && (
                    <span className={`text-[10px] font-semibold ${moved > 0 ? "text-green-700" : "text-red-700"}`}>
                      {moved > 0 ? "▲" : "▼"}
                      {Math.abs(moved)}
                      <span className="sr-only"> {moved > 0 ? "places up" : "places down"}</span>
                    </span>
                  )}
                  {gained > 0 && <span className="rounded-full bg-green-100 px-1.5 text-[10px] font-semibold text-green-800">+{gained}</span>}
                  <span className="w-9 text-right font-semibold tabular-nums text-ink">{r.total_points}</span>
                </div>
                <div className="ml-5 mt-1 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full motion-safe:transition-all motion-safe:duration-700" style={{ width: `${Math.round((r.total_points / max) * 100)}%`, backgroundColor: colour }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
