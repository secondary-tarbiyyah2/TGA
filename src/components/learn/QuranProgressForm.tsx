"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { QuranTargetsPanel } from "@/components/learn/QuranTargets";
import { localDateISO, summariseScores, TREND_LABEL, type QuranEntry } from "@/lib/learn/quran";

type Entry = QuranEntry;

const STANDARDS = ["introduced", "consolidating", "secure", "fluent"] as const;

/**
 * Only rendered for someone holding the `assessment_lead` add-on
 * permission (checked by the caller via useLearnPermission — see
 * 0011_assessment.sql's RLS, which is the real enforcement point; this
 * form simply can't submit anything that policy would reject anyway).
 * Two entry shapes, matching quran_progress' own CHECK constraint:
 * Qur'an memorisation (surah/juz range) or Islamic Studies (topic).
 */
export function QuranProgressForm({ childId, classId }: { childId: string; classId: string | null }) {
  const supabase = getSupabaseClient();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [type, setType] = useState<"quran_memorisation" | "islamic_studies">("quran_memorisation");
  const [surahFrom, setSurahFrom] = useState("");
  const [surahTo, setSurahTo] = useState("");
  const [juz, setJuz] = useState("");
  const [topic, setTopic] = useState("");
  const [standard, setStandard] = useState<(typeof STANDARDS)[number]>("consolidating");
  const [note, setNote] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [pages, setPages] = useState("");
  const [sessionDate, setSessionDate] = useState(localDateISO());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase || !childId) return;
    const { data } = await supabase
      .from("quran_progress")
      .select("*")
      .eq("child_id", childId)
      .order("session_date", { ascending: false })
      .order("recorded_at", { ascending: false });
    setEntries((data as Entry[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, childId]);

  const save = async () => {
    if (!supabase || !childId) return;
    setError(null);
    if (pages !== "" && (!Number.isInteger(Number(pages)) || Number(pages) < 0 || Number(pages) > 604)) {
      setError("Pages must be a whole number between 0 and 604.");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        child_id: childId,
        class_id: classId,
        milestone_type: type,
        surah_from: type === "quran_memorisation" && surahFrom ? Number(surahFrom) : null,
        surah_to: type === "quran_memorisation" && surahTo ? Number(surahTo) : null,
        juz: type === "quran_memorisation" && juz ? Number(juz) : null,
        topic: type === "islamic_studies" ? topic.trim() || null : null,
        standard,
        note: note.trim() || null,
        score,
        pages: type === "quran_memorisation" && pages !== "" ? Number(pages) : null,
        session_date: sessionDate || localDateISO(),
        recorded_by: user.id,
      };
      const { error: insertError } = await supabase.from("quran_progress").insert(payload);
      if (insertError) {
        setError(insertError.message);
      } else {
        setSurahFrom("");
        setSurahTo("");
        setJuz("");
        setTopic("");
        setNote("");
        setScore(null);
        setPages("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Qur&apos;an / Islamic Studies progress</h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setType("quran_memorisation")}
          className={`rounded-full px-3 py-1 text-xs ${type === "quran_memorisation" ? "bg-gold-700 text-white" : "border border-gold-500 text-gold-700"}`}
        >
          Qur&apos;an memorisation
        </button>
        <button
          type="button"
          onClick={() => setType("islamic_studies")}
          className={`rounded-full px-3 py-1 text-xs ${type === "islamic_studies" ? "bg-gold-700 text-white" : "border border-gold-500 text-gold-700"}`}
        >
          Islamic Studies
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {type === "quran_memorisation" ? (
          <>
            <input type="number" min={1} max={114} value={surahFrom} onChange={(e) => setSurahFrom(e.target.value)} placeholder="Surah from (1-114)" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="number" min={1} max={114} value={surahTo} onChange={(e) => setSurahTo(e.target.value)} placeholder="Surah to (1-114)" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="number" min={1} max={30} value={juz} onChange={(e) => setJuz(e.target.value)} placeholder="Juz (optional, 1-30)" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          </>
        ) : (
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic / unit" className="rounded-md border border-gold-light/60 px-3 py-2 text-sm sm:col-span-2" />
        )}
        <select value={standard} onChange={(e) => setStandard(e.target.value as (typeof STANDARDS)[number])} className="rounded-md border border-gold-light/60 px-3 py-2 text-sm">
          {STANDARDS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink/70" htmlFor="quran-session-date">
            Session date
          </label>
          <input id="quran-session-date" type="date" value={sessionDate} max={localDateISO()} onChange={(e) => setSessionDate(e.target.value)} className="mt-1 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        </div>
        {type === "quran_memorisation" && (
          <div>
            <label className="block text-xs font-medium text-ink/70" htmlFor="quran-pages">
              Pages covered (optional)
            </label>
            <input id="quran-pages" type="number" min={0} max={604} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 2" className="mt-1 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
          </div>
        )}
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-ink/70">Session score out of 10 (recitation, tajweed and memorisation quality)</legend>
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Score out of 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              onClick={() => setScore(score === n ? null : n)}
              className={`h-9 w-9 rounded-lg border text-sm font-medium ${score === n ? "border-gold-700 bg-gold-700 text-white" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
            >
              {n}
            </button>
          ))}
        </div>
        {score === null && <p className="mt-1 text-xs text-ink/50">Choose a score, or leave it blank if this entry isn&apos;t a rated session.</p>}
      </fieldset>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. tajweed points to revisit)" rows={2} className="mt-3 w-full rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-3 rounded-lg bg-gold-700 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-gold-900 font-medium transition-colors">
        Record progress
      </button>

      <div className="mt-6 border-t border-gold-light/30 pt-4">
        <h3 className="text-sm font-medium text-ink">History</h3>
        {(() => {
          const sum = summariseScores(entries || []);
          return sum.sessions > 0 ? (
            <p className="mt-1 text-xs text-ink/60">
              Average {sum.average}/10 over {sum.sessions} rated session{sum.sessions === 1 ? "" : "s"}
              {sum.trend ? ` · ${TREND_LABEL[sum.trend].toLowerCase()}` : ""}
            </p>
          ) : null;
        })()}
        <ul className="mt-2 space-y-2">
          {(entries || []).map((e) => (
            <li key={e.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  {e.milestone_type === "quran_memorisation"
                    ? `Surah ${e.surah_from}${e.surah_to && e.surah_to !== e.surah_from ? `–${e.surah_to}` : ""}${e.juz ? ` (Juz ${e.juz})` : ""}`
                    : e.topic}
                </span>
                <span className="text-ink/60">
                  {e.score !== null && e.score !== undefined ? `${e.score}/10 · ` : ""}
                  {e.pages ? `${e.pages} pg · ` : ""}
                  {e.standard} · {new Date(e.session_date || e.recorded_at).toLocaleDateString("en-GB")}
                </span>
              </div>
              {e.note && <p className="mt-1 text-xs text-ink/50">{e.note}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 border-t border-gold-light/30 pt-4">
        <QuranTargetsPanel childId={childId} classId={classId} entries={entries || []} canEdit />
      </div>
    </div>
  );
}
