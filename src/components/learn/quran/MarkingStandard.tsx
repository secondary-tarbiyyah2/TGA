"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, type ClassSummary } from "@/lib/learn/classes";
import { Button, Notice } from "@/components/learn/ui";
import { Loading } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { BAND_KEYS, BAND_TITLE, DEFAULT_STANDARD, MARKING_LEVELS, MISTAKE_KINDS, defaultLevelForYear, validLimits, type MarkingLevel, type MarkingStandard } from "@/lib/learn/quranMarking";
import { useQuranStandard } from "./QuranClasses";

type Draft = { limits: Record<MarkingLevel, Record<string, string>>; slip: Record<MarkingLevel, string>; tajweed: Record<MarkingLevel, string> };
const toDraft = (s: MarkingStandard): Draft => ({
  limits: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, Object.fromEntries(BAND_KEYS.map((k) => [k, String(s.limits[l.value][k])]))])) as Draft["limits"],
  slip: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, String(s.slip[l.value])])) as Draft["slip"],
  tajweed: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, String(s.tajweed[l.value])])) as Draft["tajweed"],
});
const fromDraft = (d: Draft): MarkingStandard => ({
  limits: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, Object.fromEntries(BAND_KEYS.map((k) => [k, Number(d.limits[l.value][k])]))])) as MarkingStandard["limits"],
  slip: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, Number(d.slip[l.value])])) as MarkingStandard["slip"],
  tajweed: Object.fromEntries(MARKING_LEVELS.map((l) => [l.value, Number(d.tajweed[l.value])])) as MarkingStandard["tajweed"],
});

const cell = "w-20 rounded-[7px] border border-gold-light bg-white px-2 py-1.5 text-sm tabular-nums disabled:bg-cream disabled:text-ink/70";

/**
 * The strictness bands (owner, 11 Nov 2026: "bands of strictness for giving students a number"): for each
 * level, the most mistake points per page each result allows, and what a slip and a tajweed mistake are
 * worth (a prompt is always 1). The head teacher changes them; teachers see them read-only, so everyone
 * knows the rule they mark to. The head teacher also sets the level each Qur'an class marks at.
 */
