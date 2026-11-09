"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukToday } from "@/lib/learn/ukTime";

import { Select } from "@/components/ui/Dropdown";
// Celebratory but tasteful: positive merits only, first names + surname
// initial, top few. All data comes from merit_leaderboard() (0068), which
// enforces who may see which scope and the family opt-out.

export type LeaderboardScope = "class" | "year" | "school";
export type LeaderboardChoice = { label: string; scope: LeaderboardScope; scopeId?: string };

type Row = { rank: number; first_name: string; surname_initial: string | null; merits: number; is_mine: boolean };
type Period = "week" | "term" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "term", label: "This term" },
  { id: "all", label: "All time" },
];

const PLACE: Record<number, { medal: string; word: string; height: string; tone: string }> = {
  1: { medal: "1", word: "1st", height: "h-24", tone: "bg-gold-100 border-gold-500" },
  2: { medal: "2", word: "2nd", height: "h-16", tone: "bg-cream border-gold-300" },
  3: { medal: "3", word: "3rd", height: "h-12", tone: "bg-cream border-gold-300" },
};

function nameOf(r: Row): string {
  return r.surname_initial ? `${r.first_name} ${r.surname_initial}.` : r.first_name;
}

/** Days since the current term began (inclusive); null when no term is running. */
async function termDays(): Promise<number | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const today = new Date();
  const key = ukToday(today);
  const { data } = await supabase.from("terms").select("starts_on").lte("starts_on", key).gte("ends_on", key).order("starts_on", { ascending: false }).limit(1).maybeSingle();
  const start = (data as { starts_on?: string } | null)?.starts_on;
  if (!start) return null;
  const startMs = new Date(`${start}T00:00:00`).getTime();
  return Math.max(1, Math.round((today.getTime() - startMs) / 86_400_000) + 1);
}

export function MeritLeaderboard({
  choices,
  mineLabel = "You",
  title = "Merit leaderboard",
  limit = 5,
  footer,
}: {
  choices: LeaderboardChoice[];
  /** Badge text on the signed-in family's own entries, e.g. "You" or "Your child". */
  mineLabel?: string;
  title?: string;
  limit?: number;
  footer?: React.ReactNode;
}) {
  const [choiceIdx, setChoiceIdx] = useState(0);
  const [period, setPeriod] = useState<Period>("week");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  const choiceKey = choices.map((c) => `${c.scope}:${c.scopeId || ""}`).join("|");
  const choice = choices[Math.min(choiceIdx, Math.max(choices.length - 1, 0))];
  const scope = choice?.scope;
  const scopeId = choice?.scopeId;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !scope) return;
    let cancelled = false;
    (async () => {
      setRows(null);
      setError(false);
      let days: number | null = null;
      if (period === "week") days = 7;
      else if (period === "term") days = (await termDays()) ?? 91;
      const { data, error: err } = await supabase.rpc("merit_leaderboard", { p_scope: scope, p_scope_id: scopeId ?? null, p_limit: limit, p_days: days });
      if (cancelled) return;
      if (err) {
        setError(true);
        return setRows([]);
      }
      setRows((data as Row[] | null) || []);
    })();
    return () => {
      cancelled = true;
    };
    // choiceKey stands in for the choices array identity
  }, [scope, scopeId, period, limit, choiceKey]);

  const podium = useMemo(() => (rows || []).filter((r) => r.rank <= 3).slice(0, 3), [rows]);
  const rest = useMemo(() => (rows || []).filter((r) => !podium.includes(r)), [rows, podium]);
  // Visual order 2-1-3 while the DOM (and screen reader) order stays 1-2-3.
  const visualOrder = (i: number) => (i === 0 ? "order-2" : i === 1 ? "order-1" : "order-3");

  const empty = period === "week" ? "No merits this week yet. The first one could be yours." : "No merits recorded for this period yet.";

  return (
    <section aria-labelledby="merit-board-heading" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold-light px-5 py-3.5">
        <h2 id="merit-board-heading" className="text-sm font-semibold text-ink">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {choices.length > 1 && (
            <Select allowEmpty aria-label="Leaderboard group" value={Math.min(choiceIdx, choices.length - 1)} onChange={(e) => setChoiceIdx(Number(e.target.value))} className="rounded-lg border border-gold-light bg-white px-2 py-1 text-xs text-ink">
              {choices.map((c, i) => (
                <option key={`${c.scope}:${c.scopeId || ""}`} value={i}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
          <div role="group" aria-label="Time period" className="flex gap-0.5 rounded-lg bg-cream p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${period === p.id ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5" aria-live="polite">
        {rows === null ? (
          <div className="h-32 animate-pulse rounded-xl bg-cream" />
        ) : error ? (
          <p className="text-sm text-ink/65">The leaderboard isn&apos;t available right now.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink/65">{empty}</p>
        ) : (
          <>
            <ol className="flex items-end justify-center gap-2 sm:gap-4" aria-label="Top three">
              {podium.map((r, i) => {
                const place = PLACE[r.rank] || PLACE[3];
                return (
                  <li key={`${r.first_name}-${r.surname_initial}-${i}`} className={`flex w-28 flex-col items-center text-center sm:w-32 ${visualOrder(i)}`}>
                    <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-full border-2 font-serif text-base font-semibold text-ink ${r.rank === 1 ? "border-gold-500 bg-gold-100" : "border-gold-300 bg-white"}`}>
                      {place.medal}
                    </span>
                    <span className="mt-0.5 max-w-full truncate text-sm font-semibold text-ink">{nameOf(r)}</span>
                    {r.is_mine && <span className="mt-0.5 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">{mineLabel}</span>}
                    <span className={`mt-1.5 flex w-full flex-col items-center justify-start rounded-t-lg border-x border-t pt-1.5 motion-safe:transition-all ${place.height} ${place.tone}`}>
                      <span className="text-lg font-semibold tabular-nums text-ink">{r.merits}</span>
                      <span className="text-[11px] text-ink/65">
                        <span className="sr-only">{place.word} place, </span>merits
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {rest.length > 0 && (
              <ol start={rest[0].rank} className="mt-4 divide-y divide-gold-light/60 rounded-xl border border-gold-light/60" aria-label="Next places">
                {rest.map((r, i) => (
                  <li key={`${r.first_name}-${r.surname_initial}-${i}`} className={`flex items-center gap-3 px-3 py-2 text-sm ${r.is_mine ? "bg-teal-100/40" : ""}`}>
                    <span className="w-6 text-center text-xs font-semibold tabular-nums text-ink/65">
                      <span className="sr-only">Place </span>
                      {r.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{nameOf(r)}</span>
                    {r.is_mine && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">{mineLabel}</span>}
                    <span className="tabular-nums text-ink/70">{r.merits}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        {footer}
      </div>
    </section>
  );
}
