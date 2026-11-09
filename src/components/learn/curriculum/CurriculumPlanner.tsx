"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/learn/Tabs";
import { ui } from "@/components/learn/ui";
import { classColour } from "@/lib/learn/classes";
import { YEARS, yearLabel } from "@/lib/learn/curriculum";
import { useLearnSession } from "@/lib/learn/session";
import {
  HALF_TERMS,
  TERMS,
  deleteUnit,
  draftFromSnapshot,
  halfTermLabel,
  syncNotes,
  problemsFor,
  restoreRemovedUnit,
  loadUnits,
  removedUnits,
  retitleForHalfTerm,
  savePositions,
  saveUnit,
  sortUnits,
  triggerCurriculumSync,
  unitHistory,
  unitProblems,
  when,
  type CurriculumUnit,
  type HalfTerm,
  openNotes as openOf,
  realEditAt,
  type SyncNote,
  type SyncRun,
  type UnitDraft,
  type UnitVersion,
  type WeekPlan,
} from "@/lib/learn/curriculumUnits";
import { LinesField, Modal, TextField } from "@/components/learn/curriculum/Modal";

const YEAR_KEY = "tga-planner-year";
const btn = `${ui.btnSecondary} ${ui.sm}`;
const isKs4 = (y: string) => y === "y10" || y === "y11";

type Column = { key: string; label: string };
const NOT_PLACED = "none";

/** Which grid column a unit sits in: its half term (Years 1 to 9) or the term it starts in (Years 10 and 11). */
function columnOf(u: Pick<CurriculumUnit, "kind" | "half_term" | "term">): string {
  if (u.kind === "spec") {
    const t = TERMS.find((x) => (u.term || "").toLowerCase().startsWith(x.toLowerCase()));
    return t || NOT_PLACED;
  }
  return u.half_term || NOT_PLACED;
}

/**
 * The Curriculum planner: pick a year group, see every subject against the six half terms
 * (the long-term plan), open a unit to edit what it covers and its week-by-week plan (the
 * medium-term plan). Saves go straight to the database; the sync copies them to the
 * syllabus pack.
 */