export function MarkingStandard({ canEdit }: { canEdit: boolean }) {
  const { standard, levels, reload } = useQuranStandard();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [classes, setClasses] = useState<ClassSummary[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the form from the saved standard
    if (standard && !draft) setDraft(toDraft(standard));
  }, [standard, draft]);
  useEffect(() => {
    if (!canEdit) return;
    fetchAllClasses().then((all) => setClasses(all.filter((c) => /qur'?an|quran|qaidah|hifdh|hifz/i.test(`${c.subject || ""} ${c.name}`))));
  }, [canEdit]);

  if (!standard || !draft) return <Loading label="Loading the marking standard" bare />;
  const parsed = fromDraft(draft);
  const badLimits = MARKING_LEVELS.filter((l) => !validLimits(parsed.limits[l.value]));
  const badPoints = MARKING_LEVELS.some((l) => [parsed.slip[l.value], parsed.tajweed[l.value]].some((v) => !Number.isFinite(v) || v < 0 || v > 5));

  const save = async (next: MarkingStandard | null) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("quran_marking_standard").update({ standard: next ?? {} }).eq("singleton", true);
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: "Couldn't save the standard. Please try again." });
    setMsg({ tone: "good", text: next ? "Marking standard saved. Every teacher now marks to it." : "Back to the default standard." });
    if (!next) setDraft(toDraft(DEFAULT_STANDARD));
    reload();
  };

  const setLevel = async (classId: string, level: MarkingLevel) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from("quran_class_settings").upsert({ class_id: classId, marking_level: level }, { onConflict: "class_id" });
    setMsg(error ? { tone: "bad", text: "Couldn't save the class's level." } : { tone: "good", text: "Class level saved." });
    reload();
  };

  return (
    <div className="space-y-6" data-guide="quran-standard">
      <div className="space-y-1.5 text-sm text-ink/80">
        <p>Teachers tap what happens as a pupil recites, and the mark out of 10 is worked out from this standard, so every teacher marks the same way.</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {MISTAKE_KINDS.map((k) => (
            <li key={k.value}>
              <span className="font-medium">{k.label}</span> (<span lang="ar" dir="rtl">{k.ar}</span>): {k.help} {k.value === "prompt" ? "Always 1 point." : "Its points per level are below."}
            </li>
          ))}
          <li>Points are counted per page of the mushaf, so a long portion is not punished for its length. A few ayat count as half a page.</li>
          <li>A teacher can move a mark one step up or down, with a reason the head teacher can see.</li>
        </ul>
      </div>

      <section aria-labelledby="ms-bands">
        <h3 id="ms-bands" className="t-section mb-1">
          Most points per page for each mark
        </h3>
        <p className="t-meta mb-2">More than the last column gives 1 or 2. Each column must allow at least as much as the one before it.</p>
        <div className="overflow-x-auto rounded-[10px] border border-gold-light bg-white">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="t-eyebrow text-left">
                <th className="px-4 py-2 font-medium">Level</th>
                {BAND_KEYS.map((k) => (
                  <th key={k} className="px-2 py-2 font-medium">
                    {BAND_TITLE[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-light/60">
              {MARKING_LEVELS.map((l) => (
                <tr key={l.value}>
                  <td className="px-4 py-2">
                    <span className="block font-medium text-ink">{l.label}</span>
                    <span className="t-meta">{l.help}</span>
                  </td>
                  {BAND_KEYS.map((k) => (
                    <td key={k} className="px-2 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        max="100"
                        disabled={!canEdit || busy}
                        value={draft.limits[l.value][k]}
                        aria-label={`${l.label}: most points per page for ${BAND_TITLE[k]}`}
                        onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [l.value]: { ...draft.limits[l.value], [k]: e.target.value } } })}
                        className={cell}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ms-points">
        <h3 id="ms-points" className="t-section mb-2">
          Points for a slip and a tajweed mistake
        </h3>
        <div className="overflow-x-auto rounded-[10px] border border-gold-light bg-white">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="t-eyebrow text-left">
                <th className="px-4 py-2 font-medium">Each</th>
                {MARKING_LEVELS.map((l) => (
                  <th key={l.value} className="px-2 py-2 font-medium">
                    {l.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gold-light/60">
              {(["slip", "tajweed"] as const).map((row) => (
                <tr key={row}>
                  <td className="px-4 py-2 font-medium text-ink">{row === "slip" ? "Slip" : "Tajweed mistake"}</td>
                  {MARKING_LEVELS.map((l) => (
                    <td key={l.value} className="px-2 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.25"
                        min="0"
                        max="5"
                        disabled={!canEdit || busy}
                        value={draft[row][l.value]}
                        aria-label={`${row === "slip" ? "Slip" : "Tajweed mistake"}, ${l.label}`}
                        onChange={(e) => setDraft({ ...draft, [row]: { ...draft[row], [l.value]: e.target.value } })}
                        className={cell}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {badLimits.length > 0 && <Notice tone="bad">Each number must be from 0 to 100, and each mark must allow at least as much as the one before it.</Notice>}
      {badPoints && <Notice tone="bad">Points for a slip or tajweed mistake must be from 0 to 5.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || badLimits.length > 0 || badPoints} onClick={() => save(parsed)}>
            {busy ? "Saving…" : "Save standard"}
          </Button>
          <Button disabled={busy} onClick={() => save(null)}>
            Use the default
          </Button>
        </div>
      ) : (
        <p className="t-meta">Only the head teacher can change the standard.</p>
      )}

      {canEdit && (
        <section aria-labelledby="ms-classes">
          <h3 id="ms-classes" className="t-section mb-1">
            Level of each Qur&apos;an class
          </h3>
          <p className="t-meta mb-2">Without a level, Reception to Year 2 mark as Beginner, Years 3 to 6 as Junior and Year 7 up as Senior.</p>
          {classes.length === 0 ? (
            <p className="text-sm text-ink/70">No Qur&apos;an classes yet. Add one for each year group in Academic setup, with the subject Qur&apos;an.</p>
          ) : (
            <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white">
              {classes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="font-medium text-ink">{c.name}</span>
                  <Select value={levels[c.id] || defaultLevelForYear(c.yearGroup)} onChange={(e) => setLevel(c.id, e.target.value as MarkingLevel)} aria-label={`Level for ${c.name}`} className="w-40">
                    {MARKING_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
