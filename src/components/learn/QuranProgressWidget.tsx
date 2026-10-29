"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TargetList, useQuranTargets } from "@/components/learn/QuranTargets";
import {
  QURAN_ENTRY_COLUMNS,
  TREND_LABEL,
  computeMilestones,
  summariseScores,
  type QuranEntry,
} from "@/lib/learn/quran";

type Row = QuranEntry;

const STANDARD_LABEL: Record<string, string> = {
  introduced: "Introduced",
  consolidating: "Consolidating",
  secure: "Secure",
  fluent: "Fluent",
};

const STANDARD_DOT: Record<string, string> = {
  introduced: "bg-ink/30",
  consolidating: "bg-gold-500",
  secure: "bg-teal-700",
  fluent: "bg-green-600",
};

const TREND_CLASS = {
  improving: "text-green-700",
  steady: "text-ink/70",
  declining: "text-amber-700",
} as const;

function entryLabel(r: Row): string {
  if (r.milestone_type === "quran_memorisation") {
    if (r.juz) return `Juz ${r.juz}`;
    if (r.surah_from && r.surah_to && r.surah_from !== r.surah_to) return `Surah ${r.surah_from}–${r.surah_to}`;
    if (r.surah_from) return `Surah ${r.surah_from}`;
    return "Qur'an memorisation";
  }
  return r.topic || "Islamic Studies";
}

/**
 * Hifdh/Qur'an memorisation and Islamic Studies progress, read straight from
 * quran_progress (0011, extended in 0072 with the teacher's 0-10 session
 * score) and quran_targets. Shown on the family and student dashboards
 * alongside LatestGradesWidget so Hifdh reads as a first-class subject:
 * average score out of 10 with its trend, progress bars towards the teacher's
 * targets, the milestones reached so far, and the latest sessions.
 */
export function QuranProgressWidget({ childId, limit = 5 }: { childId: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const { targets } = useQuranTargets(childId);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("quran_progress")
      .select(QURAN_ENTRY_COLUMNS)
      .eq("child_id", childId)
      .order("session_date", { ascending: false })
      .order("recorded_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [supabase, childId]);

  const scores = useMemo(() => summariseScores(rows || []), [rows]);
  const milestones = useMemo(() => computeMilestones(rows || [], targets || []), [rows, targets]);
  const achieved = milestones.filter((m) => m.achieved);
  const next = milestones.find((m) => !m.achieved && !m.id.startsWith("target-"));

  if (rows === null) return <p className="text-sm text-ink/65">Loading Qur&apos;an &amp; Islamic Studies progress…</p>;
  if (rows.length === 0 && (targets || []).length === 0)
    return (
      <div>
        <h3 className="text-sm font-medium text-ink">Qur&apos;an &amp; Islamic Studies</h3>
        <p className="mt-2 text-sm text-ink/65">Nothing recorded yet. Marks appear here after a recitation session.</p>
      </div>
    );

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Qur&apos;an &amp; Islamic Studies</h3>

      {scores.sessions > 0 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-cream p-2 text-sm">
          <span>
            <span className="font-serif text-lg font-semibold text-ink">{scores.average}</span>
            <span className="text-ink/65">/10 average</span>
          </span>
          <span className="text-xs text-ink/65">
            {scores.sessions} rated session{scores.sessions === 1 ? "" : "s"}
            {scores.latest !== null ? ` · latest ${scores.latest}/10` : ""}
          </span>
          {scores.trend && <span className={`text-xs font-medium ${TREND_CLASS[scores.trend]}`}>{TREND_LABEL[scores.trend]}</span>}
        </div>
      )}

      {targets && targets.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink/70">Targets</p>
          <div className="mt-1">
            <TargetList targets={targets} entries={rows} />
          </div>
        </div>
      )}

      {(achieved.length > 0 || next) && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink/70">Milestones</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {achieved.map((m) => (
              <li key={m.id} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                {m.label}
              </li>
            ))}
            {next && <li className="rounded-full border border-dashed border-gold-light px-2 py-0.5 text-xs text-ink/65">Next: {next.label}</li>}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.slice(0, limit).map((r) => (
            <li key={r.id} className="rounded-lg border border-gold-light/40 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {entryLabel(r)}
                  {r.score !== null && r.score !== undefined && <span className="ml-2 rounded-full bg-gold-light/40 px-2 py-0.5 text-xs font-semibold text-gold-900">{r.score}/10</span>}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-ink/65">
                  {r.standard && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STANDARD_DOT[r.standard]}`} />}
                  {r.standard ? STANDARD_LABEL[r.standard] : ""} · {new Date(r.session_date || r.recorded_at).toLocaleDateString("en-GB")}
                </span>
              </div>
              {r.note && <p className="mt-1 text-xs text-ink/65">{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
