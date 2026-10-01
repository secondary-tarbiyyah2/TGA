"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Family / admin opt-out from the merit leaderboard (children.hide_from_leaderboard,
 * 0068). RLS decides who may change it: a parent for their own child, or staff
 * with manage_people_accounts.
 */
export function LeaderboardPrivacy({ kids }: { kids: { id: string; name: string }[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const idKey = kids.map((k) => k.id).join(",");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || kids.length === 0) return;
    let cancelled = false;
    supabase
      .from("children")
      .select("id, hide_from_leaderboard")
      .in(
        "id",
        kids.map((k) => k.id),
      )
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        for (const r of (data as { id: string; hide_from_leaderboard: boolean }[] | null) || []) next[r.id] = r.hide_from_leaderboard;
        setHidden(next);
      });
    return () => {
      cancelled = true;
    };
    // idKey stands in for the kids array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const toggle = async (id: string, value: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(id);
    setError(false);
    const { error: err } = await supabase.from("children").update({ hide_from_leaderboard: value }).eq("id", id);
    if (err) setError(true);
    else setHidden((h) => ({ ...h, [id]: value }));
    setBusy(null);
  };

  if (kids.length === 0) return null;
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-ink/60 hover:text-ink">Leaderboard privacy</summary>
      <div className="mt-2 space-y-1.5">
        {kids.map((k) => (
          <label key={k.id} className="flex items-center gap-2 text-ink/80">
            <input type="checkbox" checked={!!hidden[k.id]} disabled={busy === k.id} onChange={(e) => toggle(k.id, e.target.checked)} />
            Don&apos;t show {k.name} on the merit leaderboard
          </label>
        ))}
        {error && (
          <p role="alert" className="text-xs text-amber-900">
            Couldn&apos;t save that change. Please try again.
          </p>
        )}
      </div>
    </details>
  );
}
