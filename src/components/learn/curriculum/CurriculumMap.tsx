"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { YEARS, yearLabel } from "@/lib/learn/curriculum";
import { loadReviews, reviewKey, type ReviewRow } from "@/lib/learn/curriculumReview";
import { EmptyState, LoadingState, ui } from "@/components/learn/ui";

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

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Year group">
        {YEARS.map((y) => (
          <button key={y} type="button" aria-pressed={year === y} onClick={() => pick(y)} className={year === y ? ui.chipOn : ui.chip}>
            {yearLabel(y)}
          </button>
        ))}
      </div>

      {units === null ? (
        <LoadingState rows={6} label="Loading the curriculum map" />
      ) : subjects.length === 0 ? (
        <EmptyState title={`No units planned for ${yearLabel(year)} yet`} icon="layoutGrid">
          {error || "Units appear here once they're placed in half terms in the Curriculum planner."}
        </EmptyState>
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
      <p className="text-xs text-ink/60">Hover a unit to see what it builds on and leads to. The bar shows how many of its lessons are approved.</p>
    </div>
  );
}
