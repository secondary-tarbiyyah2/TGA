"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classBannerStyle, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";

type Progress = { label: string; percent: number | null };

/**
 * Per-card progress line, Moodle's "x% complete" equivalent:
 * - student/parent: homework handed in out of homework already due
 * - teacher: how many students are enrolled
 */
function useCardProgress(viewer: ClassViewer, classes: ClassSummary[]): Record<string, Progress> {
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  // Keyed on the ids themselves: callers often pass a fresh array (e.g. a
  // .slice()) on every render, which must not trigger a refetch.
  const idKey = classes.map((c) => c.id).join(",");
  const ids = useMemo(() => (idKey ? idKey.split(",") : []), [idKey]);
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, Progress> = {};
      if (childId) {
        const { data } = await supabase.from("homework_status").select("class_id, status").eq("child_id", childId).in("class_id", ids);
        const rows = (data as { class_id: string; status: string }[]) || [];
        ids.forEach((id) => {
          const mine = rows.filter((r) => r.class_id === id && r.status !== "not_yet_due");
          const done = mine.filter((r) => r.status === "on_time" || r.status === "late").length;
          out[id] =
            mine.length === 0
              ? { label: "No homework due yet", percent: null }
              : { label: `${done} of ${mine.length} homework handed in`, percent: Math.round((done / mine.length) * 100) };
        });
      } else {
        const { data } = await supabase.from("enrolments").select("class_id").in("class_id", ids);
        const rows = (data as { class_id: string }[]) || [];
        ids.forEach((id) => {
          const n = rows.filter((r) => r.class_id === id).length;
          out[id] = { label: `${n} student${n === 1 ? "" : "s"}`, percent: null };
        });
      }
      if (!cancelled) setProgress(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, childId]);

  return progress;
}

export function ClassCard({ cls, href, progress }: { cls: ClassSummary; href: string; progress?: Progress }) {
  const meta = [cls.subject, cls.yearGroup].filter(Boolean).join(" · ");
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gold-light bg-white transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="h-24" style={classBannerStyle(cls.id)} aria-hidden="true" />
      <div className="flex flex-1 flex-col p-4">
        {meta && <p className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">{meta}</p>}
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-ink group-hover:text-teal-700">{cls.name}</h3>
        <div className="mt-auto pt-4">
          {progress?.percent != null && (
            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress.percent}%` }} />
            </div>
          )}
          <p className="text-xs text-ink/55">{progress?.label ?? " "}</p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Moodle's "My courses" card grid, with the same search/sort controls.
 * `hrefFor` builds each card's class-page link (role-specific route).
 */
export function ClassGrid({
  viewer,
  classes,
  hrefFor,
  emptyLabel,
  controls = true,
}: {
  viewer: ClassViewer;
  classes: ClassSummary[] | null;
  hrefFor: (cls: ClassSummary) => string;
  emptyLabel: string;
  /** Search/sort bar; off for the dashboard strip. */
  controls?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "subject">("name");
  const progress = useCardProgress(viewer, classes || []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (classes || []).filter((c) => !q || [c.name, c.subject, c.yearGroup].some((v) => v?.toLowerCase().includes(q)));
    return [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : (a.subject || "").localeCompare(b.subject || "") || a.name.localeCompare(b.name)));
  }, [classes, query, sort]);

  if (classes === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border border-gold-light bg-white" />
        ))}
      </div>
    );
  }

  if (classes.length === 0) {
    return <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/60">{emptyLabel}</p>;
  }

  return (
    <div>
      {controls && classes.length > 3 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes"
            aria-label="Search classes"
            className="w-full max-w-xs border border-gold-light px-3 py-2 text-sm"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as "name" | "subject")} aria-label="Sort classes" className="border border-gold-light px-3 py-2 text-sm">
            <option value="name">Sort by class name</option>
            <option value="subject">Sort by subject</option>
          </select>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-ink/60">No classes match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((c) => (
            <ClassCard key={c.id} cls={c} href={hrefFor(c)} progress={progress[c.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
