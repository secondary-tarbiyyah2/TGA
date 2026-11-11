"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { YEARS, yearLabel } from "@/lib/learn/curriculum";
import { HALF_TERMS, TERMS, halfTermFromTitle, type HalfTerm, type WeekPlan } from "@/lib/learn/curriculumUnits";
import { PLAN_SUBJECTS, focusTitle, isFoundingHalfTerm } from "@/lib/learn/syllabusPlan";
import { loadReviews, reviewKey, type ReviewRow } from "@/lib/learn/curriculumReview";
import { useLearnSession } from "@/lib/learn/session";
import { EmptyState, Status, btn, ui, type StatusKind } from "@/components/learn/ui";
import { SidePanel } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { Select } from "@/components/learn/Select";
import { Tabs } from "@/components/learn/Tabs";

/**
 * The Curriculum map (owner brief, 10 Nov 2026): how a year's learning builds across the six
 * half terms, from the Curriculum planner (`curriculum_units`) and the Lesson library
 * (`curriculum_lessons`, with review statuses from `curriculum_signoffs`). Nothing here is
 * made up: a unit shows only what the planner records for it.
 *
 *  - One subject: the year as a timeline of half terms (a horizontal track on wide screens,
 *    a vertical one on phones). Picking a unit opens its detail underneath: what it covers,
 *    skills, vocabulary, what it builds on and leads to, how it is checked, and its lessons.
 *  - Whole year: subjects down the side, half terms across. On narrow screens one half term
 *    at a time instead of a squashed grid. A unit opens in a side panel.
 *
 * Years 10 and 11 follow the exam board's terms (Autumn, Spring, Summer), so their map has
 * three columns. Year, view, subject and unit are kept in the address, so a link opens the
 * same view.
 */

type UnitRow = {
  id: string;
  subject_slug: string;
  subject: string;
  kind: "syllabus" | "spec";
  year: string;
  half_term: HalfTerm | null;
  term: string | null;
  position: number;
  ref: string | null;
  title: string;
  focus: string[] | null;
  skills: string[] | null;
  key_terms: string[] | null;
  assess: string | null;
  prereq: string | null;
  leads_to: string | null;
  weeks: WeekPlan[] | null;
};
type LessonLite = { id: string; subject_slug: string; unit: string | null; lesson_no: number; year: string };
type Col = { key: string; label: string; short: string; term: string; founding: boolean };
type Stats = { total: number; approved: number; waiting: number; libUnit: string | null };
type SubjectRow = { slug: string; name: string; cells: Record<string, UnitRow[]>; unplaced: UnitRow[]; ordered: UnitRow[] };
type View = "subject" | "year";

const UNIT_SELECT = "id, subject_slug, subject, kind, year, half_term, term, position, ref, title, focus, skills, key_terms, assess, prereq, leads_to, weeks";
const YEAR_KEY = "tga-library-year";

const HT_COLS: Col[] = HALF_TERMS.map((h) => ({ key: h.key, label: h.label, short: h.short, term: h.label.split(" ")[0], founding: isFoundingHalfTerm(h.key) }));
const TERM_COLS: Col[] = TERMS.map((t) => ({ key: t, label: `${t} term`, short: t, term: t, founding: t !== "Autumn" }));

/** The half term a date falls in (roughly; for the "now" marker only). */
function halfTermOf(d: Date): HalfTerm {
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 8 || m === 9) return "autumn1";
  if (m === 10 || m === 11) return "autumn2";
  if (m === 0 || (m === 1 && day <= 20)) return "spring1";
  if (m === 1 || m === 2) return "spring2";
  if (m === 3 || m === 4) return "summer1";
  return "summer2";
}

