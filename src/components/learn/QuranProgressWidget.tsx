"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  milestone_type: "quran_memorisation" | "islamic_studies";
  surah_from: number | null;
  surah_to: number | null;
  juz: number | null;
  topic: string | null;
  standard: "introduced" | "consolidating" | "secure" | "fluent" | null;
  note: string | null;
  recorded_at: string;
};

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
 * Hifz/Qur'an memorisation and Islamic Studies progress, read straight from
 * quran_progress (0011) — same RLS-scoped table QuranProgressForm writes
 * to on the teach/assessment page. Sits alongside LatestGradesWidget on
 * the family/student dashboards so Hifz reads as a first-class subject on
 * the same dashboard as academic grades, not a separate, easy-to-miss
 * screen — directly answering the "Hifz as a first-class subject"
 * differentiator (d2 in src/content/seed.ts), which previously had
 * nothing behind it on the family/student side despite the data model
 * already existing.
 */
export function QuranProgressWidget({ childId, limit = 5 }: { childId: string; limit?: number }) {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    supabase
      .from("quran_progress")
      .select("id, milestone_type, surah_from, surah_to, juz, topic, standard, note, recorded_at")
      .eq("child_id", childId)
      .order("recorded_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => setRows((data as Row[]) || []));
  }, [supabase, childId, limit]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading Qur&apos;an &amp; Islamic Studies progress…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No progress recorded yet.</p>;

  return (
    <div>
      <h3 className="text-sm font-medium text-ink">Qur&apos;an &amp; Islamic Studies</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-gold-light/40 p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{entryLabel(r)}</span>
              <span className="flex items-center gap-1.5 text-xs text-ink/60">
                {r.standard && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STANDARD_DOT[r.standard]}`} />}
                {r.standard ? STANDARD_LABEL[r.standard] : ""} · {new Date(r.recorded_at).toLocaleDateString("en-GB")}
              </span>
            </div>
            {r.note && <p className="mt-1 text-xs text-ink/60">{r.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
