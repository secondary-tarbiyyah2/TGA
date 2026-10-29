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
          out[id] = { label: `${n} pupil${n === 1 ? "" : "s"}`, percent: null };
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
        {meta && <p className="truncate text-xs font-medium uppercase tracking-wide text-ink/65">{meta}</p>}
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-ink group-hover:text-teal-700">{cls.name}</h3>
        <div className="mt-auto pt-4">
          {progress?.percent != null && (
            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress.percent}%` }} />
            </div>
          )}
          <p className="text-xs text-ink/65">{progress?.label ?? " "}</p>
        </div>
      </div>
    </Link>
  );
}

/** One class as a compact row: Moodle's "List" view of My courses. */
function ClassRow({ cls, href, progress }: { cls: ClassSummary; href: string; progress?: Progress }) {
  const meta = [cls.subject, cls.yearGroup].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={href} className="group flex items-center gap-4 rounded-2xl border border-gold-light bg-white p-3 hover:bg-cream/60">
        <span className="h-12 w-16 shrink-0 rounded-lg" style={classBannerStyle(cls.id)} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink group-hover:text-teal-700">{cls.name}</span>
          {meta && <span className="block truncate text-xs text-ink/65">{meta}</span>}
        </span>
        <span className="hidden w-48 shrink-0 sm:block">
          {progress?.percent != null && (
            <span className="mb-1 block h-1.5 overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={progress.label}>
              <span className="block h-full rounded-full bg-teal-500" style={{ width: `${progress.percent}%` }} />
            </span>
          )}
          <span className="block text-xs text-ink/65">{progress?.label ?? " "}</span>
        </span>
      </Link>
    </li>
  );
}

const VIEW_KEY = "tga-classes-view";

/**
 * Moodle's "My courses" overview: search, sort, and a Cards / List switch
 * (remembered in this browser).
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
  const [sort, setSort] = useState<"name" | "subject" | "year">("name");
  const [view, setView] = useState<"cards" | "list">("cards");
  const progress = useCardProgress(viewer, classes || []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this browser's saved view after mount
      if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {
      /* storage unavailable: cards */
    }
  }, []);
  const chooseView = (v: "cards" | "list") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (classes || []).filter((c) => !q || [c.name, c.subject, c.yearGroup].some((v) => v?.toLowerCase().includes(q)));
    const by = (a: ClassSummary, b: ClassSummary) =>
      sort === "subject"
        ? (a.subject || "").localeCompare(b.subject || "") || a.name.localeCompare(b.name)
        : sort === "year"
          ? (a.yearGroup || "").localeCompare(b.yearGroup || "", "en-GB", { numeric: true }) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name);
    return [...list].sort(by);
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
    return <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">{emptyLabel}</p>;
  }

  return (
    <div>
      {controls && classes.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes"
            aria-label="Search classes"
            className="w-full max-w-xs border border-gold-light px-3 py-2 text-sm"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as "name" | "subject" | "year")} aria-label="Sort classes" className="border border-gold-light px-3 py-2 text-sm">
            <option value="name">Sort by class name</option>
            <option value="subject">Sort by subject</option>
            <option value="year">Sort by year group</option>
          </select>
          <div role="group" aria-label="View" className="ml-auto flex overflow-hidden rounded-lg border border-gold-light">
            {(["cards", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={`px-3 py-2 text-sm font-medium ${view === v ? "bg-teal-700 text-white" : "bg-white text-ink/75 hover:bg-cream"}`}
              >
                {v === "cards" ? "Cards" : "List"}
              </button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-ink/65">No classes match &ldquo;{query}&rdquo;.</p>
      ) : view === "list" && controls ? (
        <ul className="space-y-2">
          {shown.map((c) => (
            <ClassRow key={c.id} cls={c} href={hrefFor(c)} progress={progress[c.id]} />
          ))}
        </ul>
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
