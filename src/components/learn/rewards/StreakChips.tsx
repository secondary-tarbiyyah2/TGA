"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

// Positive-only streaks for the student dashboard, from child_streaks()
// (0074). A streak that isn't running is simply not shown: no zeros, no
// "broken streak" messages. Only streaks of two or more are worth a mention.

type Streaks = { attendance_days: number; homework_on_time: number };

export function StreakChips({ childId }: { childId: string }) {
  const [streaks, setStreaks] = useState<Streaks | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("child_streaks", { p_child_id: childId });
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as Streaks | null | undefined;
      setStreaks(error || !row ? null : row);
    })();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  if (!streaks) return null;
  const chips: string[] = [];
  if (streaks.attendance_days >= 2) chips.push(`${streaks.attendance_days} days in a row at lessons`);
  if (streaks.homework_on_time >= 2) chips.push(`${streaks.homework_on_time} homeworks in a row handed in on time`);
  if (chips.length === 0) return null;

  return (
    <ul aria-label="Your streaks" className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li key={c} className="rounded-full border border-gold-light bg-gold-100/60 px-3 py-1 text-xs font-medium text-ink">
          <span aria-hidden="true">✦ </span>
          {c}
        </li>
      ))}
    </ul>
  );
}
