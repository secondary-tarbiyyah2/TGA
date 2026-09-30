"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = { id: string; week_of: string; note: string };

/**
 * Read-only display of the form tutor's most recent Weekly Tarbiyah
 * Notes for a child, across any of their classes — the family/student
 * side of WeeklyTarbiyahNoteForm. RLS (weekly_tarbiyah_notes, 0023)
 * scopes this to the caller's own child/self.
 */
export function WeeklyTarbiyahNoteWidget({ childId, limit = 3 }: { childId: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("weekly_tarbiyah_notes")
      .select("id, week_of, note")
      .eq("child_id", childId)
      .order("week_of", { ascending: false })
      .limit(limit)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [supabase, childId, limit]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gold-light/30 pt-4">
      <h3 className="text-sm font-medium text-ink">Weekly Tarbiyah Note</h3>
      <p className="mt-1 text-xs text-ink/50">A personal note from the form tutor on character and akhlaq — separate from academic grades.</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
            <p className="text-xs font-medium text-ink/60">Week of {new Date(r.week_of).toLocaleDateString("en-GB")}</p>
            <p className="mt-1 text-ink/80">{r.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
