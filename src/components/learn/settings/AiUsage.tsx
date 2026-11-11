"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { aiCheck, aiErrorMessage, useAiStatus } from "@/lib/learn/aiAssist";
import { useFeature } from "@/lib/learn/features";

type Row = { day: string; task: string; calls: number; input_tokens: number; output_tokens: number };

const TASKS: { key: string; label: string }[] = [
  { key: "report_comment", label: "Report comments" },
  { key: "tarbiyah_note", label: "Tarbiyah Notes" },
  { key: "message_triage", label: "Parent messages" },
];

function ukToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function daysAgo(n: number): string {
  const d = new Date(`${ukToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const fmt = (n: number) => n.toLocaleString("en-GB");

/** "Test the AI connection": one tiny call, the answer in plain words. */
function AiCheck() {
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; text?: string }>({ busy: false });
  async function run() {
    setState({ busy: true });
    const r = await aiCheck();
    setState(r.ok ? { busy: false, ok: true, text: "The AI is working. Draft buttons are ready for staff." } : { busy: false, ok: false, text: aiErrorMessage(r) });
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={state.busy} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-cream disabled:opacity-60">
        {state.busy ? "Testing…" : "Test the AI connection"}
      </button>
      <p role="status" aria-live="polite" className={state.ok === false ? "text-red-800" : "text-ink/75"}>
        {state.text}
      </p>
    </div>
  );
}

/**
 * A small summary of AI helper use (public.ai_usage, 0173) for the
 * Headteacher/Admin: drafts per task today, this week and over 30 days, and
 * tokens used. RLS lets only the Headteacher and Admin read it.
 */
export function AiUsage() {
  const status = useAiStatus();
  const aiOn = useFeature("ai_helpers");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("ai_usage")
      .select("day, task, calls, input_tokens, output_tokens")
      .gte("day", daysAgo(29))
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        setRows((data as Row[]) || []);
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = ukToday();
  const weekFrom = daysAgo(6);
  const sum = (task: string | null, from: string, key: "calls" | "input_tokens" | "output_tokens" = "calls") => (rows || []).filter((r) => (!task || r.task === task) && r.day >= from).reduce((a, r) => a + Number(r[key] || 0), 0);
  const usedToday = sum(null, today);

  return (
    <div className="rounded-2xl border border-gold-light bg-white">
      <div className="space-y-3 px-5 py-5 text-sm">
        {!aiOn && <p className="rounded-lg bg-[var(--portal-sunken)] px-3 py-2 text-ink-700">Switched off under School features. Switch AI helpers on there to bring the AI buttons back.</p>}
        {aiOn && status && !status.configured && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950">AI helpers are not switched on yet. Ask whoever looks after the website to add the AI key (technical note: the ANTHROPIC_API_KEY secret); the AI buttons appear for staff once it is set.</p>}
        {status?.configured && (
          <p className="text-ink/75">
            Today: <span className="font-semibold text-ink">{fmt(usedToday)}</span>
            {status.daily_limit !== undefined ? ` of ${fmt(status.daily_limit)} drafts (the daily limit resets at midnight UK time)` : " drafts"}.
          </p>
        )}
        {status?.configured && <AiCheck />}
        {failed ? (
          <p className="text-ink/65">Couldn&apos;t load usage. Only the Headteacher and Admin can see it.</p>
        ) : rows === null ? (
          <div className="h-20 motion-safe:animate-pulse rounded-lg bg-cream" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs text-ink/65">
                <tr>
                  <th className="py-1 pr-3 font-medium">Helper</th>
                  <th className="py-1 pr-3 text-right font-medium">Today</th>
                  <th className="py-1 pr-3 text-right font-medium">7 days</th>
                  <th className="py-1 pr-3 text-right font-medium">30 days</th>
                  <th className="py-1 text-right font-medium">Text used, in AI tokens (30 days, in / out)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-light/60">
                {TASKS.map((t) => (
                  <tr key={t.key}>
                    <td className="py-1.5 pr-3 text-ink">{t.label}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(sum(t.key, today))}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(sum(t.key, weekFrom))}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(sum(t.key, daysAgo(29)))}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink/70">
                      {fmt(sum(t.key, daysAgo(29), "input_tokens"))} / {fmt(sum(t.key, daysAgo(29), "output_tokens"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
