"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchClass, recordRecentPage, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";
import type { Crumb } from "@/components/learn/PageHeader";
import { ParticipantsTab } from "@/components/learn/class/ParticipantsTab";
import { CourseTab } from "@/components/learn/class/CourseTab";
import { StreamTab } from "@/components/learn/class/StreamTab";
import { ClassworkTab } from "@/components/learn/class/ClassworkTab";
import { ClassSettingsTab } from "@/components/learn/class/ClassSettingsTab";
import { fetchClassSettings, overallPercent, type ClassSettings, type GradeCategory } from "@/lib/learn/classSettings";
import { MeetYourTeachers } from "@/components/learn/staff/MeetYourTeachers";
import { JoinLessonCard } from "@/components/learn/live/JoinLessonCard";

/** Route bases per viewer, e.g. the class page and lesson page URLs. */
function routesFor(viewer: ClassViewer) {
  if (viewer.kind === "teacher") return { area: "/teach", lessonBase: "/teach/lessons/view", extra: "" };
  if (viewer.kind === "staff") return { area: "/admin", lessonBase: "/admin/lessons/view", extra: "" };
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

// ── Grades ────────────────────────────────────────────────────────────
type GradeRow = { id: string; title: string; date: string; percent: number | null; grade_label: string | null; assessment_type_id?: string | null; children?: { name: string } | null };

function GradesTab({ classId, viewer }: { classId: string; viewer: ClassViewer }) {
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [settings, setSettings] = useState<ClassSettings | null>(null);
  const [cats, setCats] = useState<GradeCategory[]>([]);

  // Depend on primitives, not the viewer object (a new object each render).
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const q = childId
      ? supabase.from("assessments_for_family").select("id, title, date, percent, grade_label, assessment_type_id").eq("class_id", classId).eq("child_id", childId)
      : supabase.from("assessments").select("id, title, date, percent, grade_label, children(name)").eq("class_id", classId);
    q.order("date", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data as unknown as GradeRow[]) || []));
  }, [classId, childId]);

  // The overall grade is only fetched for pupils and families, and only shown when the teacher has switched it on.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !childId) return;
    fetchClassSettings(classId).then(setSettings);
    supabase
      .from("class_grade_categories")
      .select("id, name, weight, assessment_type_id")
      .eq("class_id", classId)
      .then(({ data }) =>
        setCats(((data as unknown as { id: string; name: string; weight: number | string; assessment_type_id: string | null }[]) || []).map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight), assessmentTypeId: c.assessment_type_id }))),
      );
  }, [classId, childId]);

  if (rows === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No grades recorded for this class yet.</p>;
  const teacher = !childId;
  const overall =
    settings?.showOverallGrade && childId
      ? overallPercent(
          settings.gradeCalculation,
          rows.filter((r) => r.percent != null).map((r) => ({ percent: Number(r.percent), categoryId: cats.find((c) => c.assessmentTypeId && c.assessmentTypeId === r.assessment_type_id)?.id ?? null })),
          cats,
        )
      : null;
  return (
    <>
      {overall !== null && (
        <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Overall grade: <span className="text-base font-semibold tabular-nums">{overall}%</span>
          <span className="ml-2 text-xs text-teal-900/70">{settings?.gradeCalculation === "weighted" ? "weighted by category" : "average of all results"}</span>
        </p>
      )}
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-gold-light text-xs uppercase tracking-wide text-ink/65">
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
    </>
  );
}

/**
 * One class's own page: coloured banner, breadcrumb, then the class
 * sections as tabs: Stream (announcements, upcoming), Classwork (grouped by
 * topic), Lessons (the week-by-week course view), People, Grades and, for
 * staff, Settings. The tab lives in the URL (?tab=grades) so it survives a
 * refresh. Older links (?tab=course, assignments, participants,
 * announcements) still land on the matching new tab.
 */
type TabKey = "stream" | "classwork" | "lessons" | "people" | "grades" | "settings";

const TAB_LABELS: Record<TabKey, string> = {
  stream: "Stream",
  classwork: "Classwork",
  lessons: "Lessons",
  people: "People",
  grades: "Grades",
  settings: "Settings",
};

const TAB_ALIASES: Record<string, TabKey> = { course: "lessons", assignments: "classwork", participants: "people", announcements: "stream" };

