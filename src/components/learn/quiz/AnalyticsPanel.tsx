"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Counts = {
  started: number;
  completed: number;
  leads: number;
  pdfSent: number;
  callsBooked: number;
  stepViews: Record<number, number>;
};

/**
 * Counts/funnel only, deliberately not a full BI dashboard (per the
 * brief). Reads quiz_sessions/quiz_events (head_teacher/admin read-all
 * policy, 0016) and quiz_leads. All figures are computed live from real
 * rows, nothing here is a placeholder metric.
 */
export function AnalyticsPanel() {
  const supabase = getSupabaseClient();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ count: started }, { count: completed }, { count: leads }, { data: events }] = await Promise.all([
        supabase.from("quiz_sessions").select("id", { count: "exact", head: true }),
        supabase.from("quiz_sessions").select("id", { count: "exact", head: true }).not("completed_at", "is", null),
        supabase.from("quiz_leads").select("id", { count: "exact", head: true }),
        supabase.from("quiz_events").select("event_type, step_index"),
      ]);

      const stepViews: Record<number, number> = {};
      let pdfSent = 0;
      let callsBooked = 0;
      for (const e of (events as { event_type: string; step_index: number | null }[]) || []) {
        if (e.event_type === "step_viewed" && e.step_index != null) {
          stepViews[e.step_index] = (stepViews[e.step_index] || 0) + 1;
        }
        if (e.event_type === "pdf_email_sent") pdfSent += 1;
        if (e.event_type === "call_booked") callsBooked += 1;
      }

      setCounts({ started: started ?? 0, completed: completed ?? 0, leads: leads ?? 0, pdfSent, callsBooked, stepViews });
    })();
  }, [supabase]);

  if (!supabase) return <p className="text-sm text-ink/65">The /learn area isn&apos;t connected yet.</p>;
  if (!counts) return <p className="text-sm text-ink/65">Loading…</p>;

  const dropOff = Object.entries(counts.stepViews).sort(([a], [b]) => Number(a) - Number(b));
  const completionRate = counts.started > 0 ? Math.round((counts.completed / counts.started) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Quiz starts" value={counts.started} />
        <Stat label="Completed" value={counts.completed} note={`${completionRate}% completion`} />
        <Stat label="Plans emailed / leads" value={counts.leads} />
        <Stat label="Calls booked" value={counts.callsBooked} />
      </div>

      {dropOff.length > 0 && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
          <p className="font-semibold text-ink">Step-by-step drop-off</p>
          <ul className="mt-3 space-y-1 text-sm text-ink/70">
            {dropOff.map(([step, count]) => (
              <li key={step} className="flex items-center justify-between border-b border-gold-light/20 py-1">
                <span>Question {Number(step) + 1}</span>
                <span className="font-medium text-ink">{count} views</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink/65">
        Session data is fully anonymous until a family submits their email with consent (a quiz_leads row) · figures
        here can never be traced back to an identity before that point.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-4">
      <p className="text-xs font-medium text-ink/65">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold text-ink">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink/65">{note}</p>}
    </div>
  );
}
