"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/learn/kit";
import { Button, Notice } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";
import { SURAHS, surahAyat, surahAr } from "@/lib/learn/surahs";
import { bandFor, todayISO, type QuranMark } from "@/lib/learn/quranClassroom";
import { MISTAKE_KINDS, adjustScore, levelLabel, markFromMistakes, portionPages, type MarkingLevel, type MarkingStandard, type Mistake, type MistakeKind } from "@/lib/learn/quranMarking";
import { getSupabaseClient } from "@/lib/supabase/client";

const SETTINGS: { value: QuranMark["setting"]; label: string }[] = [
  { value: "class", label: "In class" },
  { value: "homework", label: "Homework" },
  { value: "revision", label: "Revision" },
  { value: "one_to_one", label: "One to one" },
];

/**
 * The panel that opens over a Qur'an class for one pupil (owner, 11 Nov 2026: "the page popping up and
 * mistakes being put on"). Choose what they recite, then tap what happens as they recite: a prompt, a slip
 * or a tajweed mistake, each on the ayah it happened (keys P, S and T do the same). The mark works itself
 * out from the head teacher's strictness bands for the class's level; the teacher may move it one step
 * with a reason. Fits the screen: the page behind never scrolls.
 */
export function RecitationDialog({
  pupil,
  classId,
  level,
  standard,
  last,
  onClose,
  onSaved,
}: {
  pupil: { id: string; name: string };
  classId: string | null;
  level: MarkingLevel;
  standard: MarkingStandard;
  /** Their last recitation, to start from the same surah. */
  last?: QuranMark | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [surah, setSurah] = useState<number>(last?.surah_from || 78);
  const total = surahAyat(surah);
  const [from, setFrom] = useState<number>(last?.ayah_to && last.surah_from === surah ? Math.min(last.ayah_to + 1, total) : 1);
  const [to, setTo] = useState<number>(Math.min(from + 9, total));
  const [setting, setSetting] = useState<QuranMark["setting"]>("class");
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [ayahRaw, setAyahRaw] = useState<number>(from);
  const [noRecite, setNoRecite] = useState(false);
  const [delta, setDelta] = useState<-1 | 0 | 1>(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new surah starts at its first ayah; the ayah being heard always stays inside the range.
  const chooseSurah = (n: number) => {
    const t = surahAyat(n);
    setSurah(n);
    setFrom(1);
    setTo(Math.min(10, t));
    setAyahRaw(1);
  };
  const ayah = Math.min(Math.max(ayahRaw, from), Math.max(from, to));
  const setAyah = (f: (a: number) => number) => setAyahRaw((a) => f(Math.min(Math.max(a, from), Math.max(from, to))));

  const pages = portionPages(surah, from, to);
  const result = useMemo(() => markFromMistakes({ mistakes, level, pages, standard, couldNotRecite: noRecite }), [mistakes, level, pages, standard, noRecite]);
  const score = adjustScore(result.score, delta);
  const band = bandFor(score);
  const ayat = useMemo(() => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i), [from, to]);

  const add = (kind: MistakeKind) => setMistakes((m) => [...m, { kind, ayah }]);
  const undo = () => setMistakes((m) => m.slice(0, -1));

  // Keyboard: P, S, T log a mistake on the current ayah; arrow keys move between ayat; Backspace undoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = MISTAKE_KINDS.find((x) => x.key === e.key.toLowerCase());
      if (k && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        add(k.value);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setAyah((a) => Math.min(a + 1, to));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setAyah((a) => Math.max(a - 1, from));
      } else if (e.key === "Backspace") {
        undo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- add reads the current ayah through state
  }, [ayah, from, to]);

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (delta !== 0 && !reason.trim()) return setError("Say why you moved the mark.");
    setBusy(true);
    setError(null);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { error: e } = await supabase.from("quran_progress").insert({
      child_id: pupil.id,
      class_id: classId,
      milestone_type: "quran_memorisation",
      surah_from: surah,
      surah_to: surah,
      ayah_from: from,
      ayah_to: to,
      score,
      worked_out_score: result.score,
      adjust_reason: delta !== 0 ? reason.trim() : null,
      mistakes,
      marking_level: level,
      pages,
      could_not_recite: noRecite,
      focus: [],
      setting,
      session_date: todayISO(),
      recorded_by: uid,
    });
    setBusy(false);
    if (e) return setError("Couldn't save the recitation. Please try again.");
    onSaved(`Saved ${pupil.name}: ${score} out of 10.`);
    onClose();
  };

  const count = (k: MistakeKind) => mistakes.filter((m) => m.kind === k).length;
  const fieldCls = "w-full";

  return (
    <Dialog
      title={`Hear ${pupil.name}`}
      description={`${levelLabel(level)} standard. About ${pages} page${pages === 1 ? "" : "s"}.`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || ayat.length === 0}>
            {busy ? "Saving…" : `Save ${score} out of 10`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="col-span-2 text-sm sm:col-span-1">
            <span className="t-eyebrow mb-1 block">Surah</span>
            <Select value={String(surah)} onChange={(e) => chooseSurah(Number(e.target.value))} className={fieldCls} aria-label="Surah">
              {SURAHS.map((s, i) => (
                <option key={i} value={i + 1}>
                  {`${i + 1}. ${s[0]} ${s[1]}`}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="t-eyebrow mb-1 block">From ayah</span>
            <input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(total, Number(e.target.value) || 1)))} className="portal-input w-full rounded-[7px] border border-gold-light px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="t-eyebrow mb-1 block">To ayah</span>
            <input type="number" min={from} max={total} value={to} onChange={(e) => setTo(Math.max(from, Math.min(total, Number(e.target.value) || from)))} className="portal-input w-full rounded-[7px] border border-gold-light px-3 py-2" />
          </label>
          <label className="col-span-2 text-sm sm:col-span-1">
            <span className="t-eyebrow mb-1 block">Heard</span>
            <Select value={setting} onChange={(e) => setSetting(e.target.value as QuranMark["setting"])} className={fieldCls} aria-label="Where it was heard">
              {SETTINGS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <section aria-labelledby="rd-ayat">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 id="rd-ayat" className="t-eyebrow">
              Ayah they are on <span lang="ar" dir="rtl" className="ml-1 normal-case">{surahAr(surah)}</span>
            </h3>
            <span className="t-meta">Arrow keys move</span>
          </div>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto" role="group" aria-label="Ayah">
            {ayat.map((a) => {
              const n = mistakes.filter((m) => m.ayah === a).length;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={a === ayah}
                  onClick={() => setAyahRaw(a)}
                  className={`relative h-9 min-w-9 rounded-[7px] border px-2 text-sm tabular-nums ${a === ayah ? "border-forest-700 bg-forest-700 text-white" : n ? "border-amber-400 bg-amber-50 text-amber-900" : "border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
                >
                  {a}
                  {n > 0 && <span className="sr-only">, {n} mistake{n === 1 ? "" : "s"}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="rd-mistakes">
          <h3 id="rd-mistakes" className="t-eyebrow mb-1.5">
            Tap what happens on ayah {ayah}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {MISTAKE_KINDS.map((k) => (
              <button key={k.value} type="button" onClick={() => add(k.value)} disabled={noRecite} title={k.help} className="flex min-h-16 flex-col items-center justify-center rounded-[10px] border border-gold-light bg-white px-2 py-2 text-center hover:border-forest-500 hover:bg-cream disabled:opacity-50">
                <span className="text-sm font-semibold text-ink">
                  {k.label} <span className="tabular-nums text-ink/60">{count(k.value) || ""}</span>
                </span>
                <span lang="ar" dir="rtl" className="text-xs text-ink/60">
                  {k.ar}
                </span>
                <span className="t-meta hidden sm:block">
                  {k.help} Key {k.key.toUpperCase()}.
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button type="button" onClick={undo} disabled={mistakes.length === 0} className="font-medium text-forest-700 hover:underline disabled:text-ink/40 disabled:no-underline">
              Undo last
            </button>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={noRecite} onChange={(e) => setNoRecite(e.target.checked)} className="h-4 w-4 accent-forest-700" />
              Could not recite it
            </label>
            {mistakes.length > 0 && (
              <span className="t-meta">
                {mistakes.length} logged: {mistakes.slice(-6).map((m) => `${MISTAKE_KINDS.find((k) => k.value === m.kind)?.label} on ${m.ayah}`).join(", ")}
                {mistakes.length > 6 ? "…" : ""}
              </span>
            )}
          </div>
        </section>

        <section aria-labelledby="rd-mark" className="rounded-[10px] border border-gold-light bg-cream/50 px-4 py-3" aria-live="polite">
          <h3 id="rd-mark" className="sr-only">
            Mark
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
              <p className="shrink-0 text-3xl font-semibold tabular-nums text-ink">
                {score}
                <span className="text-base font-normal text-ink/60"> / 10</span>
              </p>
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {band?.label} · {band?.result}
                </p>
                <p className="t-meta">
                  {result.points} point{result.points === 1 ? "" : "s"}, {result.perPage} a page. {band?.next}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Move the mark one step">
              <Button size="sm" icon="minus" aria-label="One step lower" aria-pressed={delta === -1} onClick={() => setDelta(delta === -1 ? 0 : -1)}>
                Lower
              </Button>
              <Button size="sm" icon="plus" aria-label="One step higher" aria-pressed={delta === 1} onClick={() => setDelta(delta === 1 ? 0 : 1)}>
                Higher
              </Button>
            </div>
          </div>
          {delta !== 0 && (
            <label className="mt-2 block text-sm">
              <span className="t-eyebrow mb-1 block">Why you moved it (worked out: {result.score})</span>
              <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: nervous, but knew it well" className="portal-input w-full rounded-[7px] border border-gold-light px-3 py-2" />
            </label>
          )}
        </section>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Dialog>
  );
}