export function CurriculumPlanner() {
  const { roles } = useLearnSession();
  const canEdit = roles.some((r) => r.role === "teacher" || r.role === "head_teacher" || r.role === "admin");
  const [year, setYearState] = useState("y1");
  const [units, setUnits] = useState<CurriculumUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: UnitDraft; original?: CurriculumUnit } | null>(null);
  const [sync, setSync] = useState<SyncRun | null>(null);
  const [notes, setNotes] = useState<SyncNote[]>([]);
  const [removed, setRemoved] = useState<UnitVersion[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const y = window.localStorage.getItem(YEAR_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the last year once after mount
      if (y && YEARS.includes(y)) setYearState(y);
    } catch {
      /* private mode */
    }
  }, []);
  const setYear = (y: string) => {
    setYearState(y);
    try {
      window.localStorage.setItem(YEAR_KEY, y);
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    try {
      setUnits(await loadUnits());
      setError(null);
    } catch {
      setError("Couldn't load the curriculum. Refresh to try again.");
      setUnits([]);
    }
    syncNotes().then((r) => {
      setSync(r.latest);
      setNotes(r.notes);
    });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);
  useEffect(() => {
    let live = true;
    removedUnits(year).then((r) => live && setRemoved(r));
    return () => {
      live = false;
    };
  }, [year, units]);

  const ks4 = isKs4(year);
  const kind = ks4 ? "spec" : "syllabus";
  const columns: Column[] = ks4 ? TERMS.map((t) => ({ key: t, label: t })) : HALF_TERMS.map((h) => ({ key: h.key, label: h.label }));
  // Every subject that has this kind of plan (from any year), so a year with no units yet can still get one.
  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    (units || []).filter((u) => u.kind === kind).forEach((u) => m.set(u.subject_slug, u.subject));
    return [...m.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [units, kind]);
  const forYear = useMemo(() => (units || []).filter((u) => u.year === year && u.kind === kind), [units, year, kind]);
  const showUnplaced = forYear.some((u) => columnOf(u) === NOT_PLACED);
  const allColumns = showUnplaced ? [...columns, { key: NOT_PLACED, label: ks4 ? "Other" : "Not placed yet" }] : columns;
  const lastEdit = forYear.reduce<CurriculumUnit | null>((a, u) => (!a || u.updated_at > a.updated_at ? u : a), null);
  // When a person last really edited a unit, or any unit of a whole year (the sync's own moves
  // and repo imports do not count): a clash noted before then has been dealt with.
  const editedAt = (scope: string): string | null => {
    const all = units || [];
    const hit = scope.startsWith("unit:")
      ? all.filter((u) => `unit:${u.id}` === scope)
      : all.filter((u) => (u.kind === "spec" ? `spec:${u.subject_slug}` : `syllabus:${u.subject_slug}:${u.year}`) === scope);
    return (
      hit
        .map((u) => realEditAt(u.updated_by_name, u.updated_at))
        .filter((x): x is string => !!x)
        .sort()
        .pop() || null
    );
  };
  // Units and whole years only: lesson notes are shown in the lesson editor.
  const openNotes = openOf(
    notes.filter((n) => /^(unit|syllabus|spec):/.test(n.scope || "")),
    editedAt,
  );
  const pending = sync && lastEdit && lastEdit.updated_at > sync.started_at && lastEdit.updated_by_name && !/repository/i.test(lastEdit.updated_by_name);

  const newDraft = (slug: string, subject: string, col: string): UnitDraft => {
    const sameSubject = (units || []).filter((u) => u.subject_slug === slug && u.kind === kind);
    return {
      subject_slug: slug,
      subject,
      kind,
      year,
      half_term: !ks4 && col !== NOT_PLACED ? (col as HalfTerm) : null,
      term: ks4 && col !== NOT_PLACED ? col : null,
      position: sameSubject.reduce((m, u) => Math.max(m, u.position), -1) + 1,
      ref: null,
      paper: null,
      title: "",
      focus: [],
      skills: [],
      key_terms: [],
      assess: null,
      prereq: null,
      leads_to: null,
      weeks: [],
      resources: null,
      founding_year: null,
    };
  };

  // Move a unit up or down within its cell: renumber the subject's units in teaching order.
  const move = async (u: CurriculumUnit, dir: -1 | 1) => {
    if (!units) return;
    const list = sortUnits(units.filter((x) => x.subject_slug === u.subject_slug && x.kind === u.kind && (u.kind === "spec" || x.year === u.year)));
    const cell = list.filter((x) => x.year === u.year && columnOf(x) === columnOf(u));
    const i = cell.findIndex((x) => x.id === u.id);
    const other = cell[i + dir];
    if (!other) return;
    const a = list.findIndex((x) => x.id === u.id);
    const b = list.findIndex((x) => x.id === other.id);
    [list[a], list[b]] = [list[b], list[a]];
    const next = list.map((x, k) => ({ id: x.id, position: k }));
    setBusy(true);
    try {
      await savePositions(next.filter((x) => units.find((y) => y.id === x.id)?.position !== x.position));
      setMessage(await triggerCurriculumSync("unit"));
    } catch {
      setMessage("Couldn't move that unit. Only teachers and the Headteacher can change the plan.");
    }
    setBusy(false);
    load();
  };

  const restoreRemoved = async (v: UnitVersion) => {
    setBusy(true);
    try {
      await restoreRemovedUnit(v.id);
      setRemoved((r) => r.filter((x) => x.id !== v.id));
      setMessage(await triggerCurriculumSync("unit"));
    } catch {
      setMessage("Couldn't put that unit back. It may already have been put back.");
    }
    setBusy(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gold-light bg-white p-4">
        <Tabs variant="switch" items={YEARS.map((y) => ({ key: y, label: yearLabel(y).replace("Year ", "Y") }))} value={year} onChange={setYear} label="Year group" />
        <p className="text-sm text-ink/75">
          {ks4
            ? "Years 10 and 11 follow the exam board's specification: each unit sits in the term the board suggests. Open a unit to change its points or add a week-by-week plan."
            : "Each subject's units for the year, half term by half term. Open a unit to change what it covers or plan it week by week."}{" "}
          {canEdit ? "Changes save for everyone straight away." : "You can look but not change the plan."}
        </p>
        <p className="text-xs text-ink/65" aria-live="polite">
          {lastEdit?.updated_by_name ? `Last change in ${yearLabel(year)}: ${lastEdit.updated_by_name}, ${when(lastEdit.updated_at)}. ` : ""}
          {pending ? "Waiting to be copied to the syllabus pack. " : ""}
          {sync ? `Last copied to the syllabus pack and slides: ${when(sync.finished_at || sync.started_at)}${sync.ok ? "" : " (that run did not finish; it will try again)"}.` : "Not yet copied to the syllabus pack."}
        </p>
        {openNotes.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <summary className="cursor-pointer font-semibold">{openNotes.length} thing{openNotes.length === 1 ? "" : "s"} to look at from recent copies to the syllabus pack and slides</summary>
            <ul className="mt-1 list-disc pl-5">
              {openNotes.slice(0, 15).map((p) => (
                <li key={`${p.scope}|${p.text}`}>{p.text}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {message && (
        <p role="status" className="rounded-lg border border-gold-light bg-cream px-3 py-2 text-sm text-ink/80">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {units === null && <div className="h-40 animate-pulse rounded-2xl bg-white" />}
      {units && subjects.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">The curriculum has not been loaded into the planner yet. It is filled from the syllabus files the first time the sync runs.</p>
      )}

      {units && subjects.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gold-light bg-white">
          {/* Column headings: only on wide screens, where the grid shows. */}
          <div className="hidden border-b border-gold-light bg-cream lg:grid" style={{ gridTemplateColumns: `10rem repeat(${allColumns.length}, minmax(0, 1fr))` }}>
            <span className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/65">Subject</span>
            {allColumns.map((c) => (
              <span key={c.key} className="border-l border-gold-light px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/65">
                {c.label}
              </span>
            ))}
          </div>
          <ul>
            {subjects.map((s) => {
              const mine = sortUnits(forYear.filter((u) => u.subject_slug === s.slug));
              return (
                <li key={s.slug} className="border-t border-gold-light first:border-t-0 lg:grid" style={{ gridTemplateColumns: `10rem repeat(${allColumns.length}, minmax(0, 1fr))` }}>
                  <h2 className="flex items-center gap-2 bg-cream/60 px-3 py-2 text-sm font-semibold text-ink lg:bg-transparent">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: classColour(s.slug) }} />
                    {s.name}
                  </h2>
                  <div className="grid gap-px bg-gold-light/60 sm:grid-cols-2 lg:contents">
                    {allColumns.map((c) => {
                      const cell = mine.filter((u) => columnOf(u) === c.key);
                      return (
                        <div key={c.key} className="min-w-0 bg-white px-3 py-2 lg:border-l lg:border-gold-light">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/55 lg:hidden">{c.label}</p>
                          <ul className="space-y-1.5">
                            {cell.map((u, i) => (
                              <li key={u.id} className="group flex items-start gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditing({ draft: draftFromSnapshot(u, true), original: u })}
                                  className="min-w-0 flex-1 rounded-lg border border-gold-light bg-white px-2 py-1.5 text-left text-sm text-ink hover:border-teal-700 hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
                                >
                                  <span className="block font-medium leading-snug">
                                    {u.ref ? `${u.ref} ` : ""}
                                    {u.title}
                                  </span>
                                  <span className="block text-xs text-ink/60">
                                    {u.weeks.length ? `${u.weeks.length} week${u.weeks.length === 1 ? "" : "s"} planned` : "No weekly plan yet"}
                                    {ks4 ? ` · ${u.year.toUpperCase()}` : ""}
                                  </span>
                                </button>
                                {canEdit && cell.length > 1 && (
                                  <span className="flex flex-col">
                                    <button type="button" disabled={busy || i === 0} onClick={() => move(u, -1)} aria-label={`Move ${u.title} up`} className="rounded px-1 text-xs text-ink/60 hover:bg-cream disabled:opacity-30">
                                      ▲
                                    </button>
                                    <button type="button" disabled={busy || i === cell.length - 1} onClick={() => move(u, 1)} aria-label={`Move ${u.title} down`} className="rounded px-1 text-xs text-ink/60 hover:bg-cream disabled:opacity-30">
                                      ▼
                                    </button>
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {canEdit && (
                            <button type="button" onClick={() => setEditing({ draft: newDraft(s.slug, s.name, c.key) })} className={`mt-1 ${ui.btnLink} !text-xs`}>
                              + Add unit
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canEdit && removed.length > 0 && (
        <details className="rounded-2xl border border-gold-light bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Recently removed from {yearLabel(year)} ({removed.length})</summary>
          <ul className="mt-2 divide-y divide-gold-light/70">
            {removed.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <strong>{v.snapshot.subject}</strong>: {v.snapshot.title} <span className="text-xs text-ink/60">removed {when(v.edited_at)}</span>
                </span>
                <button type="button" className={btn} disabled={busy} onClick={() => restoreRemoved(v)}>
                  Put it back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <UnitEditor
          key={editing.original?.id || "new"}
          initial={editing.draft}
          original={editing.original}
          canEdit={canEdit}
          syncNotes={editing.original ? problemsFor(notes, [`unit:${editing.original.id}`, editing.original.kind === "spec" ? `spec:${editing.original.subject_slug}` : `syllabus:${editing.original.subject_slug}:${editing.original.year}`], editedAt) : []}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setMessage(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

const blankWeek = (n: number): WeekPlan => ({ week: n, lessons: [], vocabulary: [], home: "" });

function UnitEditor({ initial, original, canEdit, syncNotes, onClose, onSaved }: { initial: UnitDraft; original?: CurriculumUnit; canEdit: boolean; syncNotes: string[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [d, setD] = useState<UnitDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [history, setHistory] = useState<UnitVersion[] | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof UnitDraft>(k: K, v: UnitDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const spec = d.kind === "spec";
  const setWeek = (i: number, w: Partial<WeekPlan>) => set("weeks", d.weeks.map((x, k) => (k === i ? { ...x, ...w } : x)));
  const moveWeek = (i: number, dir: -1 | 1) => {
    const w = [...d.weeks];
    [w[i], w[i + dir]] = [w[i + dir], w[i]];
    set("weeks", w.map((x, k) => ({ ...x, week: k + 1 })));
  };

  const close = () => {
    if (dirty && canEdit && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };

  const save = async () => {
    const p = unitProblems(d);
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    try {
      await saveUnit(d, original?.updated_at);
      onSaved(await triggerCurriculumSync("unit"));
    } catch (e) {
      setBusy(false);
      setProblems([
        e instanceof Error && e.message === "edited_elsewhere"
          ? "Someone else saved this unit while you were editing it. Copy anything you need, close this window and open the unit again to see their changes."
          : "Couldn't save. Check your connection and try again. Only teachers and the Headteacher can change the plan.",
      ]);
    }
  };

  const remove = async () => {
    if (!original || !window.confirm(`Remove "${original.title}" from ${yearLabel(original.year)}? You can put it back from "Recently removed".`)) return;
    setBusy(true);
    try {
      await deleteUnit(original.id);
      onSaved(await triggerCurriculumSync("unit"));
    } catch {
      setBusy(false);
      setProblems(["Couldn't remove the unit."]);
    }
  };

  const showHistory = async () => {
    if (!original) return;
    setHistory(await unitHistory(original.id));
  };

  const dis = !canEdit || busy;
  return (
    <Modal title={original ? `${d.subject}, ${yearLabel(d.year)}: ${original.title}` : `New ${d.subject} unit, ${yearLabel(d.year)}`} onClose={close} wide>
      <div className="space-y-5 p-4 sm:p-6">
        {syncNotes.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">From the last copy to the syllabus pack</p>
            <ul className="list-disc pl-5">
              {syncNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {original?.updated_by_name && (
          <p className="text-xs text-ink/65">
            Last changed by {original.updated_by_name}, {when(original.updated_at)}.{" "}
            <button type="button" className={`${ui.btnLink} !text-xs`} onClick={showHistory}>
              See earlier versions
            </button>
          </p>
        )}
        {history && (
          <div className="rounded-xl border border-gold-light bg-cream/60 p-3 text-sm">
            <p className="font-semibold text-ink">Earlier versions</p>
            {history.length === 0 ? (
              <p className="text-ink/70">No earlier versions yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-gold-light/70">
                {history.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      {when(v.edited_at)} · {v.edited_by_name || "Unknown"} · <span className="text-ink/70">{v.snapshot.title}</span>
                    </span>
                    {canEdit && (
                      <button type="button" className={btn} onClick={() => setD({ ...draftFromSnapshot(v.snapshot, true), id: original?.id })}>
                        Use this version
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-ink/65">“Use this version” fills the form with it; press Save to keep it.</p>
          </div>
        )}

        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={dis}>
          <div className="sm:col-span-2">
            <TextField label="Unit title" value={d.title} onChange={(v) => set("title", v)} placeholder={spec ? "e.g. The challenge of natural hazards" : "e.g. Autumn 1: The Mysterious Woodlands"} />
          </div>
          {spec ? (
            <>
              <TextField label="Specification reference" hint="As the board writes it, e.g. 3.1.1" value={d.ref || ""} onChange={(v) => set("ref", v)} />
              <TextField label="Paper" hint="Which paper examines it" value={d.paper || ""} onChange={(v) => set("paper", v)} />
              <label className="block">
                <span className={ui.label}>Year</span>
                <select value={d.year} onChange={(e) => set("year", e.target.value)} className={`mt-1 ${ui.select}`}>
                  <option value="y10">Year 10</option>
                  <option value="y11">Year 11</option>
                </select>
              </label>
              <TextField label="Term" hint="e.g. Autumn, or Spring to Summer" value={d.term || ""} onChange={(v) => set("term", v)} />
            </>
          ) : (
            <label className="block">
              <span className={ui.label}>Half term</span>
              <select
                value={d.half_term || ""}
                onChange={(e) => {
                  const h = (e.target.value || null) as HalfTerm | null;
                  setD((x) => ({ ...x, half_term: h, title: retitleForHalfTerm(x.title, h) }));
                }}
                className={`mt-1 ${ui.select}`}
              >
                <option value="">Not placed yet</option>
                {HALF_TERMS.map((h) => (
                  <option key={h.key} value={h.key}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sm:col-span-2">
            <LinesField label={spec ? "Specification points" : "What it covers"} hint="One per line." value={d.focus} onChange={(v) => set("focus", v)} rows={4} />
          </div>
          {!spec && <LinesField label="Skills" hint="One per line." value={d.skills} onChange={(v) => set("skills", v)} />}
          <LinesField label="Key terms" hint="One per line." value={d.key_terms} onChange={(v) => set("key_terms", v)} />
          <TextField label="How it is checked" value={d.assess || ""} onChange={(v) => set("assess", v)} multiline />
          <TextField label="Builds on" hint="What pupils learnt before" value={d.prereq || ""} onChange={(v) => set("prereq", v)} multiline />
          <TextField label="Leads to" hint="What it prepares pupils for" value={d.leads_to || ""} onChange={(v) => set("leads_to", v)} multiline />
          <TextField label="Resources" hint="Books, schemes and materials" value={d.resources || ""} onChange={(v) => set("resources", v)} multiline />
          <div className="sm:col-span-2">
            <TextField label="Founding year (January to July 2027)" hint="Optional: how this unit fits the first year, e.g. which weeks it is taught" value={d.founding_year || ""} onChange={(v) => set("founding_year", v)} />
          </div>
        </fieldset>

        <section aria-labelledby="weeks-h" className="space-y-2">
          <h3 id="weeks-h" className={ui.sectionTitle}>
            Week by week
          </h3>
          <p className={ui.hint}>The medium-term plan: what is taught each week. Lessons and key vocabulary take one per line.</p>
          {d.weeks.length === 0 && <p className="rounded-xl border border-dashed border-gold-light p-4 text-center text-sm text-ink/65">No weeks planned yet.</p>}
          <ol className="space-y-3">
            {d.weeks.map((w, i) => (
              <li key={i} className="rounded-xl border border-gold-light p-3">
                <fieldset disabled={dis} className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="block">
                    <span className={ui.label}>Week</span>
                    <input type="number" min={1} max={60} value={w.week} onChange={(e) => setWeek(i, { week: Number(e.target.value) || i + 1 })} className={`mt-1 ${ui.input}`} />
                  </label>
                  <LinesField label="Lessons" value={w.lessons} onChange={(v) => setWeek(i, { lessons: v })} rows={2} />
                  <LinesField label="Key vocabulary" value={w.vocabulary} onChange={(v) => setWeek(i, { vocabulary: v })} rows={2} />
                  <div className="sm:col-span-3">
                    <TextField label="Home activity" value={w.home} onChange={(v) => setWeek(i, { home: v })} />
                  </div>
                </fieldset>
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={btn} disabled={busy || i === 0} onClick={() => moveWeek(i, -1)}>
                      Move up
                    </button>
                    <button type="button" className={btn} disabled={busy || i === d.weeks.length - 1} onClick={() => moveWeek(i, 1)}>
                      Move down
                    </button>
                    <button type="button" className={`${ui.btnLinkDanger} ml-auto`} disabled={busy} onClick={() => set("weeks", d.weeks.filter((_, k) => k !== i).map((x, k) => ({ ...x, week: k + 1 })))}>
                      Remove week
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {canEdit && (
            <button type="button" className={btn} disabled={busy} onClick={() => set("weeks", [...d.weeks, blankWeek(d.weeks.length + 1)])}>
              + Add a week
            </button>
          )}
        </section>

        {problems.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 rounded-lg border border-red-200 bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-gold-light bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <button type="button" className={ui.btnPrimary} onClick={save} disabled={busy || (!dirty && !!original)}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={ui.btnSecondary} onClick={close} disabled={busy}>
              Cancel
            </button>
            <span className="min-w-0 flex-1 text-sm text-ink/70">{dirty ? "You have unsaved changes." : "No unsaved changes."}</span>
            {original && (
              <button type="button" className={ui.btnLinkDanger} onClick={remove} disabled={busy}>
                Remove unit
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-ink/60">After you save, the syllabus pack (PowerPoint and PDF) is rebuilt automatically, usually within 30 minutes.{!spec ? ` This unit is in: ${halfTermLabel(d.half_term)}.` : ""}</p>
      </div>
    </Modal>
  );
}
