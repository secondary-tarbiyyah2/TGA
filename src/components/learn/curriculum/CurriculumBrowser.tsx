"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { YEARS, yearLabel } from "@/lib/learn/curriculum";
import { HALF_TERMS, TERMS, halfTermFromTitle, halfTermLabel, type WeekPlan } from "@/lib/learn/curriculumUnits";
import { PLAN_SUBJECTS, focusTitle } from "@/lib/learn/syllabusPlan";
import { loadReviews, reviewKey, type ReviewRow } from "@/lib/learn/curriculumReview";
import { RESOURCE_COLUMNS, SOURCE_LABEL, typeLabel, type CurriculumResource } from "@/lib/learn/resources";
import { ActionsMenu, Loading, SidePanel, WorkflowBadge, type MenuAction, type WorkflowStatus } from "@/components/learn/kit";
import { Icon, type IconName } from "@/components/learn/Icon";
import { Notice, btn, ui } from "@/components/learn/ui";
import { useResourceActions } from "@/components/learn/curriculum/TermResources";
import { UnitWeeksPanel } from "@/components/learn/curriculum/UnitPanels";

/*
 * The Curriculum as ONE browser, like a drive (owner, 11 Nov 2026, feedback 2, items 14 and 18):
 * folders Year > Subject > Unit, and in a unit its Lessons, Resources and the weekly plan; a
 * breadcrumb, grid or list view, search and filter chips, and a details pane for whatever is
 * selected. Opening a lesson goes to its own focused workspace page (with Back). Nothing here
 * scrolls the page: opening a folder replaces the folder's contents in place.
 * The address keeps the Lesson library's `year`, `subject` and `unit`, so older links land in
 * the same folder; `classic=1` on a unit opens the unit's tools (spec points, connections,
 * revision pack, pupil results).
 */

type Area = "admin" | "teach";
type UnitRow = { id: string; subject_slug: string; subject: string; kind: "syllabus" | "spec"; year: string; half_term: string | null; term: string | null; position: number; title: string; weeks: WeekPlan[] | null };
type LessonRow = { id: string; subject_slug: string; subject: string; unit: string | null; lesson_no: number; year: string; title: string; objectives: string[] | null };
type Kind = "all" | "lessons" | "resources";
type StatusFilter = "all" | "approved" | "review" | "draft";

type Folder = { key: string; label: string; meta: string; icon: IconName; progress?: { done: number; total: number }; open: () => void; details: () => ReactNode };
type FileItem =
  | { type: "lesson"; key: string; lesson: LessonRow; status: WorkflowStatus | null }
  | { type: "resource"; key: string; resource: CurriculumResource }
  | { type: "plan"; key: string; unit: UnitRow };

const norm = (s: string) => s.toLowerCase().replace(/^(autumn|spring|summer)\s*\d\s*:\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
const unitName = (u: UnitRow) => (u.kind === "spec" ? u.title : focusTitle(u.title));
const planSlugOf = (slug: string) => PLAN_SUBJECTS.find((s) => s.ks13 === slug || (s.ks4 as readonly string[]).includes(slug))?.slug || slug;
const sameUnit = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};
const placeOf = (u: UnitRow) => {
  const ht = u.half_term || halfTermFromTitle(u.title);
  if (ht) return { order: HALF_TERMS.findIndex((h) => h.key === ht), label: halfTermLabel(ht) };
  const t = TERMS.findIndex((x) => (u.term || "").toLowerCase().startsWith(x.toLowerCase()));
  return t >= 0 ? { order: t * 2, label: TERMS[t] } : { order: 99, label: "" };
};
const VIEW_KEY = "tga-curriculum-view";

function useYearData(year: string | null) {
  const [units, setUnits] = useState<UnitRow[] | null>(null);
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [resources, setResources] = useState<CurriculumResource[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!year) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear while the year loads
    setUnits(null);
    setLessons(null);
    setResources(null);
    (async () => {
      const [u, l] = await Promise.all([
        supabase.from("curriculum_units").select("id, subject_slug, subject, kind, year, half_term, term, position, title, weeks").eq("year", year).order("subject").order("position"),
        supabase.from("curriculum_lessons").select("id, subject_slug, subject, unit, lesson_no, year, title, objectives").eq("year", year).order("lesson_no"),
      ]);
      if (!alive) return;
      setFailed(!!(u.error || l.error));
      setUnits((u.data as UnitRow[] | null) || []);
      setLessons((l.data as LessonRow[] | null) || []);
      const out: CurriculumResource[] = [];
      for (let from = 0; ; from += 1000) {
        const r = await supabase.from("curriculum_resources").select(RESOURCE_COLUMNS).eq("year", year).order("subject_slug").order("id").range(from, from + 999);
        if (r.error) break;
        out.push(...((r.data as unknown as CurriculumResource[]) || []));
        if (!r.data || r.data.length < 1000) break;
      }
      if (alive) setResources(out);
    })();
    return () => {
      alive = false;
    };
  }, [year]);
  return { units, lessons, resources, failed };
}

