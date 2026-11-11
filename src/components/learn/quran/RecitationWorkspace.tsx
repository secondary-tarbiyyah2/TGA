"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FocusView } from "@/components/learn/FocusView";
import { Button, Notice, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";
import { DatePicker } from "@/components/learn/DatePicker";
import { askConfirm } from "@/components/learn/kit";
import { SURAHS, surahAyat, surahAr } from "@/lib/learn/surahs";
import { bandFor, type QuranMark } from "@/lib/learn/quranClassroom";
import { MARKING_LEVELS, MIN_PAGES, MISTAKE_KINDS, adjustScore, readMistakes, levelLabel, markFromMistakes, type MarkingLevel, type MarkingStandard, type Mistake, type MistakeKind } from "@/lib/learn/quranMarking";
import { PAGE_COUNT, ayatOfPages, ayatOfPortion, loadAyat, pageOf, pagesForAyat, type MushafAyah } from "@/lib/learn/mushaf";
import { ukToday } from "@/lib/learn/ukTime";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Hearing one pupil recite, inside their Qur'an class (owner, 11 Nov 2026 13:47: "include this quran system
 * as part of classroom but better"). A full-screen workspace in three steps down the page, TGA's own
 * structure (not Ihsan LMS's dialog and page overlay):
 *
 *  1. What they recite: Memorisation, Revision or Reading; one or more portions, each a surah with an ayah
 *     range or a range of mushaf pages; the date (the class's latest lesson, any other date asks why).
 *  2. The text of exactly that portion, from the digital mushaf. Choose a pen and tap a word (Prompt, Slip
 *     or Tajweed), the gap between two words (tajweed across the join), or an ayah's number (not reached:
 *     left out of the pages the mark is judged on).
 *  3. The mark, worked out live from the head teacher's strictness bands for the level (the class's level
 *     unless changed here), with one step up or down for a reason.
 */

export type RecitationKind = "memorisation" | "revision" | "reading";
export const RECITATION_KINDS: ReadonlyArray<{ value: RecitationKind; label: string; ar: string; help: string }> = [
  { value: "memorisation", label: "Memorisation", ar: "حفظ", help: "New ayat, from memory." },
  { value: "revision", label: "Revision", ar: "مراجعة", help: "Ayat they already know, from memory." },
  { value: "reading", label: "Reading", ar: "تلاوة", help: "Read from the mushaf." },
];

type Portion = { id: number; mode: "ayat" | "pages"; surah: number; from: number; to: number; pageFrom: number; pageTo: number };
type Pen = MistakeKind;

const PEN_STYLE: Record<Pen, string> = {
  prompt: "border-red-600 bg-red-50 text-red-800",
  slip: "border-amber-600 bg-amber-50 text-amber-900",
  tajweed: "border-sky-600 bg-sky-50 text-sky-800",
};

const keyOf = (s: number, a: number) => `${s}:${a}`;
const portionAyat = (p: Portion): [number, number][] => (p.mode === "pages" ? ayatOfPages(p.pageFrom, p.pageTo) : ayatOfPortion(p.surah, p.from, p.to));
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** The class's most recent lesson day up to today, from its published timetable; today if it has none. */
export async function latestLessonDay(classId: string | null): Promise<string> {
  const today = ukToday();
  const supabase = getSupabaseClient();
  if (!supabase || !classId) return today;
  const { data: slots } = await supabase.from("timetable_slots").select("id").eq("class_id", classId);
  const ids = ((slots as { id: string }[] | null) || []).map((s) => s.id);
  if (!ids.length) return today;
  const { data } = await supabase.from("lesson_instances").select("date").in("timetable_slot_id", ids).lte("date", today).order("date", { ascending: false }).limit(1);
  return ((data as { date: string }[] | null) || [])[0]?.date || today;
}

let nextId = 1;
function startPortion(last?: QuranMark | null): Portion {
  const surah = last?.surah_from || 78;
  const total = surahAyat(surah);
  const from = last?.ayah_to && last.ayah_to < total ? last.ayah_to + 1 : 1;
  const page = pageOf(surah, from);
  return { id: nextId++, mode: "ayat", surah, from, to: Math.min(from + 9, total), pageFrom: page, pageTo: page };
}

export function RecitationWorkspace({
  pupil,
  classId,
  className,
  level: classLevel,
  standard,
  last,
  lastOfKind,
  onClose,
  onSaved,
}: {
  pupil: { id: string; name: string };
  classId: string | null;
  className?: string;
  level: MarkingLevel;
  standard: MarkingStandard;
  last?: QuranMark | null;
  /** The pupil's last recitation of a kind, so memorisation carries on from the last memorisation and
   *  revision from the last revision (not from whatever was heard last). */
  lastOfKind?: (kind: RecitationKind) => QuranMark | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [kind, setKindState] = useState<RecitationKind>("memorisation");
  const [portions, setPortionsState] = useState<Portion[]>(() => [startPortion(lastOfKind?.("memorisation") ?? last)]);
  // Until the teacher changes the portion, switching the kind moves it to where that kind left off.
  const [portionTouched, setPortionTouched] = useState(false);
  const setPortions: typeof setPortionsState = (v) => {
    setPortionTouched(true);
    setPortionsState(v);
  };
  const setKind = (k: RecitationKind) => {
    setKindState(k);
    if (!portionTouched && lastOfKind) {
      const from = lastOfKind(k);
      if (from) setPortionsState([startPortion(from)]);
    }
  };
  const [lessonDay, setLessonDay] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [dateReason, setDateReason] = useState("");
  const [level, setLevel] = useState<MarkingLevel>(classLevel);
  const [pen, setPen] = useState<Pen>("prompt");
  const [allMarks, setMarks] = useState<Mistake[]>([]);
  const [text, setText] = useState<MushafAyah[] | null>(null);
  const [textError, setTextError] = useState(false);
  const [noRecite, setNoRecite] = useState(false);
  const [delta, setDelta] = useState<-1 | 0 | 1>(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void latestLessonDay(classId).then((d) => {
      if (!alive) return;
      setLessonDay(d);
      setDate((cur) => cur || d);
    });
    return () => {
      alive = false;
    };
  }, [classId]);

  // Every ayah in the recitation, in order, without repeats.
  const ayat = useMemo(() => {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    for (const p of portions)
      for (const a of portionAyat(p)) {
        const k = keyOf(a[0], a[1]);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(a);
      }
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  }, [portions]);
  const ayatKey = ayat.map((a) => keyOf(a[0], a[1])).join(",");

  // The text loads once the portion stops changing for a moment, so typing an ayah number doesn't flicker.
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      setTextError(false);
      loadAyat(ayat)
        .then((x) => {
          if (alive) setText(x);
        })
        .catch(() => {
          if (alive) setTextError(true);
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ayatKey stands for ayat
  }, [ayatKey]);

  // Marks outside a changed portion are left out (and not saved).
  const marks = useMemo(() => {
    const inside = new Set(ayatKey.split(","));
    return allMarks.filter((m) => m.ayah !== null && !!m.surah && inside.has(keyOf(m.surah, m.ayah)));
  }, [allMarks, ayatKey]);

  const skipped = useMemo(() => new Set(marks.filter((m) => m.kind === "skipped").map((m) => keyOf(m.surah || 0, m.ayah || 0))), [marks]);
  const heard = useMemo(() => ayat.filter(([s, a]) => !skipped.has(keyOf(s, a))), [ayat, skipped]);
  const pages = Math.max(MIN_PAGES, pagesForAyat(heard));
  const allSkipped = ayat.length > 0 && heard.length === 0;
  const result = useMemo(() => markFromMistakes({ mistakes: marks, level, pages, standard, couldNotRecite: noRecite || allSkipped }), [marks, level, pages, standard, noRecite, allSkipped]);
  const score = adjustScore(result.score, delta);
  const band = bandFor(score);
  const count = (k: MistakeKind) => marks.filter((m) => m.kind === k).length;

  const markAt = (surah: number, ayah: number, word: number, gap: boolean) => marks.find((m) => m.surah === surah && m.ayah === ayah && m.word === word && !!m.gap === gap && m.kind !== "skipped");

  const tapWord = useCallback(
    (surah: number, ayah: number, word: number, gap = false) => {
      if (noRecite || skipped.has(keyOf(surah, ayah))) return;
      setMarks((ms) => {
        const i = ms.findIndex((m) => m.surah === surah && m.ayah === ayah && m.word === word && !!m.gap === gap && m.kind !== "skipped");
        const kindHere: Pen = gap ? "tajweed" : pen;
        if (i >= 0 && ms[i].kind === kindHere) return ms.filter((_, j) => j !== i);
        const next: Mistake = { kind: kindHere, surah, ayah, word, ...(gap ? { gap: true } : {}) };
        return i >= 0 ? ms.map((m, j) => (j === i ? next : m)) : [...ms, next];
      });
    },
    [pen, noRecite, skipped],
  );

  const toggleSkipped = (surah: number, ayah: number) => {
    setMarks((ms) => {
      if (ms.some((m) => m.kind === "skipped" && m.surah === surah && m.ayah === ayah)) return ms.filter((m) => !(m.kind === "skipped" && m.surah === surah && m.ayah === ayah));
      // Not reached: its word marks go.
      return [...ms.filter((m) => !(m.surah === surah && m.ayah === ayah)), { kind: "skipped", surah, ayah }];
    });
  };

  // Keyboard: P, S, T choose the pen; Backspace undoes the last mark.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "combobox")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = MISTAKE_KINDS.find((x) => x.key === e.key.toLowerCase());
      if (k) {
        e.preventDefault();
        setPen(k.value);
      } else if (e.key === "Backspace") {
        setMarks((m) => m.slice(0, -1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const setPortion = (id: number, patch: Partial<Portion>) =>
    setPortions((ps) =>
      ps.map((p) => {
        if (p.id !== id) return p;
        const n = { ...p, ...patch };
        const total = surahAyat(n.surah);
        if (patch.surah !== undefined && patch.surah !== p.surah) {
          n.from = 1;
          n.to = Math.min(10, total);
        }
        n.from = Math.max(1, Math.min(n.from || 1, total));
        n.to = Math.max(n.from, Math.min(n.to || n.from, total));
        n.pageFrom = Math.max(1, Math.min(n.pageFrom || 1, PAGE_COUNT));
        n.pageTo = Math.max(n.pageFrom, Math.min(n.pageTo || n.pageFrom, PAGE_COUNT));
        return n;
      }),
    );

  const addPortion = () =>
    setPortions((ps) => {
      const prev = ps[ps.length - 1];
      const surah = prev ? Math.min(114, (prev.mode === "pages" ? (ayatOfPages(prev.pageFrom, prev.pageTo).slice(-1)[0]?.[0] ?? prev.surah) : prev.surah) + 1) : 78;
      const page = pageOf(surah, 1);
      return [...ps, { id: nextId++, mode: "ayat", surah, from: 1, to: Math.min(10, surahAyat(surah)), pageFrom: page, pageTo: page }];
    });

  const datedAway = !!lessonDay && !!date && date !== lessonDay;

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (!date) return setError("Choose the date it was heard.");
    if (datedAway && !dateReason.trim()) return setError(`Say why it is dated ${fmtDay(date)} and not the lesson on ${fmtDay(lessonDay!)}.`);
    if (delta !== 0 && !reason.trim()) return setError("Say why you moved the mark.");
    setBusy(true);
    setError(null);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    // One entry per surah recited, each with its own marks and pages; the mark is the whole recitation's.
    const surahs = [...new Set(ayat.map((a) => a[0]))];
    const rows = surahs.map((s) => {
      const these = ayat.filter((a) => a[0] === s);
      const heardHere = heard.filter((a) => a[0] === s);
      return {
        child_id: pupil.id,
        class_id: classId,
        milestone_type: "quran_memorisation",
        surah_from: s,
        surah_to: s,
        ayah_from: these[0][1],
        ayah_to: these[these.length - 1][1],
        score,
        worked_out_score: result.score,
        adjust_reason: delta !== 0 ? reason.trim() : null,
        mistakes: marks.filter((m) => m.surah === s),
        marking_level: level,
        pages: Math.max(0, pagesForAyat(heardHere)),
        could_not_recite: noRecite || allSkipped,
        recitation_kind: kind,
        date_reason: datedAway ? dateReason.trim() : null,
        focus: [],
        setting: kind === "revision" ? "revision" : "class",
        session_date: date,
        recorded_by: uid,
      };
    });
    const { error: e } = await supabase.from("quran_progress").insert(rows);
    setBusy(false);
    if (e) return setError("Couldn't save the recitation. Please try again.");
    onSaved(`Saved ${pupil.name}: ${score} out of 10.`);
    onClose();
  };

  const leave = async () => (marks.length === 0 ? true : askConfirm("Leave without saving? The marks on this recitation will be lost.", { confirmLabel: "Leave", danger: true }));

  const markCard = (
    <section aria-labelledby="rw-mark" aria-live="polite" className="rounded-[10px] border border-gold-light bg-white px-4 py-3">
      <h2 id="rw-mark" className="t-eyebrow">
        Mark
      </h2>
      <div className="mt-1 flex items-baseline gap-3">
        <p className="text-4xl font-semibold tabular-nums text-ink">
          {score}
          <span className="text-base font-normal text-ink/60"> / 10</span>
        </p>
        <p className="min-w-0 font-medium text-ink">
          {band?.label}
          <span className="t-meta block font-normal">{band?.result}</span>
        </p>
      </div>
      <p className="t-meta mt-1">
        {result.points} point{result.points === 1 ? "" : "s"} over {result.pages} page{result.pages === 1 ? "" : "s"} ({result.perPage} a page), {levelLabel(level)} standard.
      </p>
      <div className="mt-3 flex items-center gap-1" role="group" aria-label="Move the mark one step">
        <Button size="sm" icon="minus" aria-pressed={delta === -1} onClick={() => setDelta(delta === -1 ? 0 : -1)}>
          Lower
        </Button>
        <Button size="sm" icon="plus" aria-pressed={delta === 1} onClick={() => setDelta(delta === 1 ? 0 : 1)}>
          Higher
        </Button>
      </div>
      {delta !== 0 && (
        <label className="mt-2 block text-sm">
          <span className={ui.label}>Why you moved it (worked out: {result.score})</span>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: nervous, but knew it well" className={`${ui.input} mt-1`} />
        </label>
      )}
    </section>
  );

  return (
    <FocusView
      title={`Hear ${pupil.name}`}
      eyebrow={className ? `${className} · Qur'an` : "Qur'an"}
      backLabel="Back to the class"
      onClose={onClose}
      beforeClose={leave}
      dataGuide="quran-hear"
      actions={
        <Button variant="primary" onClick={save} disabled={busy || ayat.length === 0}>
          {busy ? "Saving…" : `Save ${score} out of 10`}
        </Button>
      }
    >
      <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_19rem] lg:pb-6">
        <div className="min-w-0 space-y-6">
          {/* 1. What they recite */}
          <section aria-labelledby="rw-what" className="rounded-[10px] border border-gold-light bg-white p-4">
            <h2 id="rw-what" className="t-section">
              1. What {pupil.name.split(" ")[0]} recites
            </h2>
            <div role="radiogroup" aria-label="Kind of recitation" className="mt-3 grid grid-cols-3 gap-2">
              {RECITATION_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={`rounded-[8px] border px-3 py-2 text-left ${kind === k.value ? "border-forest-700 bg-forest-200/30 shadow-[inset_3px_0_0_var(--color-forest-700)]" : "border-gold-light hover:border-forest-500"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{k.label}</span>
                    <span lang="ar" dir="rtl" className="text-sm text-ink/70">
                      {k.ar}
                    </span>
                  </span>
                  <span className="t-meta hidden sm:block">{k.help}</span>
                </button>
              ))}
            </div>

            <ol className="mt-4 space-y-3">
              {portions.map((p, i) => (
                <li key={p.id} className="rounded-[8px] border border-gold-light/80 bg-cream/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="t-eyebrow">Portion {i + 1}</span>
                    <span className="flex items-center gap-3 text-sm">
                      <span role="radiogroup" aria-label={`Portion ${i + 1} by`} className="flex rounded-lg bg-white p-0.5 ring-1 ring-gold-light">
                        {(["ayat", "pages"] as const).map((m) => (
                          <button key={m} type="button" role="radio" aria-checked={p.mode === m} onClick={() => setPortion(p.id, { mode: m, ...(m === "pages" ? { pageFrom: pageOf(p.surah, p.from), pageTo: pageOf(p.surah, p.to) } : {}) })} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${p.mode === m ? "bg-forest-700 text-white" : "text-ink/70"}`}>
                            {m === "ayat" ? "Surah and ayat" : "Mushaf pages"}
                          </button>
                        ))}
                      </span>
                      {portions.length > 1 && (
                        <button type="button" className={ui.btnLink} onClick={() => setPortions((ps) => ps.filter((x) => x.id !== p.id))}>
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                  {p.mode === "ayat" ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_6rem]">
                      <label className="col-span-2 text-sm sm:col-span-1">
                        <span className={ui.label}>Surah</span>
                        <Select value={String(p.surah)} onChange={(e) => setPortion(p.id, { surah: Number(e.target.value) })} className="mt-1 w-full" aria-label={`Portion ${i + 1} surah`}>
                          {SURAHS.map((s, n) => (
                            <option key={n} value={n + 1}>
                              {`${n + 1}. ${s[0]}   ${s[1]}`}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="text-sm">
                        <span className={ui.label}>From ayah</span>
                        <input type="number" inputMode="numeric" min={1} max={surahAyat(p.surah)} value={p.from} onChange={(e) => setPortion(p.id, { from: Number(e.target.value) })} className={`${ui.input} mt-1`} />
                      </label>
                      <label className="text-sm">
                        <span className={ui.label}>To ayah</span>
                        <input type="number" inputMode="numeric" min={p.from} max={surahAyat(p.surah)} value={p.to} onChange={(e) => setPortion(p.id, { to: Number(e.target.value) })} className={`${ui.input} mt-1`} />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
                      <label className="text-sm">
                        <span className={ui.label}>From page</span>
                        <input type="number" inputMode="numeric" min={1} max={PAGE_COUNT} value={p.pageFrom} onChange={(e) => setPortion(p.id, { pageFrom: Number(e.target.value) })} className={`${ui.input} mt-1`} />
                      </label>
                      <label className="text-sm">
                        <span className={ui.label}>To page</span>
                        <input type="number" inputMode="numeric" min={p.pageFrom} max={PAGE_COUNT} value={p.pageTo} onChange={(e) => setPortion(p.id, { pageTo: Number(e.target.value) })} className={`${ui.input} mt-1`} />
                      </label>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button type="button" className={`${ui.btnLink} mt-2`} onClick={addPortion}>
              Add another surah or pages
            </button>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <DatePicker label="Heard on" value={date} onChange={setDate} max={ukToday()} hint={lessonDay ? `The class's latest lesson: ${fmtDay(lessonDay)}.` : undefined} />
              </div>
              {datedAway && (
                <label className="text-sm">
                  <span className={ui.label}>Why this date?</span>
                  <input value={dateReason} maxLength={300} onChange={(e) => setDateReason(e.target.value)} placeholder="For example: heard in a catch-up session" className={`${ui.input} mt-1`} />
                </label>
              )}
            </div>
          </section>

          {/* 2. The text */}
          <section aria-labelledby="rw-text" className="rounded-[10px] border border-gold-light bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light/70 px-4 py-3">
              <h2 id="rw-text" className="t-section">
                2. Mark as they recite
              </h2>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={noRecite} onChange={(e) => setNoRecite(e.target.checked)} className="h-4 w-4 accent-forest-700" />
                Could not recite it
              </label>
            </div>
            <p className="t-meta px-4 pt-3">
              Tap a word to mark it with the pen you have chosen; tap it again to clear it. Tap the space between two words for tajweed across the join. Tap an ayah&apos;s number if they did not reach it.
            </p>
            {textError ? (
              <div className="p-4">
                <Notice tone="bad">The text didn&apos;t load. Check the connection and change the portion to try again; the counters in the mark still work.</Notice>
              </div>
            ) : text === null ? (
              <p className="t-meta p-4">Opening the mushaf…</p>
            ) : (
              <MushafText ayat={text} skipped={skipped} onWord={tapWord} onAyah={toggleSkipped} markAt={markAt} />
            )}
          </section>
        </div>

        {/* 3. Pens and the mark: beside the text on wide screens, a bar along the bottom on phones. */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gold-light bg-white/95 px-3 py-2 backdrop-blur lg:static lg:rounded-[10px] lg:border lg:bg-white lg:p-4">
            <h2 className="t-eyebrow hidden lg:block">Pen</h2>
            <div role="radiogroup" aria-label="Pen" className="grid grid-cols-3 gap-1.5 lg:mt-2 lg:grid-cols-1">
              {MISTAKE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={pen === k.value}
                  onClick={() => setPen(k.value)}
                  title={`${k.help} Key ${k.key.toUpperCase()}.`}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-[8px] border px-3 text-left text-sm ${pen === k.value ? `${PEN_STYLE[k.value]} font-semibold` : "border-gold-light text-ink/80 hover:border-forest-500"}`}
                >
                  <span>
                    {k.label}
                    <span className="t-meta hidden font-normal lg:block">{k.help}</span>
                  </span>
                  <span className="tabular-nums">{count(k.value) || ""}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 lg:hidden">
              <span className="text-sm">
                <span className="text-lg font-semibold tabular-nums">{score}</span>/10 · {band?.label}
              </span>
              <Button size="sm" variant="primary" onClick={save} disabled={busy || ayat.length === 0}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="mt-3 hidden lg:block">
              <button type="button" onClick={() => setMarks((m) => m.slice(0, -1))} disabled={marks.length === 0} className={ui.btnLink}>
                Undo last mark
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {markCard}
            <label className="block text-sm">
              <span className={ui.label}>Standard for this recitation</span>
              <Select value={level} onChange={(e) => setLevel(e.target.value as MarkingLevel)} className="mt-1 w-full" aria-label="Standard">
                {MARKING_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                    {l.value === classLevel ? " (the class's level)" : ""}
                  </option>
                ))}
              </Select>
            </label>
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        </aside>
      </div>
    </FocusView>
  );
}

/** The portion's text: surah headings, a quiet page marker where a new mushaf page starts, tappable words,
 *  joins and ayah numbers. Right to left; marks show by colour and underline style, never colour alone. */
export function MushafText({
  ayat,
  skipped,
  onWord,
  onAyah,
  markAt,
  readOnly = false,
}: {
  ayat: MushafAyah[];
  skipped: Set<string>;
  onWord: (surah: number, ayah: number, word: number, gap?: boolean) => void;
  onAyah: (surah: number, ayah: number) => void;
  markAt: (surah: number, ayah: number, word: number, gap: boolean) => Mistake | undefined;
  /** A saved recitation shown again: nothing can be tapped. */
  readOnly?: boolean;
}) {
  const label: Record<string, string> = { prompt: "prompt", slip: "slip", tajweed: "tajweed" };
  return (
    <div lang="ar" dir="rtl" className={`mushaf-text px-4 pb-6 pt-2 sm:px-6 ${readOnly ? "mushaf-text--read" : ""}`}>
      {ayat.map((a, n) => {
        const head = n === 0 || ayat[n - 1].surah !== a.surah;
        const pageBreak = n === 0 || ayat[n - 1].page !== a.page;
        const isSkipped = skipped.has(`${a.surah}:${a.ayah}`);
        return (
          <span key={`${a.surah}:${a.ayah}`} className="mushaf-ayah" data-skipped={isSkipped}>
            {(head || pageBreak) && (
              <span dir="ltr" lang="en" className="my-2 flex items-center gap-3 font-sans text-xs font-semibold uppercase tracking-wide text-gold-700" style={{ lineHeight: 1.4 }}>
                <span className="h-px flex-1 bg-gold-light" aria-hidden="true" />
                {head ? `${a.surah}. ${SURAHS[a.surah - 1][0]}` : null}
                {head ? (
                  <span lang="ar" dir="rtl" className="font-normal normal-case">
                    {surahAr(a.surah)}
                  </span>
                ) : null}
                <span className="font-normal text-ink/50">Page {a.page}</span>
                <span className="h-px flex-1 bg-gold-light" aria-hidden="true" />
              </span>
            )}
            {a.words.map((w, i) => {
              const m = markAt(a.surah, a.ayah, i, false);
              const g = markAt(a.surah, a.ayah, i, true);
              const last = i === a.words.length - 1;
              return (
                <span key={i}>
                  <span
                    role={readOnly ? undefined : "button"}
                    tabIndex={readOnly || isSkipped ? -1 : 0}
                    className="mushaf-word"
                    data-mark={m?.kind}
                    aria-label={`Ayah ${a.ayah}, word ${i + 1}${m ? `, marked ${label[m.kind]}` : ""}`}
                    onClick={() => onWord(a.surah, a.ayah, i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onWord(a.surah, a.ayah, i);
                      }
                    }}
                  >
                    {w}
                  </span>
                  {!last && (
                    <span
                      role={readOnly ? undefined : "button"}
                      tabIndex={readOnly || isSkipped ? -1 : 0}
                      className="mushaf-gap"
                      data-mark={g?.kind}
                      aria-label={`Join after word ${i + 1} of ayah ${a.ayah}${g ? ", marked tajweed" : ""}`}
                      onClick={() => onWord(a.surah, a.ayah, i, true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onWord(a.surah, a.ayah, i, true);
                        }
                      }}
                    />
                  )}
                </span>
              );
            })}
            <button type="button" disabled={readOnly} className="mushaf-ayah-no" aria-pressed={isSkipped} aria-label={`Ayah ${a.ayah}${isSkipped ? ", not reached" : ""}. Tap if they did not reach it.`} onClick={() => onAyah(a.surah, a.ayah)}>
              {a.ayah}
            </button>{" "}
          </span>
        );
      })}
    </div>
  );
}

/** A saved recitation's portion with its marks, as the teacher left them (History > See on the page). */
export function MarkedPage({ entry, onClose }: { entry: { surah_from: number | null; ayah_from: number | null; ayah_to: number | null; session_date: string; score: number | null; mistakes?: unknown }; onClose: () => void }) {
  const [text, setText] = useState<MushafAyah[] | null>(null);
  const [failed, setFailed] = useState(false);
  const surah = entry.surah_from || 1;
  const marks = useMemo(() => readMistakesFor(entry.mistakes, surah), [entry.mistakes, surah]);
  useEffect(() => {
    let alive = true;
    loadAyat(ayatOfPortion(surah, entry.ayah_from, entry.ayah_to))
      .then((x) => {
        if (alive) setText(x);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [surah, entry.ayah_from, entry.ayah_to]);
  const skipped = new Set(marks.filter((m) => m.kind === "skipped").map((m) => keyOf(m.surah || surah, m.ayah || 0)));
  const markAt = (s: number, a: number, w: number, gap: boolean) => marks.find((m) => (m.surah || surah) === s && m.ayah === a && m.word === w && !!m.gap === gap && m.kind !== "skipped");
  const counts = MISTAKE_KINDS.map((k) => `${k.label} ${marks.filter((m) => m.kind === k.value).length}`).join(" · ");
  return (
    <FocusView title={`${SURAHS[surah - 1][0]} ${entry.ayah_from ?? 1} to ${entry.ayah_to ?? surahAyat(surah)}`} eyebrow={`Heard ${fmtDay(entry.session_date)} · ${entry.score ?? "-"} out of 10`} backLabel="Back" onClose={onClose} width="reading">
      <p className="t-meta mb-3">{counts}. Ayat not reached are struck through.</p>
      <div className="rounded-[10px] border border-gold-light bg-white">
        {failed ? <p className="p-4 text-sm">The text didn&apos;t load. Try again in a moment.</p> : text === null ? <p className="t-meta p-4">Opening the mushaf…</p> : <MushafText ayat={text} skipped={skipped} onWord={() => {}} onAyah={() => {}} markAt={markAt} readOnly />}
      </div>
    </FocusView>
  );
}

/** Marks of one saved entry; older marks without a surah belong to the entry's surah. */
function readMistakesFor(raw: unknown, surah: number): Mistake[] {
  return readMistakes(raw).map((m) => ({ ...m, surah: m.surah ?? surah }));
}
