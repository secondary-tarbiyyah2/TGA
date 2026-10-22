"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = { id: string; title: string; date: string; percent: number | null; grade_label: string | null };

/** Latest grades for a dashboard — reads assessments_for_family (0011),
 * which already omits moderation_notes and is scoped to the caller's own
 * child/self via its own definition. */
export function LatestGradesWidget({ childId, limit = 5 }: { childId: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("assessments_for_family")
      .select("id, title, date, percent, grade_label")
      .eq("child_id", childId)
      .order("date", { ascending: false })
      .limit(limit)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [supabase, childId, limit]);

  if (rows === null) return <p className="text-sm text-ink/65">Loading grades…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/65">No grades recorded yet.</p>;

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Latest grades</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-lg border border-gold-light/40 p-2 text-sm">
            <span>{r.title}</span>
            <span className="text-ink/65">
              {r.grade_label || (r.percent !== null ? `${r.percent}%` : "—")} · {new Date(r.date).toLocaleDateString("en-GB")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