export function CurriculumBrowser({ area }: { area: Area }) {
  const params = useSearchParams();
  const router = useRouter();
  const year = params.get("year");
  const subject = params.get("subject");
  const unit = params.get("unit");
  const [q, setQ] = useState(params.get("q") || "");
  const [kind, setKind] = useState<Kind>((params.get("type") as Kind) || "all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<string | null>(null);
  const [weeksFor, setWeeksFor] = useState<UnitRow | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});
  const [narrow, setNarrow] = useState(false);
  const act = useResourceActions(area);
  const { units, lessons, resources, failed } = useYearData(year);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own preference, read after mount
      if (v === "list" || v === "grid") setView(v);
    } catch {
      /* fine */
    }
    loadReviews().then(setReviews).catch(() => {});
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const pickView = (v: "grid" | "list") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine */
    }
  };

  // Moving between folders changes the address (so Back works) without scrolling the page.
  const go = (next: { year?: string | null; subject?: string | null; unit?: string | null }) => {
    const sp = new URLSearchParams();
    if (next.year) sp.set("year", next.year);
    if (next.subject) sp.set("subject", next.subject);
    if (next.unit) sp.set("unit", next.unit);
    if (kind !== "all") sp.set("type", kind);
    setSelected(null);
    router.push(`/${area}/curriculum${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  const statusOf = (l: LessonRow): WorkflowStatus | null => {
    const st = reviews[reviewKey(l.subject_slug, "lesson", `${l.year}/${l.lesson_no}`)]?.status;
    return st === "approved" || st === "published" || st === "submitted" || st === "in_review" || st === "changes_needed" ? st : null;
  };
  const statusMatch = (l: LessonRow) => {
    const st = statusOf(l);
    if (status === "all") return true;
    if (status === "approved") return st === "approved" || st === "published";
    if (status === "review") return st === "submitted" || st === "in_review" || st === "changes_needed";
    return !st;
  };

  // The year's subjects and, for each, its units in teaching order (the planner's units, with
  // any unit that only exists in the library added at the end).
  const subjects = useMemo(() => {
    if (!units || !lessons) return null;
    const by = new Map<string, { slug: string; name: string; units: { key: string; name: string; place: string; order: number; plan: UnitRow | null; lessons: LessonRow[] }[] }>();
    const ensure = (slug: string, name: string) => {
      const s = by.get(slug) || { slug, name, units: [] };
      by.set(slug, s);
      return s;
    };
    for (const u of units) {
      const s = ensure(u.subject_slug, u.subject);
      const p = placeOf(u);
      s.units.push({ key: unitName(u), name: unitName(u), place: p.label, order: p.order * 1000 + u.position, plan: u, lessons: [] });
    }
    for (const l of lessons) {
      const s = ensure(l.subject_slug, l.subject);
      const name = l.unit || "Lessons without a unit";
      let f = s.units.find((x) => sameUnit(x.name, name) || (x.plan && sameUnit(x.plan.title, name)));
      if (!f) {
        f = { key: name, name, place: "", order: 99_000 + s.units.length, plan: null, lessons: [] };
        s.units.push(f);
      }
      if (f.lessons.length === 0) f.key = name; // the library's own unit name, so older links still match
      f.lessons.push(l);
    }
    for (const s of by.values()) s.units.sort((a, b) => a.order - b.order);
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [units, lessons]);

  const subjectRow = subjects?.find((s) => s.slug === subject) || null;
  const unitRow = subjectRow && unit ? subjectRow.units.find((u) => u.key === unit || sameUnit(u.name, unit)) || null : null;
  const resourcesFor = (slug: string, unitName: string | null) =>
    (resources || []).filter((r) => r.subject_slug === slug && (!unitName || r.units.some((x) => sameUnit(x, unitName))));

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const searching = words.length > 0 && !!year;

  // Folders and files at the current place (or, while searching, every match in the year).
  const folders: Folder[] = [];
  const files: FileItem[] = [];
  const lessonFile = (l: LessonRow): FileItem => ({ type: "lesson", key: `l:${l.id}`, lesson: l, status: statusOf(l) });
  const resFile = (r: CurriculumResource): FileItem => ({ type: "resource", key: `r:${r.id}`, resource: r });
  if (searching && subjects) {
    for (const s of subjects) {
      if (subject && s.slug !== subject) continue;
      if (kind !== "resources") for (const u of s.units) if (!unit || u.key === unitRow?.key) for (const l of u.lessons) if (statusMatch(l) && hit(`${l.title} ${l.unit || ""} ${(l.objectives || []).join(" ")}`)) files.push(lessonFile(l));
      if (kind !== "lessons") for (const r of resourcesFor(s.slug, unitRow?.name || null)) if (hit(`${r.title} ${r.wording || ""} ${r.units.join(" ")}`)) files.push(resFile(r));
    }
  } else if (!year) {
    for (const y of YEARS)
      folders.push({ key: y, label: yearLabel(y), meta: Number(y.slice(1)) >= 10 ? "GCSE years" : Number(y.slice(1)) >= 7 ? "Key stage 3" : Number(y.slice(1)) >= 3 ? "Key stage 2" : "Key stage 1", icon: "folder", open: () => go({ year: y }), details: () => <p className="text-sm text-ink-500">Open the year to see its subjects.</p> });
  } else if (!subjectRow && subjects) {
    for (const s of subjects) {
      const all = s.units.flatMap((u) => u.lessons);
      const done = all.filter((l) => ["approved", "published"].includes(statusOf(l) || "")).length;
      folders.push({
        key: s.slug,
        label: s.name,
        meta: `${s.units.length} unit${s.units.length === 1 ? "" : "s"} · ${all.length} lesson${all.length === 1 ? "" : "s"}`,
        icon: "folder",
        progress: { done, total: all.length },
        open: () => go({ year, subject: s.slug }),
        details: () => (
          <dl className="space-y-2 text-sm">
            <Fact label="Units">{s.units.length}</Fact>
            <Fact label="Lessons">{all.length}, {done} approved</Fact>
            <Fact label="Resources">{resources ? resourcesFor(s.slug, null).length : "…"}</Fact>
          </dl>
        ),
      });
    }
  } else if (subjectRow && !unitRow) {
    for (const u of subjectRow.units) {
      const done = u.lessons.filter((l) => ["approved", "published"].includes(statusOf(l) || "")).length;
      const res = resources ? resourcesFor(subjectRow.slug, u.name).length : null;
      folders.push({
        key: u.key,
        label: u.name,
        meta: [u.place, `${u.lessons.length} lesson${u.lessons.length === 1 ? "" : "s"}`, res ? `${res} resource${res === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · "),
        icon: "folder",
        progress: u.lessons.length ? { done, total: u.lessons.length } : undefined,
        open: () => go({ year, subject: subjectRow.slug, unit: u.key }),
        details: () => (
          <dl className="space-y-2 text-sm">
            {u.place && <Fact label="When">{u.place}</Fact>}
            <Fact label="Lessons">{u.lessons.length}, {done} approved</Fact>
            <Fact label="Resources">{res ?? "…"}</Fact>
            <Fact label="Weekly plan">{u.plan?.weeks?.length ? `${u.plan.weeks.length} weeks` : "Not yet"}</Fact>
          </dl>
        ),
      });
    }
  } else if (subjectRow && unitRow) {
    if (unitRow.plan && kind !== "resources") files.push({ type: "plan", key: `p:${unitRow.plan.id}`, unit: unitRow.plan });
    if (kind !== "resources") for (const l of unitRow.lessons) if (statusMatch(l)) files.push(lessonFile(l));
    if (kind !== "lessons") for (const r of resourcesFor(subjectRow.slug, unitRow.name)) files.push(resFile(r));
  }

  const crumbs: { label: string; onClick?: () => void }[] = [{ label: "Curriculum", onClick: year ? () => go({}) : undefined }];
  if (year) crumbs.push({ label: yearLabel(year), onClick: subject ? () => go({ year }) : undefined });
  if (subjectRow) crumbs.push({ label: subjectRow.name, onClick: unit ? () => go({ year, subject: subjectRow.slug }) : undefined });
  if (unitRow) crumbs.push({ label: unitRow.name });

  const sel = selected ? files.find((f) => f.key === selected) || folders.find((f) => f.key === selected) || null : null;
  const loading = !!year && subjects === null;

  const lessonHref = (l: LessonRow) => `/${area}/curriculum/lesson?id=${encodeURIComponent(l.id)}`;
  const fileTitle = (f: FileItem) => (f.type === "lesson" ? `${f.lesson.lesson_no}. ${f.lesson.title}` : f.type === "resource" ? f.resource.title : "Weekly plan");
  const fileIcon = (f: FileItem): IconName => (f.type === "lesson" ? "presentation" : f.type === "resource" ? "fileText" : "scrollText");
  const fileMeta = (f: FileItem) =>
    f.type === "lesson" ? `Lesson · ${f.lesson.subject}` : f.type === "resource" ? `${typeLabel(f.resource.type)}${f.resource.pdf_path ? "" : f.resource.status === "to make" ? " · still being made" : ` · ${SOURCE_LABEL[f.resource.source] || f.resource.source}`}` : `${f.unit.weeks?.length || 0}-week plan`;
  const openFile = (f: FileItem) => {
    if (f.type === "lesson") router.push(lessonHref(f.lesson));
    else if (f.type === "plan") setWeeksFor(f.unit);
    else if (f.resource.pdf_path) act.preview(f.resource);
    else setSelected(f.key);
  };

  const details = (): ReactNode => {
    if (!sel) {
      if (unitRow && subjectRow)
        return (
          <PaneBlock title={unitRow.name} eyebrow={[subjectRow.name, year ? yearLabel(year) : "", unitRow.place].filter(Boolean).join(" · ")}>
            <dl className="space-y-2 text-sm">
              <Fact label="Lessons">{unitRow.lessons.length}</Fact>
              <Fact label="Resources">{resources ? resourcesFor(subjectRow.slug, unitRow.name).length : "…"}</Fact>
            </dl>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={`/${area}/curriculum?year=${year}&subject=${encodeURIComponent(subjectRow.slug)}&unit=${encodeURIComponent(unitRow.key)}&classic=1`} className={btn("secondary", "sm")}>
                <Icon name="layoutGrid" size="sm" /> Unit tools: spec, revision pack, results
              </Link>
              <Link href={`/${area}/syllabus?subject=${encodeURIComponent(planSlugOf(subjectRow.slug))}&view=years&year=${year}`} className={btn("ghost", "sm")}>
                <Icon name="scrollText" size="sm" /> The subject&apos;s syllabus
              </Link>
            </div>
          </PaneBlock>
        );
      return (
        <PaneBlock title={crumbs[crumbs.length - 1].label} eyebrow="This folder">
          <p className="text-sm text-ink-500">{!year ? "Pick a year to begin. Every year holds its subjects, units, lessons and resources." : !subjectRow ? "Pick a subject. Each holds its units in teaching order." : "Pick a unit to see its lessons, resources and weekly plan."}</p>
          <p className="mt-3 text-xs text-ink-500">Select something to see its details here.</p>
        </PaneBlock>
      );
    }
    if ("open" in sel)
      return (
        <PaneBlock title={sel.label} eyebrow="Folder">
          {sel.details()}
          <button type="button" onClick={sel.open} className={`${ui.btnPrimary} mt-4 w-full`}>
            Open
          </button>
        </PaneBlock>
      );
    if (sel.type === "lesson") {
      const l = sel.lesson;
      return (
        <PaneBlock title={l.title} eyebrow={`${l.subject} · ${yearLabel(l.year)} · Lesson ${l.lesson_no}`}>
          <WorkflowBadge status={sel.status || "draft"} />
          {l.objectives && l.objectives.length > 0 && (
            <>
              <h4 className="t-eyebrow mt-4">Objectives</h4>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-ink-700">
                {l.objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            </>
          )}
          <Link href={lessonHref(l)} className={`${ui.btnPrimary} mt-4 w-full`}>
            Open the lesson
          </Link>
          <p className="mt-2 text-xs text-ink-500">Slides, plan, resources, sharing, editing and review are on the lesson&apos;s own page.</p>
        </PaneBlock>
      );
    }
    if (sel.type === "resource") {
      const r = sel.resource;
      const items: MenuAction[] = act.menu(r);
      return (
        <PaneBlock title={r.title} eyebrow={`${typeLabel(r.type)} · ${r.subject}`}>
          <dl className="space-y-2 text-sm">
            <Fact label="Status">{r.pdf_path ? "Made, ready to print" : r.status === "to make" ? "Still being made" : SOURCE_LABEL[r.source] || r.source}</Fact>
            {r.lessons.length > 0 && <Fact label="Used in">{r.lessons.map((x) => `Lesson ${x.n}`).join(", ")}</Fact>}
            {r.wording && <Fact label="What it is">{r.wording}</Fact>}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.pdf_path && (
              <button type="button" onClick={() => act.preview(r)} className={ui.btnPrimary}>
                Preview
              </button>
            )}
            {items.length > 0 && <ActionsMenu label={`More for ${r.title}`} items={items} trigger="text" />}
          </div>
        </PaneBlock>
      );
    }
    return (
      <PaneBlock title="Weekly plan" eyebrow={unitName(sel.unit)}>
        <p className="text-sm text-ink-500">{sel.unit.weeks?.length ? `${sel.unit.weeks.length} weeks of lessons, vocabulary and home learning.` : "No week-by-week plan yet. It is added in the Planner."}</p>
        <button type="button" onClick={() => setWeeksFor(sel.unit)} className={`${ui.btnPrimary} mt-4 w-full`}>
          Open the plan
        </button>
      </PaneBlock>
    );
  };

  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={on ? ui.chipOn : ui.chip}>
      {label}
    </button>
  );

  return (
    <div data-guide="curriculum-browser" className="space-y-4">
      {/* Breadcrumb: where you are, each level one press back up. */}
      <nav aria-label="Folder" className="flex min-h-9 flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-ink/35" />}
            {c.onClick ? (
              <button type="button" onClick={c.onClick} className="rounded px-1 py-0.5 font-medium text-forest-700 hover:bg-[var(--portal-hover)]">
                {c.label}
              </button>
            ) : (
              <span aria-current="location" className="truncate px-1 font-semibold text-ink">
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* One toolbar: search, what to show, review status, grid or list. */}
      <div data-guide="curriculum-browser-filters" className="flex flex-wrap items-center gap-2 border-b border-gold-light pb-3">
        <label className="relative min-w-[min(100%,16rem)] flex-1">
          <span className="sr-only">Search</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={year ? `Search ${crumbs[crumbs.length - 1].label}` : "Pick a year, then search it"} disabled={!year} className={`${ui.input} pl-9`} />
        </label>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {chip(kind === "all", "Everything", () => setKind("all"))}
          {chip(kind === "lessons", "Lessons", () => setKind("lessons"))}
          {chip(kind === "resources", "Resources", () => setKind("resources"))}
        </div>
        {kind !== "resources" && (unitRow || searching) && (
          <div role="group" aria-label="Review status" className="flex flex-wrap gap-1.5">
            {chip(status === "approved", "Approved", () => setStatus(status === "approved" ? "all" : "approved"))}
            {chip(status === "review", "In review", () => setStatus(status === "review" ? "all" : "review"))}
            {chip(status === "draft", "Not submitted", () => setStatus(status === "draft" ? "all" : "draft"))}
          </div>
        )}
        <div role="group" aria-label="View" className="ml-auto flex rounded-lg border border-gold-light bg-white p-0.5">
          <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => pickView("grid")} className={`flex h-9 w-9 items-center justify-center rounded-md ${view === "grid" ? "bg-[var(--portal-sunken)] text-ink" : "text-ink-500"}`}>
            <Icon name="layoutGrid" size="sm" />
          </button>
          <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => pickView("list")} className={`flex h-9 w-9 items-center justify-center rounded-md ${view === "list" ? "bg-[var(--portal-sunken)] text-ink" : "text-ink-500"}`}>
            <Icon name="list" size="sm" />
          </button>
        </div>
      </div>

      {(act.message || failed) && <Notice tone="info">{act.message || "Some of the curriculum could not be loaded just now."}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Contents" className="min-w-0">
          {loading ? (
            <Loading label="Opening the folder" />
          ) : folders.length === 0 && files.length === 0 ? (
            <p className="rounded-[10px] border border-gold-light bg-white px-4 py-8 text-center text-sm text-ink-500">{searching ? "Nothing matches." : unitRow ? "Nothing here yet for this filter." : "This folder is empty."}</p>
          ) : (
            <>
              {folders.length > 0 && (
                <ul className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "divide-y divide-gold-light overflow-hidden rounded-[10px] border border-gold-light bg-white"}>
                  {folders.map((f) => (
                    <li key={f.key}>
                      <button
                        type="button"
                        onClick={() => (narrow ? f.open() : setSelected(f.key))}
                        onDoubleClick={f.open}
                        onKeyDown={(e) => e.key === "Enter" && !narrow && (e.preventDefault(), f.open())}
                        aria-pressed={selected === f.key}
                        className={
                          view === "grid"
                            ? `flex h-full w-full flex-col gap-2 rounded-[10px] border bg-white p-3.5 text-left transition-colors hover:bg-[var(--portal-hover)] ${selected === f.key ? "border-forest-700 ring-1 ring-forest-700" : "border-gold-light"}`
                            : `flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--portal-hover)] ${selected === f.key ? "bg-forest-50" : ""}`
                        }
                      >
                        <Icon name={f.icon} className="h-5 w-5 shrink-0 text-gold-700" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-ink">{f.label}</span>
                          <span className="mt-0.5 block text-xs text-ink-500">{f.meta}</span>
                        </span>
                        {f.progress && f.progress.total > 0 && (
                          <span className={view === "grid" ? "block h-1 w-full overflow-hidden rounded-full bg-[var(--portal-sunken)]" : "hidden h-1 w-20 overflow-hidden rounded-full bg-[var(--portal-sunken)] sm:block"} aria-label={`${f.progress.done} of ${f.progress.total} approved`}>
                            <span className="block h-full bg-forest-500" style={{ width: `${Math.round((f.progress.done / f.progress.total) * 100)}%` }} />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <ul className={`${folders.length ? "mt-4" : ""} ${view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "divide-y divide-gold-light overflow-hidden rounded-[10px] border border-gold-light bg-white"}`}>
                  {files.map((f) => (
                    <li key={f.key}>
                      <button
                        type="button"
                        onClick={() => setSelected(f.key)}
                        onDoubleClick={() => openFile(f)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), openFile(f))}
                        aria-pressed={selected === f.key}
                        className={
                          view === "grid"
                            ? `flex h-full w-full flex-col gap-2 rounded-[10px] border bg-white p-3.5 text-left transition-colors hover:bg-[var(--portal-hover)] ${selected === f.key ? "border-forest-700 ring-1 ring-forest-700" : "border-gold-light"}`
                            : `flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--portal-hover)] ${selected === f.key ? "bg-forest-50" : ""}`
                        }
                      >
                        <Icon name={fileIcon(f)} className={`h-5 w-5 shrink-0 ${f.type === "lesson" ? "text-forest-700" : "text-ink-500"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-sm font-medium leading-snug text-ink">{fileTitle(f)}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-500">{fileMeta(f)}</span>
                        </span>
                        {f.type === "lesson" && <WorkflowBadge status={f.status || "draft"} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {/* The details pane: beside the contents on wide screens; a panel over the page on phones. */}
        <aside data-guide="curriculum-browser-details" aria-label="Details" className="hidden lg:block">
          <div className="sticky top-[calc(var(--portal-topbar-h)+1rem)] rounded-[10px] border border-gold-light bg-white p-4">{details()}</div>
        </aside>
      </div>

      {narrow && sel && (
        <SidePanel title={"open" in sel ? sel.label : fileTitle(sel)} eyebrow="Details" onClose={() => setSelected(null)}>
          {details()}
        </SidePanel>
      )}
      {weeksFor && subjectRow && (
        <UnitWeeksPanel
          title={unitName(weeksFor)}
          subject={weeksFor.subject}
          year={weeksFor.year}
          weeks={weeksFor.weeks || []}
          syllabusHref={`/${area}/syllabus?subject=${encodeURIComponent(planSlugOf(weeksFor.subject_slug))}&view=years&year=${weeksFor.year}&unit=${encodeURIComponent(weeksFor.id)}`}
          onClose={() => setWeeksFor(null)}
        />
      )}
      {act.overlays}
    </div>
  );
}

function PaneBlock({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <div>
      {eyebrow && <p className="t-eyebrow mb-1">{eyebrow}</p>}
      <h3 className="mb-3 text-[0.9375rem] font-semibold leading-snug text-ink">{title}</h3>
      {children}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="t-meta">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