export function ClassPage({ viewer }: { viewer: ClassViewer }) {
  const params = useSearchParams();
  const classId = params.get("id") || "";
  const [cls, setCls] = useState<ClassSummary | null | undefined>(undefined);
  const { area, lessonBase, extra } = routesFor(viewer);
  const childQuery = viewer.kind === "parent" ? `&child=${viewer.childId}` : "";
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";

  const tabs: TabKey[] = isStaff ? ["stream", "classwork", "lessons", "people", "grades", "settings"] : ["stream", "classwork", "lessons", "people", "grades"];
  const rawTab = params.get("tab") || "";
  const requested = (TAB_ALIASES[rawTab] ?? rawTab) as TabKey;
  const tab: TabKey = tabs.includes(requested) ? requested : "stream";
  const classHref = (t: string) => `${area}/class?id=${classId}${childQuery}&tab=${t}`;

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

  if (!classId) return <p className="text-sm text-ink/60">No class selected. Open one from the classes page.</p>;
  if (cls === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  if (cls === null) return <p className="text-sm text-ink/60">That class couldn&apos;t be found, or you don&apos;t have access to it.</p>;

  const crumbs: Crumb[] = [
    { label: "Dashboard", href: `${area}/dashboard` },
    { label: viewer.kind === "staff" ? "Classes" : "My classes", href: `${area}/classes${viewer.kind === "parent" ? `?child=${viewer.childId}` : ""}` },
    { label: cls.name },
  ];
  const meta = [cls.subject, cls.yearGroup].filter(Boolean).join(" · ");

  return (
    <div>
      {/* One plain header: title, subject line and the section tabs together */}
      <header className="mb-6 overflow-hidden rounded-2xl border border-gold-light bg-white">
        <div className="flex items-center gap-3 px-5 pb-3 pt-5">
          <span aria-hidden="true" className="h-10 w-1.5 shrink-0 rounded-full bg-teal-700" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{cls.name}</h1>
            {meta && <p className="text-sm text-ink/55">{meta}</p>}
          </div>
          <Link href={crumbs[1].href as string} className="ml-auto shrink-0 text-sm text-ink/55 hover:text-teal-700 hover:underline">
            All classes
          </Link>
        </div>
        <nav aria-label="Class sections" className="flex gap-1 overflow-x-auto border-t border-gold-light/70 px-3">
          {tabs.map((t) => {
            const active = t === tab;
            return (
              <Link
                key={t}
                href={classHref(t)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 border-b-[3px] px-3 py-3 text-sm font-medium transition-colors ${
                  active ? "border-teal-700 text-ink" : "border-transparent text-ink/60 hover:text-ink"
                }`}
              >
                {TAB_LABELS[t]}
              </Link>
            );
          })}
        </nav>
      </header>

      {viewer.kind !== "staff" && (
        <JoinLessonCard
          who={viewer.kind === "teacher" ? { kind: "teacher" } : viewer.kind === "student" ? { kind: "student", childId: viewer.childId } : { kind: "parent", childId: viewer.childId }}
          classId={cls.id}
          className="mb-6"
        />
      )}

      {tab === "stream" && <StreamTab classId={cls.id} viewer={viewer} area={area} classHref={classHref} />}

      {tab === "classwork" && <ClassworkTab classId={cls.id} viewer={viewer} classHref={classHref} />}

      {tab === "lessons" && <CourseTab classId={cls.id} viewer={viewer} routes={{ area, lessonBase, extra, classHref }} />}

      {tab === "people" &&
        (isStaff ? (
          <Panel title="People">
            <ParticipantsTab classId={cls.id} />
          </Panel>
        ) : (
          <MeetYourTeachers classId={cls.id} />
        ))}

      {tab === "grades" && (
        <Panel
          title="Grades"
          action={
            viewer.kind === "teacher" ? (
              <Link href="/teach/assessment" className="rounded-lg bg-gold-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-900">
                + Record a grade
              </Link>
            ) : undefined
          }
        >
          <GradesTab classId={cls.id} viewer={viewer} />
        </Panel>
      )}

      {tab === "settings" && isStaff && <ClassSettingsTab classId={cls.id} className={cls.name} subject={cls.subject} canRename={viewer.kind === "staff"} />}
    </div>
  );
}
