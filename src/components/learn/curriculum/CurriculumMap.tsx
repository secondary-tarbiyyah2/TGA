"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { YEARS, yearLabel } from "@/lib/learn/curriculum";
import { loadReviews, reviewKey, type ReviewRow } from "@/lib/learn/curriculumReview";
import { EmptyState, LoadingState, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

const HALF_TERMS = [
  { key: "autumn1", label: "Autumn 1" },
  { key: "autumn2", label: "Autumn 2" },
  { key: "spring1", label: "Spring 1" },
  { key: "spring2", label: "Spring 2" },
  { key: "summer1", label: "Summer 1" },
  { key: "summer2", label: "Summer 2" },
] as const;
type HalfTerm = (typeof HALF_TERMS)[number]["key"];

type UnitRow = { id: string; subject_slug: string; subject: string; year: string; half_term: HalfTerm | null; position: number; title: string; prereq: string | null; leads_to: string | null };
type LessonLite = { id: string; subject_slug: string; unit: string | null; lesson_no: number; year: string };

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

/**
 * The curriculum map (owner brief, Nov 2026): one year group, every subject,
 * the six half terms side by side, so staff see how units follow on from one
 * another instead of treating each unit on its own. Each unit shows its
 * lessons and how many are approved, and opens in the Lesson library.
 */
export function CurriculumMap({ area }: { area: "teach" | "admin" }) {
  const [year, setYear] = useState<string>("y7");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("tga-library-year");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the year last looked at in the Lesson library
      if (saved && YEARS.includes(saved)) setYear(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const [units, setUnits] = useState<UnitRow[] | null>(null);
  const [lessons, setLessons] = useState<LessonLite[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"subject" | "year">("subject");
  const [subject, setSubject] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear while the new year loads
    setUnits(null);
    (async () => {
      const [u, l, r] = await Promise.all([
        supabase.from("curriculum_units").select("id, subject_slug, subject, year, half_term, position, title, prereq, leads_to").eq("year", year).order("subject").order("position"),
        supabase.from("curriculum_lessons").select("id, subject_slug, unit, lesson_no, year").eq("year", year),
        loadReviews(),
      ]);
      if (!alive) return;
      setError(u.error ? "The curriculum planner isn't available yet." : null);
      setUnits((u.data as UnitRow[] | null) || []);
      setLessons((l.data as LessonLite[] | null) || []);
      setReviews(r);
    })();
    return () => {
      alive = false;
    };
  }, [year]);

  const subjects = useMemo(() => {
    const by = new Map<string, { slug: string; name: string; cells: Record<string, UnitRow[]>; unplaced: UnitRow[] }>();
    for (const u of units || []) {
      const s = by.get(u.subject_slug) || { slug: u.subject_slug, name: u.subject, cells: {}, unplaced: [] };
      if (u.half_term) (s.cells[u.half_term] ||= []).push(u);
      else s.unplaced.push(u);
      by.set(u.subject_slug, s);
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [units]);

  /** Lessons in the library for a unit: their unit name matches the plan's title. */
  const lessonsFor = (u: UnitRow) => {
    const t = norm(u.title);
    return lessons.filter((l) => l.subject_slug === u.subject_slug && l.unit && (norm(l.unit) === t || norm(l.unit).startsWith(t) || t.startsWith(norm(l.unit))));
  };
  const now = halfTermOf(new Date());
  const pick = (y: string) => {
    setYear(y);
    try {
      window.localStorage.setItem("tga-library-year", y);
    } catch {
      /* ignore */
    }
  };

  const statsFor = (u: UnitRow) => {
    const ls = lessonsFor(u);
    const approved = ls.filter((l) => {
      const st = reviews[reviewKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status;
      return st === "approved" || st === "published";
    }).length;
    const waiting = ls.filter((l) => {
      const st = reviews[reviewKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status;
      return st === "submitted" || st === "in_review";
    }).length;
    return { total: ls.length, approved, waiting, libUnit: ls[0]?.unit || null };
  };
  const hrefFor = (u: UnitRow, libUnit: string | null) => `/${area}/curriculum?year=${year}&subject=${encodeURIComponent(u.subject_slug)}${libUnit ? `&unit=${encodeURIComponent(libUnit)}` : ""}`;
  const chosen = subjects.find((x) => x.slug === subject) || subjects[0] || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block text-sm font-medium text-ink">
          Year group
          <Select value={year} onChange={(e) => pick(e.target.value)} className={`${ui.select} mt-1 min-w-40`}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {yearLabel(y)}
              </option>
            ))}
          </Select>
        </label>
        <div role="group" aria-label="Show" className="inline-flex gap-0.5 rounded-xl bg-gold-100/70 p-1">
          {(
            [
              ["subject", "One subject"],
              ["year", "Whole year"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`min-h-9 rounded-lg px-3 text-sm font-medium transition-colors ${view === k ? "bg-white text-forest-900 shadow-sm" : "text-ink/70 hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {units === null ? (
        <LoadingState rows={6} label="Loading the curriculum map" />
      ) : subjects.length === 0 ? (
        <EmptyState title={`No units planned for ${yearLabel(year)} yet`} icon="layoutGrid">
          {error || "Units appear here once they're placed in half terms in the Curriculum planner."}
        </EmptyState>
      ) : view === "subject" ? (
        <SubjectView subjects={subjects} chosen={chosen} onChoose={setSubject} statsFor={statsFor} hrefFor={hrefFor} now={now} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gold-light bg-white">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              {yearLabel(year)} curriculum map: units by subject and half term
            </caption>
            <thead>
              <tr className="border-b border-gold-light">
                <th scope="col" className="sticky left-0 z-10 w-40 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink/55">
                  Subject
                </th>
                {HALF_TERMS.map((h) => (
                  <th key={h.key} scope="col" className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider ${h.key === now ? "text-forest-700" : "text-ink/55"}`}>
                    {h.label}
                    {h.key === now && <span className="ml-1.5 rounded-full bg-forest-100 px-1.5 py-0.5 text-[0.625rem] normal-case tracking-normal text-forest-800">Now</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.slug} className="border-b border-gold-light/70 align-top last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-semibold text-ink">
                    {s.name}
                    {s.unplaced.length > 0 && <span className="mt-0.5 block text-xs font-normal text-ink/55">{s.unplaced.length} not placed yet</span>}
                  </th>
                  {HALF_TERMS.map((h) => (
                    <td key={h.key} className={`px-2 py-2 ${h.key === now ? "bg-forest-50/60" : ""}`}>
                      <ul className="space-y-1.5">
                        {(s.cells[h.key] || []).map((u) => {
                          const ls = lessonsFor(u);
                          const approved = ls.filter((l) => {
                            const st = reviews[reviewKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status;
                            return st === "approved" || st === "published";
                          }).length;
                          const libUnit = ls[0]?.unit;
                          const href = `/${area}/curriculum?year=${year}&subject=${encodeURIComponent(u.subject_slug)}${libUnit ? `&unit=${encodeURIComponent(libUnit)}` : ""}`;
                          return (
                            <li key={u.id}>
                              <Link href={href} title={[u.prereq ? `Builds on: ${u.prereq}` : "", u.leads_to ? `Leads to: ${u.leads_to}` : ""].filter(Boolean).join("\n") || undefined} className="block rounded-lg px-2 py-1.5 hover:bg-cream">
                                <span className="block text-[0.8125rem] font-medium leading-snug text-ink">{u.title}</span>
                                <span className="mt-0.5 block text-xs text-ink/55">
                                  {ls.length ? `${ls.length} lesson${ls.length === 1 ? "" : "s"}` : "No lessons yet"}
                                  {ls.length > 0 && ` · ${approved} approved`}
                                </span>
                                {ls.length > 0 && (
                                  <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-gold-light">
                                    <span className="block h-full rounded-full bg-forest-500" style={{ width: `${Math.round((approved / ls.length) * 100)}%` }} />
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "year" && <p className="text-xs text-ink/60">Hover a unit to see what it builds on and leads to. The bar shows how many of its lessons are approved.</p>}
    </div>
  );
}

type SubjectRow = { slug: string; name: string; cells: Record<string, UnitRow[]>; unplaced: UnitRow[] };
type Stats = { total: number; approved: number; waiting: number; libUnit: string | null };

/**
 * One subject at a time (owner, Nov 2026: the full grid was too crowded): the
 * subjects down the side with lessons approved out of planned, and the chosen
 * subject's year as one list of half terms, each with one clear next step.
 */
function SubjectView({
  subjects,
  chosen,
  onChoose,
  statsFor,
  hrefFor,
  now,
}: {
  subjects: SubjectRow[];
  chosen: SubjectRow | null;
  onChoose: (slug: string) => void;
  statsFor: (u: UnitRow) => Stats;
  hrefFor: (u: UnitRow, libUnit: string | null) => string;
  now: HalfTerm;
}) {
  const totals = (s: SubjectRow) => {
    let total = 0;
    let approved = 0;
    for (const u of [...Object.values(s.cells).flat(), ...s.unplaced]) {
      const st = statsFor(u);
      total += st.total;
      approved += st.approved;
    }
    return { total, approved };
  };
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <nav aria-label="Subjects" className="lg:w-64 lg:shrink-0">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
          {subjects.map((s) => {
            const on = chosen?.slug === s.slug;
            const t = totals(s);
            return (
              <li key={s.slug} className="shrink-0">
                <button type="button" aria-current={on ? "true" : undefined} onClick={() => onChoose(s.slug)} className={`flex w-full min-w-40 flex-col gap-1.5 rounded-xl px-3.5 py-2.5 text-left transition-colors ${on ? "bg-forest-100 text-forest-900" : "text-ink hover:bg-cream"}`}>
                  <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                    {s.name}
                    <span className="text-xs font-medium text-ink/65">{t.total ? `${t.approved}/${t.total}` : "No lessons"}</span>
                  </span>
                  <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-gold-light/70">
                    <span className="block h-full rounded-full bg-forest-700" style={{ width: `${t.total ? Math.round((t.approved / t.total) * 100) : 0}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 hidden px-1 text-xs text-ink/60 lg:block">Lessons approved out of lessons written.</p>
      </nav>

      {chosen && (
        <section aria-labelledby="map-subject" className="min-w-0 flex-1 rounded-2xl border border-gold-light bg-white p-5 sm:p-6">
          <h2 id="map-subject" className="font-serif text-h3 font-semibold text-forest-900">
            {chosen.name}
          </h2>
          <ol className="mt-3">
            {HALF_TERMS.map((h) => {
              const list = chosen.cells[h.key] || [];
              return (
                <li key={h.key} className="flex flex-col gap-3 border-t border-gold-light/70 py-4 sm:flex-row sm:items-start">
                  <span className={`w-24 shrink-0 text-sm font-semibold ${h.key === now ? "text-forest-700" : "text-gold-700"}`}>
                    {h.label}
                    {h.key === now && <span className="ml-1.5 rounded-full bg-forest-100 px-1.5 py-0.5 text-[0.625rem] text-forest-800">Now</span>}
                  </span>
                  {list.length === 0 ? (
                    <p className="flex-1 text-sm text-ink/60">Nothing planned yet</p>
                  ) : (
                    <ul className="flex-1 space-y-3">
                      {list.map((u) => {
                        const st = statsFor(u);
                        const pct = st.total ? Math.round((st.approved / st.total) * 100) : 0;
                        const label = st.waiting ? `Review ${st.waiting}` : "Open";
                        const tone = !st.total ? "bg-gold-100 text-gold-900" : st.approved === st.total ? "bg-forest-100 text-forest-900" : st.waiting ? "bg-teal-100 text-teal-900" : "bg-gold-100 text-gold-900";
                        const status = !st.total ? "No lessons yet" : st.approved === st.total ? "All approved" : st.waiting ? `${st.waiting} waiting for approval` : "Being written";
                        return (
                          <li key={u.id} className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1 basis-60">
                              <p className="text-base font-semibold text-ink">{u.title}</p>
                              {st.total > 0 && (
                                <p className="mt-1 flex items-center gap-2 text-xs text-ink/70">
                                  <span aria-hidden="true" className="block h-1.5 w-32 overflow-hidden rounded-full bg-gold-light/70">
                                    <span className="block h-full rounded-full bg-forest-700" style={{ width: `${pct}%` }} />
                                  </span>
                                  {st.approved} of {st.total} lessons approved
                                </p>
                              )}
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>
                            <Link href={hrefFor(u, st.libUnit)} className={`${st.waiting ? ui.btnPrimary : ui.btnSecondary} ${ui.sm} min-w-20`}>
                              {label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {chosen.unplaced.length > 0 && <p className="mt-2 text-xs text-ink/60">{chosen.unplaced.length} unit{chosen.unplaced.length === 1 ? " isn't" : "s aren't"} placed in a half term yet. Place them in the Planner.</p>}
        </section>
      )}
    </div>
  );
}
