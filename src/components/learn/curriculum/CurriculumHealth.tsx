"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { loadReviews } from "@/lib/learn/curriculumReview";

export type CurriculumFigures = { lessons: number; approved: number; waiting: number; changes: number; bySubject: { subject: string; lessons: number; approved: number }[] };

/** Lesson counts and review progress across the whole curriculum (head teacher and admin dashboard). */
export function useCurriculumFigures(): CurriculumFigures | null {
  const [fig, setFig] = useState<CurriculumFigures | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [{ data }, reviews] = await Promise.all([supabase.from("curriculum_lessons").select("subject, subject_slug, year, lesson_no").limit(10000), loadReviews()]);
      if (!alive) return;
      const rows = (data as { subject: string; subject_slug: string; year: string; lesson_no: number }[] | null) || [];
      const by = new Map<string, { subject: string; lessons: number; approved: number }>();
      let approved = 0;
      for (const l of rows) {
        const st = reviews[`${l.subject_slug}|lesson|${l.year}/${l.lesson_no}`]?.status;
        const ok = st === "approved" || st === "published";
        if (ok) approved++;
        const s = by.get(l.subject) || { subject: l.subject, lessons: 0, approved: 0 };
        s.lessons++;
        if (ok) s.approved++;
        by.set(l.subject, s);
      }
      const all = Object.values(reviews).filter((r) => r.scope === "lesson");
      setFig({
        lessons: rows.length,
        approved,
        waiting: all.filter((r) => r.status === "submitted" || r.status === "in_review").length,
        changes: all.filter((r) => r.status === "changes_needed").length,
        bySubject: [...by.values()].sort((a, b) => a.subject.localeCompare(b.subject)),
      });
    })();
    return () => {
      alive = false;
    };
  }, []);
  return fig;
}

/** Curriculum coverage by subject: lessons written and how many are approved. */
export function CurriculumHealth({ figures }: { figures: CurriculumFigures | null }) {
  if (!figures || figures.lessons === 0) return null;
  return (
    <section aria-labelledby="curriculum-health" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-1 pt-4">
        <h2 id="curriculum-health" className="text-[0.9375rem] font-semibold text-ink">
          Curriculum review
        </h2>
        <span className="flex gap-4 text-sm">
          <Link href="/admin/curriculum/review" className="font-medium text-forest-700 hover:underline">
            Lesson review
          </Link>
          <Link href="/admin/curriculum/map" className="font-medium text-forest-700 hover:underline">
            Curriculum map
          </Link>
        </span>
      </div>
      <p className="px-5 text-sm text-ink/65">
        {figures.approved} of {figures.lessons} lessons approved · {figures.waiting} waiting for review · {figures.changes} sent back for changes
      </p>
      <ul className="grid gap-x-8 gap-y-2.5 px-5 pb-5 pt-4 sm:grid-cols-2">
        {figures.bySubject.map((s) => {
          const pct = s.lessons ? Math.round((s.approved / s.lessons) * 100) : 0;
          return (
            <li key={s.subject} className="text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-ink">{s.subject}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink/60">
                  {s.approved}/{s.lessons}
                </span>
              </span>
              <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gold-light">
                <span className="block h-full rounded-full bg-forest-500" style={{ width: `${pct}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
