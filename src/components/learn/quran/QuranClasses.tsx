"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { EmptyState, Notice, Button, Status, type StatusKind } from "@/components/learn/ui";
import { Loading, SidePanel } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { surahName } from "@/lib/learn/surahs";
import { avg, bandFor, MARK_COLUMNS, type QuranMark } from "@/lib/learn/quranClassroom";
import { MISTAKE_KINDS, defaultLevelForYear, levelLabel, practiceFocus, readMistakes, readStandard, type MarkingLevel, type MarkingStandard } from "@/lib/learn/quranMarking";
import { RecitationDialog } from "./RecitationDialog";

type Mark = QuranMark & { mistakes?: unknown; adjust_reason?: string | null; worked_out_score?: number | null; class_id?: string | null };
type Pupil = { id: string; name: string };

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const isQuranClass = (c: ClassSummary) => /qur'?an|quran|qaidah|hifdh|hifz/i.test(`${c.subject || ""} ${c.name}`);
const TONE: Record<string, StatusKind> = { bad: "overdue", warn: "attention", info: "in_progress", good: "completed" };

/** The school's standard and the class levels, read once. */
export function useQuranStandard() {
  const [standard, setStandard] = useState<MarkingStandard | null>(null);
  const [levels, setLevels] = useState<Record<string, MarkingLevel>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [s, l] = await Promise.all([supabase.from("quran_marking_standard").select("standard").maybeSingle(), supabase.from("quran_class_settings").select("class_id, marking_level")]);
      if (!alive) return;
      setStandard(readStandard((s.data as { standard?: unknown } | null)?.standard));
      setLevels(Object.fromEntries(((l.data as { class_id: string; marking_level: MarkingLevel }[] | null) || []).map((r) => [r.class_id, r.marking_level])));
    })();
    return () => {
      alive = false;
    };
  }, [tick]);
  return { standard, levels, reload: () => setTick((t) => t + 1) };
}

/**
 * Qur'an classes (owner, 11 Nov 2026, item 13): each year group's Qur'an class as a list of its pupils with
 * their last recitation, mark and average; press Hear to open the recitation panel, or a pupil's history to
 * see every recitation and what to practise. Classes whose subject or name says Qur'an (or Qaidah, hifdh)
 * are shown first; with none, every class you can see is offered.
 */
