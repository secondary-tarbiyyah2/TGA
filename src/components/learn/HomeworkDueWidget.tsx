"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = { homework_id: string; due_at: string; status: string; homework: { title: string; class_id: string } | null };

/**
 * "Upcoming homework" for a dashboard — reads homework_status (0010, a
 * view that computes on_time/late/missing at read time) scoped to one
 * child, filtered client-side to not-yet-due/late/missing (i.e. anything
 * still relevant to act on, not a full history).
 */
export function HomeworkDueWidget({ childId, title = "Upcoming homework" }: { childId: string; title?: string }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("homework_status")
      .select("homework_id, due_at, status, homework:homework_id(title, class_id)")
      .eq("child_id", childId)
      .order("due_at", { ascending: true })
      .then(({ data }) => setRows(((data as unknown as Row[]) || []).filter((r) => r.status !== "on_time")));
  }, [supabase, childId]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading homework…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No homework due.</p>;

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.homework_id} className="flex items-center justify-between rounded-lg border border-gold-light/40 p-2 text-sm">
            <span>{r.homework?.title || "Homework"}</span>
            <span className="flex items-center gap-2">
              <span className="text-ink/60">{new Date(r.due_at).toLocaleDateString("en-GB")}</span>
              {r.status === "missing" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Missing</span>}
              {r.status === "late" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Late</span>}
              {r.status === "not_yet_due" && <span className="rounded-full bg-gold-light/40 px-2 py-0.5 text-xs text-gold-700">Due</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
