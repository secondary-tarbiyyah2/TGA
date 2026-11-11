"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchTeacherClasses, type ClassSummary } from "@/lib/learn/classes";
import { EmptyState, Notice, Button, Status, type StatusKind } from "@/components/learn/ui";
import { Loading, SidePanel } from "@/components/learn/kit";
import { Select } from "@/components/learn/Select";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
import { surahAyat, surahName } from "@/lib/learn/surahs";
import { avg, bandFor, MARK_COLUMNS, type QuranMark } from "@/lib/learn/quranClassroom";
import { MISTAKE_KINDS, defaultLevelForYear, levelLabel, practiceFocus, readMistakes, readStandard, type MarkingLevel, type MarkingStandard } from "@/lib/learn/quranMarking";
import { MarkedPage, RecitationWorkspace } from "./RecitationWorkspace";
import { KIND_LABEL as RECITATION_KIND, heardLabel, pupilOverview, surahAverages, type PupilOverview, type Recitation } from "@/lib/learn/quranOverview";
import { Icon } from "@/components/learn/Icon";
import { LessonNotes } from "./LessonNotes";
import { QuranSchoolOverview } from "./QuranSchoolOverview";

type Mark = QuranMark & { mistakes?: unknown; adjust_reason?: string | null; worked_out_score?: number | null; class_id?: string | null; recitation_kind?: string | null };
type Pupil = { id: string; name: string };

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const isQuranClass = (c: Pick<ClassSummary, "name" | "subject">) => /qur'?an|quran|qaidah|hifdh|hifz/i.test(`${c.subject || ""} ${c.name}`);
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
export function QuranClasses({ scope, focusPupil, fixedClass }: { scope: "teach" | "admin"; focusPupil?: string | null; /** Inside a class's own page: that class only, with its lesson notes. */ fixedClass?: ClassSummary }) {
  const [loadedClasses, setClasses] = useState<ClassSummary[] | null>(null);
  const classes = fixedClass ? [fixedClass] : loadedClasses;
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
    if (fixedClass) return;
    (scope === "admin" ? fetchAllClasses() : fetchTeacherClasses()).then((all) => {
      if (!alive) return;
      const quran = all.filter(isQuranClass);
      setClasses(quran.length ? quran : all);
    });
    return () => {
      alive = false;
    };
  }, [scope, fixedClass]);

  const onlyGeneral = !!classes && classes.length > 0 && !classes.some(isQuranClass);
  const cls = classes?.find((c) => c.id === classId) || classes?.[0] || null;

  const load = useCallback(async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const enr = await supabase.from("enrolments").select("children(id, name)").eq("class_id", id);
    const list = (((enr.data as unknown as { children: Pupil | null }[]) || []).map((r) => r.children).filter(Boolean) as Pupil[]).sort((a, b) => a.name.localeCompare(b.name));
    const ids = list.map((p) => p.id);
    const mk = ids.length
      ? await supabase.from("quran_progress").select(`${MARK_COLUMNS}, mistakes, adjust_reason, worked_out_score, class_id, recitation_kind`).in("child_id", ids).eq("milestone_type", "quran_memorisation").order("session_date", { ascending: false }).limit(2000)
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
      {onlyGeneral && !fixedClass && (
        <Notice tone="info">
          No class is set up as a Qur&apos;an class yet, so all classes are listed. {scope === "admin" ? "Add a Qur'an class for each year group in Academic setup (subject Qur'an)." : "The office can add a Qur'an class for each year group."}
        </Notice>
      )}
      {scope === "admin" && !fixedClass && !onlyGeneral && <QuranSchoolOverview onOpen={setClassId} />}
      <div className="flex flex-wrap items-end gap-3">
        {!fixedClass && (
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
        )}
        <p className="t-meta pb-2">
          Marked at the {levelLabel(level)} standard{levels[cls.id] ? "" : " (from the year group)"}.
        </p>
      </div>

      {pupils === null ? (
        <Loading label="Loading pupils" bare />
      ) : pupils.length === 0 ? (
        <EmptyState title="Nobody is in this class yet." />
      ) : (
        <ClassTable pupils={pupils} byPupil={byPupil} onHear={setHear} onOpen={setHistory} />
      )}

      {hear && (
        <RecitationWorkspace
          pupil={hear}
          classId={cls.id}
          className={cls.name}
          level={level}
          standard={standard}
          last={byPupil(hear.id)[0] || null}
          lastOfKind={(k) => byPupil(hear.id).find((m) => (m.recitation_kind || (m.setting === "revision" ? "revision" : "memorisation")) === k) || null}
          onClose={() => setHear(null)}
          onSaved={(t) => {
            setMsg(t);
            setTick((x) => x + 1);
          }}
        />
      )}
      {fixedClass && <LessonNotes classId={cls.id} />}
      {history && <PupilQuranHistory pupil={history} marks={byPupil(history.id)} onClose={() => setHistory(null)} onHear={() => { setHear(history); setHistory(null); }} />}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = Object.fromEntries(MISTAKE_KINDS.map((k) => [k.value, k.label]));
const KIND_NAME: Record<string, string> = { memorisation: "Memorisation", revision: "Revision", reading: "Reading" };

/** One pupil's recitations, newest first, with what to practise: their most common mistakes and the ayat marked most. */
function PupilQuranHistory({ pupil, marks, onClose, onHear }: { pupil: Pupil; marks: Mark[]; onClose: () => void; onHear: () => void }) {
  const focus = useMemo(() => practiceFocus(marks.slice(0, 20)), [marks]);
  const [page, setPage] = useState<Mark | null>(null);
  if (page) return <MarkedPage entry={page} onClose={() => setPage(null)} />;
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
      <PupilSummary marks={marks} />
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
            const ms = readMistakes(m.mistakes).filter((x) => x.kind !== "skipped");
            const onPage = ms.some((x) => x.word !== undefined) || readMistakes(m.mistakes).some((x) => x.kind === "skipped");
            const band = bandFor(m.score);
            return (
              <li key={m.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="w-16 text-ink/70">{fmt(m.session_date)}</span>
                  <span className="min-w-0 flex-1 text-ink">
                    {surahName(m.surah_from || 1)}
                    {m.ayah_from ? ` ${m.ayah_from} to ${m.ayah_to}` : ""}
                    {m.recitation_kind ? <span className="t-meta"> · {KIND_NAME[m.recitation_kind] || ""}</span> : null}
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
                {onPage && (
                  <button type="button" className="mt-0.5 pl-[4.75rem] text-sm font-medium text-forest-700 hover:underline" onClick={() => setPage(m)}>
                    See on the page
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SidePanel>
  );
}

const partLabel = (r: Recitation | null) => {
  if (!r) return null;
  const p = r.parts[0];
  const more = r.parts.length > 1 ? ` +${r.parts.length - 1}` : "";
  const whole = p.from === 1 && p.to >= surahAyat(p.surah);
  return `${surahName(p.surah)}${whole ? "" : ` ${p.from} to ${p.to}`}${more}`;
};

type SortKey = "name" | "memorised" | "heard" | "average";

function SortTh({ k, sort, onSort, children, className = "" }: { k?: SortKey; sort?: SortKey; onSort?: (k: SortKey) => void; children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" aria-sort={k && sort === k ? (k === "name" || k === "average" ? "ascending" : "descending") : undefined} className={`px-3 py-2 text-left text-xs font-semibold text-ink-500 ${className}`}>
      {k && onSort ? (
        <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-ink ${sort === k ? "text-ink" : ""}`}>
          {children}
          {sort === k && <Icon name="chevronDown" size="sm" className="h-3.5 w-3.5" />}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/**
 * The class at a glance (modelled on Ihsan LMS's Qur'an tracker): one row per pupil with how much
 * they have memorised, where they are in memorisation and in revision, when they were last heard
 * (amber after a week), their recent average and its direction, and one Hear button. Click a pupil
 * for their full Qur'an record. Sortable by name, memorised, last heard and average.
 */
function ClassTable({ pupils, byPupil, onHear, onOpen }: { pupils: Pupil[]; byPupil: (id: string) => Mark[]; onHear: (p: Pupil) => void; onOpen: (p: Pupil) => void }) {
  const [sort, setSort] = useState<SortKey>("name");
  const rows = useMemo(() => pupils.map((p) => ({ p, o: pupilOverview(byPupil(p.id)) })), [pupils, byPupil]);
  const sorted = useMemo(() => {
    const r = rows.slice();
    if (sort === "memorised") r.sort((a, b) => b.o.coverage.pages - a.o.coverage.pages);
    else if (sort === "heard") r.sort((a, b) => (b.o.daysSince ?? 99999) - (a.o.daysSince ?? 99999));
    else if (sort === "average") r.sort((a, b) => (a.o.recentAverage ?? 99) - (b.o.recentAverage ?? 99));
    return r;
  }, [rows, sort]);
  const heardThisWeek = rows.filter((r) => !r.o.notHeardThisWeek).length;
  const avgs = rows.map((r) => r.o.recentAverage).filter((x): x is number => x !== null);
  const classAvg = avg(avgs);

  return (
    <div className="space-y-3" data-guide="quran-gradebook">
      <dl className="grid grid-cols-3 divide-x divide-gold-light rounded-[10px] border border-gold-light bg-white text-center">
        <div className="px-3 py-2.5">
          <dt className="t-meta">Heard this week</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {heardThisWeek} of {rows.length}
          </dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="t-meta">Class average</dt>
          <dd className="font-semibold tabular-nums text-ink">{classAvg !== null ? `${classAvg} / 10` : "-"}</dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="t-meta">Not heard for a week</dt>
          <dd className={`font-semibold tabular-nums ${rows.length - heardThisWeek ? "text-amber-900" : "text-ink"}`}>{rows.length - heardThisWeek}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto rounded-[10px] border border-gold-light bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Pupils&apos; Qur&apos;an progress. Choose a column heading to sort.</caption>
          <thead className="border-b border-gold-light bg-[var(--portal-hover)]">
            <tr>
              <SortTh k="name" sort={sort} onSort={setSort}>Pupil</SortTh>
              <SortTh k="memorised" sort={sort} onSort={setSort}>Memorised</SortTh>
              <SortTh>Memorisation</SortTh>
              <SortTh>Revision</SortTh>
              <SortTh k="heard" sort={sort} onSort={setSort}>Last heard</SortTh>
              <SortTh k="average" sort={sort} onSort={setSort} className="text-right">
                Average
              </SortTh>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Hear</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-light/60">
            {sorted.map(({ p, o }) => (
              <PupilRow key={p.id} p={p} o={o} onHear={() => onHear(p)} onOpen={() => onOpen(p)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-meta">Memorised counts ayat passed (5 or more) in memorisation, as mushaf pages out of 604. Average is the last five recitations.</p>
    </div>
  );
}

function PupilRow({ p, o, onHear, onOpen }: { p: Pupil; o: PupilOverview; onHear: () => void; onOpen: () => void }) {
  const band = bandFor(o.recentAverage === null ? null : Math.round(o.recentAverage));
  return (
    <tr className="hover:bg-[var(--portal-hover)]">
      <td className="px-3 py-2.5">
        <button type="button" onClick={onOpen} className="text-left font-medium text-ink hover:text-forest-700 hover:underline">
          {p.name}
        </button>
        <span className="t-meta block">{o.count ? `${o.count} recitation${o.count === 1 ? "" : "s"}` : "Not heard yet"}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gold-light/60" aria-hidden="true">
            <span className="block h-full rounded-full bg-forest-700" style={{ width: `${Math.min(100, o.coverage.pagePercent)}%` }} />
          </span>
          <span className="tabular-nums text-ink">{o.coverage.pagePercent}%</span>
        </span>
        <span className="t-meta block">
          {o.coverage.pages} page{o.coverage.pages === 1 ? "" : "s"}
          {o.coverage.surahs.length ? ` · ${o.coverage.surahs.length} surah${o.coverage.surahs.length === 1 ? "" : "s"}` : ""}
        </span>
      </td>
      <td className="px-3 py-2.5 text-ink">{partLabel(o.lastMemorisation) ?? <span className="t-meta">-</span>}</td>
      <td className="px-3 py-2.5 text-ink">{partLabel(o.lastRevision) ?? <span className="t-meta">-</span>}</td>
      <td className="px-3 py-2.5">
        {o.notHeardThisWeek ? (
          <span className="inline-flex items-center gap-1 font-medium text-amber-900">
            <Icon name="clock" size="sm" className="h-3.5 w-3.5" />
            {heardLabel(o.lastHeard)}
          </span>
        ) : (
          <span className="text-ink">{heardLabel(o.lastHeard)}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {o.recentAverage !== null ? (
          <>
            <span className="font-semibold tabular-nums text-ink">
              {o.recentAverage}
              {o.trend === "up" ? <span className="ml-1 text-forest-700" title="Improving">↑</span> : o.trend === "down" ? <span className="ml-1 text-red-700" title="Dropping">↓</span> : null}
            </span>
            {band && (
              <span className="block">
                <Status kind={TONE[band.tone]}>{band.label}</Status>
              </span>
            )}
          </>
        ) : (
          <span className="t-meta">-</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Button size="sm" variant="primary" icon="bookOpen" onClick={onHear}>
          Hear
        </Button>
      </td>
    </tr>
  );
}

/** The summary at the top of a pupil's Qur'an record: tiles, memorised surahs and per-surah averages. */
function PupilSummary({ marks }: { marks: Mark[] }) {
  const o = useMemo(() => pupilOverview(marks), [marks]);
  const per = useMemo(() => surahAverages(marks), [marks]);
  if (!o.count) return null;
  const tile = "rounded-[10px] border border-gold-light bg-white px-3 py-2.5";
  return (
    <section className="mb-5 space-y-3" aria-label="Summary">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={tile}>
          <dt className="t-meta">Average (last 5)</dt>
          <dd className="font-semibold tabular-nums text-ink">{o.recentAverage ?? "-"} / 10</dd>
        </div>
        <div className={tile}>
          <dt className="t-meta">Last heard</dt>
          <dd className={`font-semibold ${o.notHeardThisWeek ? "text-amber-900" : "text-ink"}`}>{heardLabel(o.lastHeard)}</dd>
        </div>
        <div className={tile}>
          <dt className="t-meta">Memorised</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {o.coverage.pagePercent}% <span className="t-meta font-normal">· {o.coverage.pages} of 604 pages</span>
          </dd>
        </div>
        <div className={tile}>
          <dt className="t-meta">Whole surahs</dt>
          <dd className="font-semibold tabular-nums text-ink">{o.coverage.surahs.length} of 114</dd>
        </div>
      </dl>
      {(o.lastMemorisation || o.lastRevision) && (
        <p className="text-sm text-ink">
          {o.lastMemorisation && (
            <>
              <span className="t-meta">{RECITATION_KIND.memorisation}:</span> {partLabel(o.lastMemorisation)}
            </>
          )}
          {o.lastMemorisation && o.lastRevision && <span className="t-meta"> · </span>}
          {o.lastRevision && (
            <>
              <span className="t-meta">{RECITATION_KIND.revision}:</span> {partLabel(o.lastRevision)}
            </>
          )}
        </p>
      )}
      {o.coverage.surahs.length > 0 && (
        <details className="rounded-[10px] border border-gold-light bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-ink">Surahs memorised ({o.coverage.surahs.length})</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {o.coverage.surahs.map((s) => (
              <li key={s} className="rounded-full border border-forest-300 bg-forest-200/20 px-2.5 py-0.5 text-xs text-ink">
                {s}. {surahName(s)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {per.length > 0 && (
        <details className="rounded-[10px] border border-gold-light bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-ink">Average per surah ({per.length})</summary>
          <ul className="mt-2 divide-y divide-gold-light/60 text-sm">
            {per.map((x) => {
              const b = bandFor(Math.round(x.avg));
              return (
                <li key={x.surah} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 text-ink">
                    {x.surah}. {surahName(x.surah)}
                  </span>
                  <span className="t-meta">heard {x.times}×</span>
                  <span className="w-12 text-right font-semibold tabular-nums">{x.avg}</span>
                  {b && <Status kind={TONE[b.tone]}>{b.label}</Status>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
