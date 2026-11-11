"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { yearLabel } from "@/lib/learn/curriculum";
import { loadReviews, type ReviewRow } from "@/lib/learn/curriculumReview";
import { WorkflowBadge, type WorkflowStatus } from "@/components/learn/kit";
import { EmptyState, LoadingState, ui } from "@/components/learn/ui";

type LessonLite = { id: string; subject_slug: string; subject: string; year: string; unit: string | null; lesson_no: number; title: string };
type Item = ReviewRow & { lesson: LessonLite | null };

const GROUPS: { key: string; title: string; statuses: WorkflowStatus[]; hint: string }[] = [
  { key: "waiting", title: "Waiting for review", statuses: ["submitted", "in_review"], hint: "Submitted by a teacher, or being reviewed." },
  { key: "changes", title: "Changes requested", statuses: ["changes_needed"], hint: "Sent back with a comment; the teacher resubmits when it's done." },
  { key: "approved", title: "Approved, not yet published", statuses: ["approved"], hint: "Publish to make the approved version the one classes use." },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/**
 * Lesson review: everything moving through the review workflow (migration
 * 0192), grouped by what happens next, each row opening the lesson's
 * workspace at its review panel.
 */
export function ReviewQueue({ area }: { area: "teach" | "admin" }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [subject, setSubject] = useState("all");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const reviews = Object.values(await loadReviews()).filter((r) => r.scope === "lesson" && ["submitted", "in_review", "changes_needed", "approved"].includes(r.status));
      const slugs = [...new Set(reviews.map((r) => r.subject_slug))];
      const lessons: LessonLite[] = [];
      if (slugs.length) {
        const { data } = await supabase.from("curriculum_lessons").select("id, subject_slug, subject, year, unit, lesson_no, title").in("subject_slug", slugs).limit(5000);
        lessons.push(...((data as LessonLite[] | null) || []));
      }
      const by = new Map(lessons.map((l) => [`${l.subject_slug}|${l.year}/${l.lesson_no}`, l]));
      if (!alive) return;
      setItems(reviews.map((r) => ({ ...r, lesson: by.get(`${r.subject_slug}|${r.ref}`) || null })).sort((a, b) => (b.checked_at || "").localeCompare(a.checked_at || "")));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const subjects = useMemo(() => [...new Set((items || []).map((i) => i.lesson?.subject).filter(Boolean) as string[])].sort(), [items]);
  if (items === null) return <LoadingState rows={6} label="Loading lessons in review" />;
  const shown = items.filter((i) => subject === "all" || i.lesson?.subject === subject);
  if (items.length === 0)
    return (
      <EmptyState title="Nothing in review" icon="clipboardCheck">
        When a teacher submits a lesson for review it appears here. Open any lesson and use Submit for review.
      </EmptyState>
    );

  return (
    <div data-guide="review-queue" className="space-y-6">
      {subjects.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Subject">
          {["all", ...subjects].map((s) => (
            <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={subject === s ? ui.chipOn : ui.chip}>
              {s === "all" ? "All subjects" : s}
            </button>
          ))}
        </div>
      )}
      {GROUPS.map((g) => {
        const list = shown.filter((i) => g.statuses.includes(i.status));
        if (list.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`rq-${g.key}`}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 id={`rq-${g.key}`} className="text-[0.9375rem] font-semibold text-ink">
                {g.title}
              </h2>
              <span className="text-sm tabular-nums text-ink/55">{list.length}</span>
            </div>
            <p className="mb-3 text-xs text-ink/60">{g.hint}</p>
            <ul className="divide-y divide-gold-light/70 rounded-2xl border border-gold-light bg-white">
              {list.map((i) => (
                <li key={`${i.subject_slug}|${i.ref}`}>
                  {i.lesson ? (
                    <Link href={`/${area}/curriculum/lesson?id=${i.lesson.id}#review`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-cream sm:flex-nowrap">
                      <span className="min-w-[min(100%,16rem)] flex-1">
                        <span className="block text-sm font-semibold text-ink">{i.lesson.title}</span>
                        <span className="block text-xs text-ink/60">
                          {i.lesson.subject} · {yearLabel(i.lesson.year)} · lesson {i.lesson.lesson_no}
                          {i.lesson.unit ? ` · ${i.lesson.unit}` : ""}
                        </span>
                        {i.status === "changes_needed" && i.note && <span className="mt-1 block text-xs text-red-800">{i.note}</span>}
                        {i.changed_since_approval && <span className="mt-1 block text-xs text-amber-900">Changed after approval</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60 sm:shrink-0">
                        <WorkflowBadge status={i.status} />
                        <span>{i.submitted_name ? `${i.submitted_name}, ${when(i.submitted_at)}` : when(i.checked_at)}</span>
                      </span>
                    </Link>
                  ) : (
                    <span className="block px-4 py-3 text-sm text-ink/60">
                      {i.subject_slug} {i.ref} (this lesson is no longer in the library)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