const norm = (s: string) => s.toLowerCase().replace(/^(autumn|spring|summer)\s*\d\s*:\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
const termOfUnit = (u: UnitRow) => TERMS.find((t) => (u.term || "").toLowerCase().startsWith(t.toLowerCase())) || null;
const unitTitle = (u: UnitRow) => (u.kind === "spec" ? u.title : focusTitle(u.title));
const planSlugOf = (slug: string) => PLAN_SUBJECTS.find((s) => s.ks13 === slug || (s.ks4 as readonly string[]).includes(slug))?.slug || slug;

/** The column a unit sits in: its half term (Years 1 to 9) or its term (Years 10 and 11). */
function colOf(u: UnitRow, cols: Col[]): string | null {
  if (cols === TERM_COLS) return u.kind === "spec" ? termOfUnit(u) : u.half_term ? (TERMS.find((t) => u.half_term!.startsWith(t.toLowerCase())) ?? null) : null;
  if (u.kind === "spec") {
    const t = termOfUnit(u);
    return t ? `${t.toLowerCase()}1` : null;
  }
  return u.half_term || halfTermFromTitle(u.title);
}

function statusOf(st: Stats): { kind: StatusKind; text: string } {
  if (!st.total) return { kind: "unavailable", text: "No lessons yet" };
  if (st.approved === st.total) return { kind: "approved", text: `All ${st.total} approved` };
  if (st.waiting) return { kind: "attention", text: `${st.waiting} to review` };
  return { kind: "in_progress", text: `${st.approved} of ${st.total} approved` };
}

function readQuery() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function CurriculumMap({ area }: { area: "teach" | "admin" }) {
  const { roles } = useLearnSession();
  const canEdit = roles.some((r) => r.role === "teacher" || r.role === "head_teacher" || r.role === "admin");
  const [year, setYear] = useState<string>("y7");
  const [view, setView] = useState<View>("subject");
  const [subject, setSubject] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [units, setUnits] = useState<UnitRow[] | null>(null);
  const [lessons, setLessons] = useState<LessonLite[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Start from a link (?year=&view=&subject=&unit=), else the year last looked at.
  useEffect(() => {
    const q = readQuery();
    let y = q.get("year") || "";
    if (!YEARS.includes(y)) {
      try {
        y = window.localStorage.getItem(YEAR_KEY) || "";
      } catch {
        /* storage unavailable */
      }
    }
    /* eslint-disable react-hooks/set-state-in-effect -- restore the linked or remembered view once after mount */
    if (YEARS.includes(y)) setYear(y);
    if (q.get("view") === "year") setView("year");
    if (q.get("subject")) setSubject(q.get("subject"));
    if (q.get("unit")) setUnitId(q.get("unit"));
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep the address in step so the view can be shared or bookmarked.
  useEffect(() => {
    if (!restored) return;
    const q = new URLSearchParams();
    q.set("year", year);
    if (view === "year") q.set("view", "year");
    if (subject) q.set("subject", subject);
    if (unitId && view === "subject") q.set("unit", unitId);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q.toString()}`);
  }, [restored, year, view, subject, unitId]);

  useEffect(() => {
    if (!restored) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear while the new year loads
    setUnits(null);
    setError(null);
    (async () => {
      const [u, l, r] = await Promise.all([
        supabase.from("curriculum_units").select(UNIT_SELECT).eq("year", year).order("subject").order("position"),
        supabase.from("curriculum_lessons").select("id, subject_slug, unit, lesson_no, year").eq("year", year),
        loadReviews().catch(() => ({}) as Record<string, ReviewRow>),
      ]);
      if (!alive) return;
      if (u.error) {
        setError("The curriculum could not be loaded just now.");
        setUnits([]);
        return;
      }
      setUnits((u.data as UnitRow[] | null) || []);
      setLessons((l.data as LessonLite[] | null) || []);
      setReviews(r);
    })();
    return () => {
      alive = false;
    };
  }, [restored, year, attempt]);

  const cols = useMemo(() => ((units || []).some((u) => u.kind === "syllabus") || !(units || []).length ? HT_COLS : TERM_COLS), [units]);

  const subjects = useMemo<SubjectRow[]>(() => {
    const by = new Map<string, SubjectRow>();
    for (const u of units || []) {
      const s = by.get(u.subject_slug) || { slug: u.subject_slug, name: u.subject, cells: {}, unplaced: [], ordered: [] };
      const c = colOf(u, cols);
      if (c) (s.cells[c] ||= []).push(u);
      else s.unplaced.push(u);
      by.set(u.subject_slug, s);
    }
    for (const s of by.values()) {
      for (const k of Object.keys(s.cells)) s.cells[k].sort((a, b) => a.position - b.position);
      s.ordered = [...cols.flatMap((c) => s.cells[c.key] || []), ...s.unplaced];
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [units, cols]);

  /** Lessons in the library for a unit: their unit name matches the plan's title. */
  const statsFor = useCallback(
    (u: UnitRow): Stats => {
      const t = norm(u.title);
      const ls = lessons.filter((l) => l.subject_slug === u.subject_slug && l.unit && (norm(l.unit) === t || norm(l.unit).startsWith(t) || t.startsWith(norm(l.unit))));
      let approved = 0;
      let waiting = 0;
      for (const l of ls) {
        const st = reviews[reviewKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status;
        if (st === "approved" || st === "published") approved++;
        else if (st === "submitted" || st === "in_review") waiting++;
      }
      return { total: ls.length, approved, waiting, libUnit: ls[0]?.unit || null };
    },
    [lessons, reviews],
  );

  const now = halfTermOf(new Date());
  const nowKey = cols === TERM_COLS ? TERMS.find((t) => now.startsWith(t.toLowerCase())) || "" : now;
  const chosen = subjects.find((x) => x.slug === subject) || subjects[0] || null;
  const chosenUnit = chosen ? chosen.ordered.find((u) => u.id === unitId) || (chosen.cells[nowKey] || [])[0] || chosen.ordered[0] || null : null;
  const panelUnit = panelId ? (units || []).find((u) => u.id === panelId) || null : null;

  const links = {
    library: (u: UnitRow, libUnit: string | null) => `/${area}/curriculum?year=${u.year}&subject=${encodeURIComponent(u.subject_slug)}${libUnit ? `&unit=${encodeURIComponent(libUnit)}` : ""}`,
    syllabus: (u: UnitRow) => `/${area}/syllabus?subject=${encodeURIComponent(planSlugOf(u.subject_slug))}&view=years&year=${u.year}&unit=${encodeURIComponent(u.id)}`,
    review: `/${area}/curriculum/review`,
    planner: `/${area}/planner`,
    subjectLibrary: (slug: string, y: string) => `/${area}/curriculum?year=${y}&subject=${encodeURIComponent(slug)}`,
    subjectSyllabus: (planSlug: string, y: string) => `/${area}/syllabus?subject=${encodeURIComponent(planSlug)}&view=years&year=${y}`,
  };

  const pickYear = (y: string) => {
    setYear(y);
    setUnitId(null);
    setPanelId(null);
    try {
      window.localStorage.setItem(YEAR_KEY, y);
    } catch {
      /* ignore */
    }
  };
  const pickSubject = (s: string) => {
    setSubject(s);
    setUnitId(null);
  };

  const loading = !restored || units === null;

  return (
    <div className="space-y-5">
      {/* One control bar: what you are looking at, then how. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3 border-b border-gold-light pb-4">
        <label className="block min-w-0">
          <span className="t-eyebrow mb-1.5 block">Year group</span>
          <Select value={year} onChange={(e) => pickYear(e.target.value)} className={`${ui.select} w-36`} aria-label="Year group">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {yearLabel(y)}
              </option>
            ))}
          </Select>
        </label>
        {view === "subject" && subjects.length > 0 && (
          <label className="block min-w-0">
            <span className="t-eyebrow mb-1.5 block">Subject</span>
            <Select value={chosen?.slug || ""} onChange={(e) => pickSubject(e.target.value)} className={`${ui.select} w-56`} aria-label="Subject">
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div data-guide="map-view" className="w-full sm:ml-auto sm:w-auto">
          <span className="t-eyebrow mb-1.5 block sm:text-right">
            Show
          </span>
          <Tabs
            variant="switch"
            label="Show"
            items={[
              { key: "subject" as View, label: "One subject" },
              { key: "year" as View, label: "Whole year" },
            ]}
            value={view}
            onChange={(v) => {
              setView(v);
              setPanelId(null);
            }}
          />
        </div>
      </div>

      {loading ? (
        <MapLoading year={year} />
      ) : error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gold-light px-6 py-12 text-center">
          <Icon name="circleAlert" className="h-5 w-5 text-red-700" />
          <p className="t-section">{error}</p>
          <p className="t-meta max-w-sm">Check your connection and try again. Nothing has been changed.</p>
          <button type="button" className={btn("secondary", "sm")} onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" /> Try again
          </button>
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          title={`No units planned for ${yearLabel(year)} yet`}
          icon="calendarDays"
          action={
            canEdit ? (
              <Link href={links.planner} className={btn("secondary", "sm")}>
                Open the Curriculum planner
              </Link>
            ) : undefined
          }
        >
          Units appear here once they are placed in half terms in the Curriculum planner.
        </EmptyState>
      ) : view === "subject" && chosen ? (
        <SubjectMap
          key={`${year}:${chosen.slug}`}
          s={chosen}
          year={year}
          cols={cols}
          nowKey={nowKey}
          statsFor={statsFor}
          selected={chosenUnit}
          onSelect={(u) => {
            setUnitId(u.id);
            // The detail opens under the timeline: bring it into view where the timeline is long.
            window.setTimeout(() => {
              const el = document.getElementById("map-unit");
              if (el && el.getBoundingClientRect().top > window.innerHeight - 120) el.scrollIntoView({ block: "start", behavior: "smooth" });
            }, 30);
          }}
          links={links}
          canEdit={canEdit}
        />
      ) : (
        <YearGrid subjects={subjects} year={year} cols={cols} nowKey={nowKey} statsFor={statsFor} onOpen={(u) => setPanelId(u.id)} onSubject={(slug) => { pickSubject(slug); setView("subject"); }} />
      )}

      {panelUnit && (
        <SidePanel
          title={unitTitle(panelUnit)}
          eyebrow={`${panelUnit.subject} · ${yearLabel(panelUnit.year)}`}
          onClose={() => setPanelId(null)}
          label={`${unitTitle(panelUnit)}, ${panelUnit.subject}`}
          footer={<UnitActions u={panelUnit} st={statsFor(panelUnit)} links={links} canEdit={canEdit} />}
        >
          <UnitBody u={panelUnit} cols={cols} subjectUnits={subjects.find((s) => s.slug === panelUnit.subject_slug)?.ordered || []} statsFor={statsFor} onUnit={(u) => setPanelId(u.id)} />
        </SidePanel>
      )}
    </div>
  );
}

/** Loading: a line and a sentence, never shaped like the map itself. */
function MapLoading({ year }: { year: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-16">
      <div className="portal-progress w-40" aria-hidden="true" />
      <p className="t-meta">Loading the {yearLabel(year)} curriculum</p>
    </div>
  );
}

type Links = { library: (u: UnitRow, libUnit: string | null) => string; syllabus: (u: UnitRow) => string; review: string; planner: string; subjectLibrary: (slug: string, y: string) => string; subjectSyllabus: (planSlug: string, y: string) => string };

/** A unit's place in the year: its half term (or term), and whether it is taught in the founding year. */
function placeOf(u: UnitRow, cols: Col[]): string {
  const c = cols.find((x) => x.key === colOf(u, cols));
  if (!c) return "Not placed yet";
  return u.kind === "spec" ? `${termOfUnit(u) || c.term} term${u.ref ? ` · ${u.ref}` : ""}` : c.label;
}

/** The term headings over the columns: Autumn, Spring, Summer, with when each is first taught. */
function TermHeads({ cols, className = "" }: { cols: Col[]; className?: string }) {
  const terms = [...new Set(cols.map((c) => c.term))];
  const per = cols.length / terms.length;
  return (
    <div className={`grid ${className}`} style={{ gridTemplateColumns: `repeat(${terms.length}, minmax(0, 1fr))` }}>
      {terms.map((t, i) => (
        <div key={t} className={`flex items-baseline justify-between gap-2 px-2 pb-2 ${i ? "border-l border-gold-light" : ""}`} style={{ gridColumn: `span 1` }}>
          <span className="text-[0.8125rem] font-semibold text-ink">{t}</span>
          {per > 0 && <span className="t-meta hidden truncate text-xs xl:inline">{t === "Autumn" ? "From September 2027" : "Founding year, 2027"}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * One subject's year: the half terms as a timeline. Each unit is a card on the track; the
 * one picked (by default the current half term's) opens underneath.
 */
function SubjectMap({ s, year, cols, nowKey, statsFor, selected, onSelect, links, canEdit }: { s: SubjectRow; year: string; cols: Col[]; nowKey: string; statsFor: (u: UnitRow) => Stats; selected: UnitRow | null; onSelect: (u: UnitRow) => void; links: Links; canEdit: boolean }) {
  const totals = s.ordered.reduce(
    (a, u) => {
      const st = statsFor(u);
      return { lessons: a.lessons + st.total, approved: a.approved + st.approved };
    },
    { lessons: 0, approved: 0 },
  );
  const planSlug = planSlugOf(s.slug);
  return (
    <section aria-labelledby="map-subject" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 id="map-subject" className="text-lg font-semibold tracking-tight text-ink">
            {s.name} <span className="font-normal text-ink-500">· {yearLabel(year)}</span>
          </h2>
          <p className="t-meta mt-0.5">
            {s.ordered.length} unit{s.ordered.length === 1 ? "" : "s"} · {totals.lessons ? `${totals.lessons} lessons written, ${totals.approved} approved` : "no lessons written yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Link href={links.subjectLibrary(s.slug, year)} className={btn("ghost", "sm")}>
            <Icon name="library" size="sm" /> Lesson library
          </Link>
          <Link href={links.subjectSyllabus(planSlug, year)} className={btn("ghost", "sm")}>
            <Icon name="scrollText" size="sm" /> Syllabus
          </Link>
        </div>
      </header>

      <div data-guide="map-grid" className="@container">
        {/* Wide: a horizontal track, one column per half term. */}
        <div className="hidden @4xl:block">
          <TermHeads cols={cols} />
          <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
            <span aria-hidden="true" className="pointer-events-none absolute left-0 right-0 top-[1.0625rem] h-px bg-gold-light" />
            {cols.map((c) => {
              const list = s.cells[c.key] || [];
              const here = c.key === nowKey;
              return (
                <li key={c.key} className="relative min-w-0 px-1.5" aria-label={c.label}>
                  <div className="flex h-9 items-center gap-2 px-1">
                    <span aria-hidden="true" className={`relative z-[1] h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[var(--portal-canvas)] ${list.length ? "bg-forest-500" : "border border-ink/25 bg-[var(--portal-canvas)]"}`} />
                    <span className={`truncate text-xs font-semibold ${here ? "text-forest-800" : "text-ink-500"}`}>{c.short}</span>
                    {here && <span className="rounded-full bg-forest-100 px-1.5 py-px text-[0.625rem] font-semibold text-forest-800">Now</span>}
                  </div>
                  <div className="mt-1 space-y-2">
                    {list.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gold-light px-3 py-4 text-xs text-ink-500">Nothing planned</p>
                    ) : (
                      list.map((u) => <UnitCard key={u.id} u={u} st={statsFor(u)} on={selected?.id === u.id} onSelect={onSelect} />)
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Narrow: the same timeline, running down the page. */}
        <ol className="@4xl:hidden">
          {cols.map((c, i) => {
            const list = s.cells[c.key] || [];
            const here = c.key === nowKey;
            return (
              <li key={c.key} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
                <span aria-hidden="true" className={`absolute left-[0.5625rem] top-3 w-px bg-gold-light ${i === cols.length - 1 ? "h-0" : "bottom-0"}`} />
                <span aria-hidden="true" className={`relative z-[1] mt-[0.4375rem] h-2.5 w-2.5 justify-self-center rounded-full ring-4 ring-[var(--portal-canvas)] ${list.length ? "bg-forest-500" : "border border-ink/25 bg-[var(--portal-canvas)]"}`} />
                <div className="min-w-0 pb-5">
                  <p className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${here ? "text-forest-800" : "text-ink-500"}`}>{c.label}</span>
                    {here && <span className="rounded-full bg-forest-100 px-1.5 py-px text-[0.625rem] font-semibold text-forest-800">Now</span>}
                    {cols === HT_COLS && <span className="t-meta text-xs">{c.founding ? "· founding year" : "· from Sept 2027"}</span>}
                  </p>
                  <div className="mt-2 space-y-2">
                    {list.length === 0 ? <p className="text-xs text-ink-500">Nothing planned</p> : list.map((u) => <UnitCard key={u.id} u={u} st={statsFor(u)} on={selected?.id === u.id} onSelect={onSelect} />)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {s.unplaced.length > 0 && (
        <p className="t-meta">
          {s.unplaced.length} unit{s.unplaced.length === 1 ? " is" : "s are"} not placed in a half term yet{canEdit ? "; place them in the Planner." : "."}
        </p>
      )}

      {selected && (
        <article key={selected.id} aria-labelledby="map-unit" className="portal-reveal rounded-2xl border border-gold-light bg-white">
          <header className="border-b border-gold-light px-5 py-4 sm:px-6">
            <p className="t-eyebrow">
              {placeOf(selected, cols)} · {s.name}
            </p>
            <h3 id="map-unit" className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink">
              {unitTitle(selected)}
            </h3>
          </header>
          <div className="px-5 py-5 sm:px-6">
            <UnitBody u={selected} cols={cols} subjectUnits={s.ordered} statsFor={statsFor} onUnit={onSelect} />
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-gold-light px-5 py-3 sm:px-6">
            <UnitActions u={selected} st={statsFor(selected)} links={links} canEdit={canEdit} />
          </footer>
        </article>
      )}
    </section>
  );
}

/** A unit on the timeline: its title, and how far its lessons have got. */
function UnitCard({ u, st, on, onSelect }: { u: UnitRow; st: Stats; on: boolean; onSelect: (u: UnitRow) => void }) {
  const s = statusOf(st);
  const pct = st.total ? Math.round((st.approved / st.total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(u)}
      aria-pressed={on}
      className={`group block w-full rounded-lg border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 ${on ? "border-forest-700 bg-white shadow-[0_0_0_1px_var(--color-forest-700)]" : "border-gold-light bg-white hover:border-ink/25"}`}
    >
      {u.kind === "spec" && u.ref && <span className="mb-1 block text-[0.6875rem] font-semibold tabular-nums text-forest-700">{u.ref}</span>}
      <span className="line-clamp-3 block text-[0.8125rem] font-semibold leading-snug text-ink">{unitTitle(u)}</span>
      <span className="mt-2 block">
        <Status kind={s.kind}>{s.text}</Status>
      </span>
      {st.total > 0 && (
        <span aria-hidden="true" className="mt-2 block h-[3px] overflow-hidden rounded-full bg-[var(--portal-sunken)]">
          <span className="block h-full rounded-full bg-forest-500" style={{ width: `${pct}%` }} />
        </span>
      )}
    </button>
  );
}

/** What a unit is: covered knowledge, skills, vocabulary, how it is checked, where it sits in the progression. */
function UnitBody({ u, cols, subjectUnits, statsFor, onUnit }: { u: UnitRow; cols: Col[]; subjectUnits: UnitRow[]; statsFor: (u: UnitRow) => Stats; onUnit: (u: UnitRow) => void }) {
  const [allFocus, setAllFocus] = useState(false);
  const focus = u.focus || [];
  const skills = u.skills || [];
  const terms = u.key_terms || [];
  const weeks = u.weeks || [];
  const i = subjectUnits.findIndex((x) => x.id === u.id);
  const prev = i > 0 ? subjectUnits[i - 1] : null;
  const next = i >= 0 && i < subjectUnits.length - 1 ? subjectUnits[i + 1] : null;
  const st = statsFor(u);
  const s = statusOf(st);
  const shown = allFocus ? focus : focus.slice(0, 5);
  return (
    <div className="space-y-6">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Lessons</dt>
          <dd>
            <Status kind={s.kind}>{s.text}</Status>
          </dd>
        </div>
        <div className="flex items-center gap-1.5 text-ink-500">
          <dt className="sr-only">Placed in</dt>
          <dd className="text-xs">{placeOf(u, cols)}</dd>
        </div>
        {weeks.length > 0 && (
          <div className="flex items-center gap-1.5 text-ink-500">
            <dt className="sr-only">Week-by-week plan</dt>
            <dd className="text-xs">{weeks.length}-week plan</dd>
          </div>
        )}
      </dl>

      {/* Progression: what came before and what comes next, in the plan and in the planner's own words. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gold-light bg-gold-light sm:grid-cols-2">
        <Progress label="Builds on" text={u.prereq} unit={prev} dir="prev" onUnit={onUnit} />
        <Progress label="Leads to" text={u.leads_to} unit={next} dir="next" onUnit={onUnit} />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-label={u.kind === "spec" ? "What the specification requires" : "Key knowledge"}>
          <h4 className="t-eyebrow">{u.kind === "spec" ? "What the specification requires" : "Key knowledge"}</h4>
          {focus.length ? (
            <>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
                {shown.map((x, k) => (
                  <li key={k} className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-1.5">
                    <span aria-hidden="true" className="mt-[0.5rem] h-1 w-1 rounded-full bg-forest-500" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              {focus.length > 5 && (
                <button type="button" onClick={() => setAllFocus((v) => !v)} className="mt-2 text-xs font-semibold text-forest-700 hover:underline">
                  {allFocus ? "Show fewer" : `Show all ${focus.length}`}
                </button>
              )}
            </>
          ) : (
            <p className="t-meta mt-2">Not recorded in the planner yet.</p>
          )}
        </section>
        <div className="space-y-5">
          {skills.length > 0 && (
            <section aria-label="Skills">
              <h4 className="t-eyebrow">Skills</h4>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {skills.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {terms.length > 0 && (
            <section aria-label="Vocabulary">
              <h4 className="t-eyebrow">Vocabulary</h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {terms.map((x) => (
                  <li key={x} className="rounded-md bg-[var(--portal-sunken)] px-2 py-0.5 text-xs text-ink-700">
                    {x}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {u.assess && (
            <section aria-label="How it is checked">
              <h4 className="t-eyebrow">How it is checked</h4>
              <p className="mt-2 text-sm text-ink-700">{u.assess}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Progress({ label, text, unit, dir, onUnit }: { label: string; text: string | null; unit: UnitRow | null; dir: "prev" | "next"; onUnit: (u: UnitRow) => void }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3">
      <p className="t-eyebrow flex items-center gap-1">
        {dir === "prev" && <Icon name="arrowLeft" className="h-3 w-3" />}
        {label}
        {dir === "next" && <Icon name="arrowRight" className="h-3 w-3" />}
      </p>
      {text && !(unit && norm(text).includes(norm(unitTitle(unit)))) ? <p className="mt-1 text-sm text-ink-700">{text}</p> : !unit && <p className="t-meta mt-1">Not recorded</p>}
      {unit && (
        <button type="button" onClick={() => onUnit(unit)} className="mt-1 block max-w-full text-left text-sm font-medium text-forest-700 hover:underline">
          {unitTitle(unit)}
        </button>
      )}
    </div>
  );
}

/** The next steps from a unit: its lessons, the review queue, the syllabus, the planner. */
function UnitActions({ u, st, links, canEdit }: { u: UnitRow; st: Stats; links: Links; canEdit: boolean }) {
  return (
    <>
      {st.waiting > 0 && (
        <Link href={links.review} className={btn("primary", "sm")}>
          Review {st.waiting} lesson{st.waiting === 1 ? "" : "s"}
        </Link>
      )}
      <Link href={links.library(u, st.libUnit)} className={btn(st.waiting ? "secondary" : "primary", "sm")}>
        <Icon name="library" size="sm" /> {st.total ? `Open ${st.total} lesson${st.total === 1 ? "" : "s"}` : "Lesson library"}
      </Link>
      <Link href={links.syllabus(u)} className={btn("secondary", "sm")}>
        <Icon name="scrollText" size="sm" /> Weekly plan and syllabus
      </Link>
      {canEdit && (
        <Link href={links.planner} className={`${btn("ghost", "sm")} sm:ml-auto`}>
          <Icon name="pencil" size="sm" /> Edit in the Planner
        </Link>
      )}
    </>
  );
}

/**
 * The whole year: every subject against the half terms. Wide screens get the grid; narrow
 * ones pick a half term and see each subject's unit for it (a squashed grid is unreadable).
 */
function YearGrid({ subjects, year, cols, nowKey, statsFor, onOpen, onSubject }: { subjects: SubjectRow[]; year: string; cols: Col[]; nowKey: string; statsFor: (u: UnitRow) => Stats; onOpen: (u: UnitRow) => void; onSubject: (slug: string) => void }) {
  const [col, setCol] = useState<string>(cols.some((c) => c.key === nowKey) ? nowKey : cols[0].key);
  const grid = { gridTemplateColumns: `9.5rem repeat(${cols.length}, minmax(0, 1fr))` };
  return (
    <section data-guide="map-grid" aria-label={`${yearLabel(year)}: every subject by half term`} className="@container">
      <div className="hidden overflow-hidden rounded-2xl border border-gold-light bg-white @4xl:block">
        <div className="grid border-b border-gold-light bg-cream/60" style={grid}>
          <div className="t-eyebrow flex items-end px-4 pb-2.5">Subject</div>
          {cols.map((c, i) => (
            <div key={c.key} className={`border-l border-gold-light px-3 pb-2.5 pt-3 ${c.key === nowKey ? "bg-forest-50" : ""}`}>
              {cols === HT_COLS && (i === 0 || cols[i - 1].term !== c.term ? <p className="text-[0.6875rem] font-semibold text-ink">{c.term}</p> : <p className="text-[0.6875rem] text-transparent" aria-hidden="true">.</p>)}
              <p className={`flex items-center gap-1.5 text-xs font-semibold ${c.key === nowKey ? "text-forest-800" : "text-ink-500"}`}>
                {c.label}
                {c.key === nowKey && <span className="rounded-full bg-forest-100 px-1.5 py-px text-[0.625rem]">Now</span>}
              </p>
            </div>
          ))}
        </div>
        <ul>
          {subjects.map((s) => {
            const t = s.ordered.reduce((a, u) => {
              const st = statsFor(u);
              return { total: a.total + st.total, approved: a.approved + st.approved };
            }, { total: 0, approved: 0 });
            return (
              <li key={s.slug} className="grid border-b border-gold-light last:border-b-0" style={grid}>
                <div className="px-4 py-3">
                  <button type="button" onClick={() => onSubject(s.slug)} className="text-left text-sm font-semibold text-ink hover:text-forest-700 hover:underline">
                    {s.name}
                  </button>
                  <p className="t-meta mt-0.5 text-xs">{t.total ? `${t.approved} of ${t.total} approved` : "No lessons yet"}</p>
                  {s.unplaced.length > 0 && <p className="t-meta text-xs">{s.unplaced.length} not placed</p>}
                </div>
                {cols.map((c) => (
                  <div key={c.key} className={`min-w-0 space-y-1 border-l border-gold-light p-1.5 ${c.key === nowKey ? "bg-forest-50/50" : ""}`}>
                    {(s.cells[c.key] || []).map((u) => (
                      <GridUnit key={u.id} u={u} st={statsFor(u)} onOpen={onOpen} />
                    ))}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3 @4xl:hidden">
        <Tabs variant="switch" label="Half term" items={cols.map((c) => ({ key: c.key, label: c.key === nowKey ? `${c.short} (now)` : c.short }))} value={col} onChange={setCol} />
        <ul className="divide-y divide-gold-light overflow-hidden rounded-2xl border border-gold-light bg-white">
          {subjects.map((s) => {
            const list = s.cells[col] || [];
            return (
              <li key={s.slug} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:px-4">
                <button type="button" onClick={() => onSubject(s.slug)} className="self-start pt-1.5 text-left text-[0.8125rem] font-semibold text-ink">
                  {s.name}
                </button>
                <div className="min-w-0 space-y-1">{list.length ? list.map((u) => <GridUnit key={u.id} u={u} st={statsFor(u)} onOpen={onOpen} />) : <p className="pt-1.5 text-xs text-ink-500">Nothing planned</p>}</div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="t-meta mt-3 text-xs">Select a unit to see what it covers, what it builds on and its lessons. Select a subject to see its year as a timeline.</p>
    </section>
  );
}

function GridUnit({ u, st, onOpen }: { u: UnitRow; st: Stats; onOpen: (u: UnitRow) => void }): ReactNode {
  const s = statusOf(st);
  return (
    <button type="button" onClick={() => onOpen(u)} className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-cream">
      <span className="line-clamp-3 block text-[0.8125rem] font-medium leading-snug text-ink">
        {u.kind === "spec" && u.ref ? <span className="mr-1 font-semibold text-forest-700">{u.ref}</span> : null}
        {unitTitle(u)}
      </span>
      <span className="mt-1 block">
        <Status kind={s.kind} className="!text-[0.6875rem]">
          {s.text}
        </Status>
      </span>
    </button>
  );
}
