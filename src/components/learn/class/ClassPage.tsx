"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classBannerStyle, fetchClass, recordRecentPage, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";
import { PageHeader, type Crumb } from "@/components/learn/PageHeader";
import { UpcomingLessons } from "@/components/learn/UpcomingLessons";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";

type TabKey = "lessons" | "homework" | "grades" | "people" | "announcements";

const TAB_LABELS: Record<TabKey, string> = {
  lessons: "Lessons",
  homework: "Homework",
  grades: "Grades",
  people: "People",
  announcements: "Announcements",
};

/** Route bases per viewer, e.g. the class page and lesson page URLs. */
function routesFor(viewer: ClassViewer) {
  if (viewer.kind === "teacher") return { area: "/teach", lessonBase: "/teach/lessons/view", extra: "" };
  if (viewer.kind === "student") return { area: "/student", lessonBase: "/student/lessons/view", extra: "" };
  return { area: "/family", lessonBase: "/family/lessons/view", extra: `&child=${viewer.childId}` };
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gold-light bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gold-light px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function fmtDate(d: string) {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ── Lessons ───────────────────────────────────────────────────────────
type PastLesson = { id: string; date: string; objectives: string | null; timetable_slots?: { start_time: string } | null };

function LessonsTab({ classId, viewer }: { classId: string; viewer: ClassViewer }) {
  const { lessonBase, extra } = routesFor(viewer);
  const [past, setPast] = useState<PastLesson[] | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data: slots } = await supabase.from("timetable_slots").select("id").eq("class_id", classId);
      const slotIds = (slots || []).map((s) => s.id as string);
      if (slotIds.length === 0) return setPast([]);
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, date, objectives, timetable_slots(start_time)")
        .in("timetable_slot_id", slotIds)
        .lt("date", today)
        .order("date", { ascending: false })
        .limit(12);
      setPast((data as unknown as PastLesson[]) || []);
    })();
  }, [classId]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Coming up">
        <UpcomingLessons classIds={[classId]} basePath={lessonBase} extraQuery={extra} emptyLabel="No lessons scheduled in the next two weeks." />
      </Panel>
      <Panel title="Past lessons">
        {past === null ? (
          <p className="text-sm text-ink/60">Loading…</p>
        ) : past.length === 0 ? (
          <p className="text-sm text-ink/60">No past lessons yet.</p>
        ) : (
          <ul className="divide-y divide-gold-light/70">
            {past.map((l) => (
              <li key={l.id}>
                <Link href={`${lessonBase}?id=${l.id}${extra}`} className="block py-2.5 text-sm hover:text-teal-700">
                  <span className="font-medium text-ink">{fmtDate(l.date)}</span>
                  <span className="text-ink/50"> · {l.timetable_slots?.start_time?.slice(0, 5)}</span>
                  {l.objectives && <span className="mt-0.5 block truncate text-ink/60">{l.objectives}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ── Homework ──────────────────────────────────────────────────────────
type HomeworkRow = { id: string; title: string; due_at: string };

function TeacherHomework({ classId }: { classId: string }) {
  const [rows, setRows] = useState<(HomeworkRow & { submitted: number })[] | null>(null);
  const [enrolled, setEnrolled] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const [{ data: hw }, { count }] = await Promise.all([
        supabase.from("homework").select("id, title, due_at").eq("class_id", classId).order("due_at", { ascending: false }),
        supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("class_id", classId),
      ]);
      const list = (hw as HomeworkRow[]) || [];
      setEnrolled(count ?? 0);
      if (list.length === 0) return setRows([]);
      const { data: subs } = await supabase
        .from("homework_submissions")
        .select("homework_id, submitted_at")
        .in(
          "homework_id",
          list.map((h) => h.id),
        );
      const done = ((subs as { homework_id: string; submitted_at: string | null }[]) || []).filter((s) => s.submitted_at);
      setRows(list.map((h) => ({ ...h, submitted: done.filter((s) => s.homework_id === h.id).length })));
    })();
  }, [classId]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No homework set for this class yet.</p>;
  const now = Date.now();
  return (
    <ul className="divide-y divide-gold-light/70">
      {rows.map((h) => {
        const overdue = new Date(h.due_at).getTime() < now;
        return (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-ink">{h.title}</p>
              <p className={overdue ? "text-ink/50" : "text-teal-700"}>
                {overdue ? "Was due" : "Due"} {fmtDate(h.due_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${enrolled ? Math.round((h.submitted / enrolled) * 100) : 0}%` }} />
              </div>
              <span className="w-24 text-right text-ink/60">
                {h.submitted}/{enrolled} handed in
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Grades ────────────────────────────────────────────────────────────
type GradeRow = { id: string; title: string; date: string; percent: number | null; grade_label: string | null; children?: { name: string } | null };

function GradesTab({ classId, viewer }: { classId: string; viewer: ClassViewer }) {
  const [rows, setRows] = useState<GradeRow[] | null>(null);

  // Depend on primitives, not the viewer object (a new object each render).
  const childId = viewer.kind === "teacher" ? null : viewer.childId;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const q = childId
      ? supabase.from("assessments_for_family").select("id, title, date, percent, grade_label").eq("class_id", classId).eq("child_id", childId)
      : supabase.from("assessments").select("id, title, date, percent, grade_label, children(name)").eq("class_id", classId);
    q.order("date", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data as unknown as GradeRow[]) || []));
  }, [classId, childId]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No grades recorded for this class yet.</p>;
  const teacher = viewer.kind === "teacher";
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-gold-light text-xs uppercase tracking-wide text-ink/50">
            {teacher && <th className="px-5 py-2 font-semibold">Student</th>}
            <th className="px-5 py-2 font-semibold">Assessment</th>
            <th className="px-5 py-2 font-semibold">Date</th>
            <th className="px-5 py-2 text-right font-semibold">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold-light/70">
          {rows.map((r) => (
            <tr key={r.id}>
              {teacher && <td className="px-5 py-2.5 font-medium text-ink">{r.children?.name || "—"}</td>}
              <td className="px-5 py-2.5 text-ink/80">{r.title}</td>
              <td className="px-5 py-2.5 text-ink/60">{fmtDate(r.date)}</td>
              <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">
                {r.grade_label || (r.percent != null ? `${r.percent}%` : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── People (teacher only: families can't read other children) ────────
function PeopleTab({ classId }: { classId: string }) {
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("enrolments")
      .select("children(id, name)")
      .eq("class_id", classId)
      .then(({ data }) =>
        setPeople(
          (((data as unknown as { children: { id: string; name: string } | null }[]) || []).map((r) => r.children).filter(Boolean) as { id: string; name: string }[]).sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        ),
      );
  }, [classId]);

  if (people === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (people.length === 0) return <p className="text-sm text-ink/60">No students enrolled yet.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-lg border border-gold-light/70 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-900" aria-hidden="true">
            {p.name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium text-ink">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One class's own page, laid out like a Moodle course page: coloured
 * banner, breadcrumb, and a row of tabs (Moodle's "secondary navigation")
 * for everything about that class in one place. The tab lives in the URL
 * (?tab=homework) so it survives refresh and can be linked to.
 */
export function ClassPage({ viewer }: { viewer: ClassViewer }) {
  const params = useSearchParams();
  const classId = params.get("id") || "";
  const [cls, setCls] = useState<ClassSummary | null | undefined>(undefined);
  const { area } = routesFor(viewer);
  const childQuery = viewer.kind === "parent" ? `&child=${viewer.childId}` : "";

  const tabs: TabKey[] = viewer.kind === "teacher" ? ["lessons", "homework", "grades", "people", "announcements"] : ["lessons", "homework", "grades", "announcements"];
  const requested = params.get("tab") as TabKey | null;
  const tab: TabKey = requested && tabs.includes(requested) ? requested : "lessons";

  useEffect(() => {
    if (!classId) return;
    fetchClass(classId).then((c) => {
      setCls(c);
      if (c) {
        recordRecentPage({
          href: `${area}/class?id=${c.id}${childQuery}`,
          title: c.name,
          subtitle: [c.subject, c.yearGroup].filter(Boolean).join(" · "),
          colourId: c.id,
        });
      }
    });
  }, [classId, area, childQuery]);

  if (!classId) return <p className="text-sm text-ink/60">No class selected. Open one from My classes.</p>;
  if (cls === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (cls === null) return <p className="text-sm text-ink/60">That class couldn&apos;t be found, or you don&apos;t have access to it.</p>;

  const crumbs: Crumb[] = [
    { label: "Dashboard", href: `${area}/dashboard` },
    { label: "My classes", href: `${area}/classes${viewer.kind === "parent" ? `?child=${viewer.childId}` : ""}` },
    { label: cls.name },
  ];
  const meta = [cls.subject, cls.yearGroup].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader crumbs={crumbs} title={cls.name} subtitle={meta || undefined} />

      <div className="-mt-2 mb-6 h-20 rounded-2xl" style={classBannerStyle(cls.id)} aria-hidden="true" />

      <nav aria-label="Class sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-gold-light">
        {tabs.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={`${area}/class?id=${cls.id}${childQuery}&tab=${t}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "border-teal-700 text-ink" : "border-transparent text-ink/60 hover:border-gold-light hover:text-ink"
              }`}
            >
              {TAB_LABELS[t]}
            </Link>
          );
        })}
      </nav>

      {tab === "lessons" && <LessonsTab classId={cls.id} viewer={viewer} />}

      {tab === "homework" &&
        (viewer.kind === "teacher" ? (
          <Panel
            title="Homework"
            action={
              <Link href="/teach/homework" className="text-sm font-medium text-teal-700 hover:underline">
                Set homework
              </Link>
            }
          >
            <TeacherHomework classId={cls.id} />
          </Panel>
        ) : (
          <Panel title="Homework">
            <HomeworkForChild childId={viewer.childId} canSubmit={viewer.kind === "student"} classId={cls.id} />
          </Panel>
        ))}

      {tab === "grades" && (
        <Panel
          title="Grades"
          action={
            viewer.kind === "teacher" ? (
              <Link href="/teach/assessment" className="text-sm font-medium text-teal-700 hover:underline">
                Record a grade
              </Link>
            ) : undefined
          }
        >
          <GradesTab classId={cls.id} viewer={viewer} />
        </Panel>
      )}

      {tab === "people" && viewer.kind === "teacher" && (
        <Panel title="Students">
          <PeopleTab classId={cls.id} />
        </Panel>
      )}

      {tab === "announcements" && (
        <AnnouncementsFeed classIds={[cls.id]} includeSchool={false} canPost={viewer.kind === "teacher"} postClassId={cls.id} postScope="class" />
      )}
    </div>
  );
}