export function QuranClasses({ scope, focusPupil }: { scope: "teach" | "admin"; focusPupil?: string | null }) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [classId, setClassId] = useState("");
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [hear, setHear] = useState<Pupil | null>(null);
  const [history, setHistory] = useState<Pupil | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { standard, levels } = useQuranStandard();

  useEffect(() => {
    let alive = true;
    (scope === "admin" ? fetchAllClasses() : fetchTeacherClasses()).then((all) => {
      if (!alive) return;
      const quran = all.filter(isQuranClass);
      setClasses(quran.length ? quran : all);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  const onlyGeneral = !!classes && classes.length > 0 && !classes.some(isQuranClass);
  const cls = classes?.find((c) => c.id === classId) || classes?.[0] || null;

  const load = useCallback(async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const enr = await supabase.from("enrolments").select("children(id, name)").eq("class_id", id);
    const list = (((enr.data as unknown as { children: Pupil | null }[]) || []).map((r) => r.children).filter(Boolean) as Pupil[]).sort((a, b) => a.name.localeCompare(b.name));
    const ids = list.map((p) => p.id);
    const mk = ids.length
      ? await supabase.from("quran_progress").select(`${MARK_COLUMNS}, mistakes, adjust_reason, worked_out_score, class_id`).in("child_id", ids).eq("milestone_type", "quran_memorisation").order("session_date", { ascending: false }).limit(2000)
      : { data: [] };
    setPupils(list);
    setMarks((mk.data as unknown as Mark[]) || []);
  }, []);

  useEffect(() => {
    if (!cls) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show loading while the class changes
    setPupils(null);
    void load(cls.id);
  }, [cls, load, tick]);

  // A link from a pupil's profile (?pupil=) opens the panel for that pupil once their class is loaded.
  useEffect(() => {
    if (!focusPupil || !pupils) return;
    const p = pupils.find((x) => x.id === focusPupil);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the linked pupil once
    if (p) setHear(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the class first loads
  }, [pupils === null]);

  if (classes === null || !standard) return <Loading label="Loading Qur'an classes" bare />;
  if (classes.length === 0) return <EmptyState title="No classes yet.">Qur&apos;an classes you teach appear here.</EmptyState>;
  if (!cls) return null;
  const level: MarkingLevel = levels[cls.id] || defaultLevelForYear(cls.yearGroup);
  const byPupil = (id: string) => marks.filter((m) => m.child_id === id);

  return (
    <div className="space-y-4" data-guide="quran-classes">
      {msg && <Notice tone="good">{msg}</Notice>}
      {onlyGeneral && (
        <Notice tone="info">
          No class is set up as a Qur&apos;an class yet, so all classes are listed. {scope === "admin" ? "Add a Qur'an class for each year group in Academic setup (subject Qur'an)." : "The office can add a Qur'an class for each year group."}
        </Notice>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="t-eyebrow mb-1 block">Class</span>
          <Select value={cls.id} onChange={(e) => setClassId(e.target.value)} aria-label="Qur'an class">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <p className="t-meta pb-2">
          Marked at the {levelLabel(level)} standard{levels[cls.id] ? "" : " (from the year group)"}.
        </p>
      </div>

      {pupils === null ? (
        <Loading label="Loading pupils" bare />
      ) : pupils.length === 0 ? (
        <EmptyState title="Nobody is in this class yet." />
      ) : (
        <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white" data-guide="quran-gradebook">
          {pupils.map((p) => {
            const ms = byPupil(p.id);
            const last = ms[0];
            const recent = avg(ms.slice(0, 5).map((m) => m.score).filter((x): x is number => x !== null));
            const band = bandFor(last?.score ?? null);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <PupilLink id={p.id} name={p.name} className="block" />
                  <span className="t-meta block">{last ? `${fmt(last.session_date)} · ${surahName(last.surah_from || 1)}${last.ayah_from ? ` ${last.ayah_from} to ${last.ayah_to}` : ""}` : "Not heard yet"}</span>
                </span>
                <span className="w-28 text-right">
                  {last && last.score !== null ? (
                    <>
                      <span className="block font-semibold tabular-nums text-ink">{last.score} / 10</span>
                      {band && <Status kind={TONE[band.tone]}>{band.label}</Status>}
                    </>
                  ) : (
                    <span className="t-meta">No mark</span>
                  )}
                </span>
                <span className="hidden w-24 text-right sm:block">
                  <span className="block tabular-nums text-ink">{recent ?? "-"}</span>
                  <span className="t-meta">last 5</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setHistory(p)}>
                    History
                  </Button>
                  <Button size="sm" variant="primary" icon="bookOpen" onClick={() => setHear(p)}>
                    Hear
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hear && (
        <RecitationDialog
          pupil={hear}
          classId={cls.id}
          level={level}
          standard={standard}
          last={byPupil(hear.id)[0] || null}
          onClose={() => setHear(null)}
          onSaved={(t) => {
            setMsg(t);
            setTick((x) => x + 1);
          }}
        />
      )}
      {history && <PupilQuranHistory pupil={history} marks={byPupil(history.id)} onClose={() => setHistory(null)} onHear={() => { setHear(history); setHistory(null); }} />}
    </div>
  );
}

const KIND_LABEL = Object.fromEntries(MISTAKE_KINDS.map((k) => [k.value, k.label]));

/** One pupil's recitations, newest first, with what to practise: their most common mistakes and the ayat marked most. */
function PupilQuranHistory({ pupil, marks, onClose, onHear }: { pupil: Pupil; marks: Mark[]; onClose: () => void; onHear: () => void }) {
  const focus = useMemo(() => practiceFocus(marks.slice(0, 20)), [marks]);
  return (
    <SidePanel
      title={pupil.name}
      eyebrow="Qur'an history"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="bookOpen" onClick={onHear}>
            Hear a recitation
          </Button>
          <PupilLink id={pupil.id} name={pupil.name} className="ml-auto text-sm">
            Open profile
          </PupilLink>
        </>
      }
    >
      {focus.heard > 0 && (
        <section className="mb-5 rounded-[10px] border border-forest-300 bg-forest-200/20 px-4 py-3" aria-labelledby="qh-focus">
          <h3 id="qh-focus" className="t-section">
            What to practise
          </h3>
          <p className="t-meta mb-2">From the last {focus.heard} recitation{focus.heard === 1 ? "" : "s"} with mistakes logged.</p>
          <p className="text-sm text-ink">
            {MISTAKE_KINDS.map((k) => `${k.label}: ${focus.kinds[k.value]}`).join(" · ")}
          </p>
          {focus.ayat.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {focus.ayat.map((a) => (
                <li key={`${a.surah}:${a.ayah}`}>
                  {surahName(a.surah)}, ayah {a.ayah} <span className="t-meta">· {a.sessions > 1 ? `in ${a.sessions} recitations` : `${a.marks} mistake${a.marks === 1 ? "" : "s"}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {marks.length === 0 ? (
        <EmptyState title="Not heard yet." />
      ) : (
        <ul className="divide-y divide-gold-light/60">
          {marks.map((m) => {
            const ms = readMistakes(m.mistakes);
            const band = bandFor(m.score);
            return (
              <li key={m.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="w-16 text-ink/70">{fmt(m.session_date)}</span>
                  <span className="min-w-0 flex-1 text-ink">
                    {surahName(m.surah_from || 1)}
                    {m.ayah_from ? ` ${m.ayah_from} to ${m.ayah_to}` : ""}
                  </span>
                  <span className="font-semibold tabular-nums">{m.score ?? "-"} / 10</span>
                  {band && <Status kind={TONE[band.tone]}>{band.label}</Status>}
                </div>
                {(ms.length > 0 || m.adjust_reason) && (
                  <p className="t-meta mt-0.5 pl-[4.75rem]">
                    {ms.length > 0 && ms.map((x) => `${KIND_LABEL[x.kind]}${x.ayah ? ` on ayah ${x.ayah}` : ""}`).join(", ")}
                    {m.adjust_reason ? `${ms.length ? ". " : ""}Moved from ${m.worked_out_score}: ${m.adjust_reason}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SidePanel>
  );
}
