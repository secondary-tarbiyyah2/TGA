"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchClass, recordRecentPage, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";
import type { Crumb } from "@/components/learn/PageHeader";
import { WorkspaceHeader, type MenuAction, Loading } from "@/components/learn/kit";
import { Button } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";
import { SetWorkPanel } from "@/components/learn/class/SetWorkPanel";
import { ParticipantsTab } from "@/components/learn/class/ParticipantsTab";
import { CourseTab } from "@/components/learn/class/CourseTab";
import { StreamTab } from "@/components/learn/class/StreamTab";
import { ClassworkTab } from "@/components/learn/class/ClassworkTab";
import { ClassSettingsTab } from "@/components/learn/class/ClassSettingsTab";
import { fetchClassSettings, overallPercent, type ClassSettings, type GradeCategory } from "@/lib/learn/classSettings";
import { MeetYourTeachers } from "@/components/learn/staff/MeetYourTeachers";
import { JoinLessonCard } from "@/components/learn/live/JoinLessonCard";
import { ClassGradebook } from "@/components/learn/assessment/ClassGradebook";
import { ClassAttendanceTab } from "@/components/learn/class/ClassAttendanceTab";
import { ClassInsightsTab } from "@/components/learn/class/ClassInsightsTab";
import { useClassRoster } from "@/components/learn/class/PupilPicker";

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

  if (rows === null) return <Loading label="Loading…" bare />;
  if (rows.length === 0) return <p className="text-sm text-ink/65">No grades recorded for this class yet.</p>;
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
            {teacher && <th className="px-5 py-2 font-semibold">Pupil</th>}
            <th className="px-5 py-2 font-semibold">Assessment</th>
            <th className="px-5 py-2 font-semibold">Date</th>
            <th className="px-5 py-2 text-right font-semibold">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gold-light/70">
          {rows.map((r) => (
            <tr key={r.id}>
              {teacher && <td className="px-5 py-2.5 font-medium text-ink">{r.children?.name || "–"}</td>}
              <td className="px-5 py-2.5 text-ink/80">{r.title}</td>
              <td className="px-5 py-2.5 text-ink/65">{fmtDate(r.date)}</td>
              <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-ink">
                {r.grade_label || (r.percent != null ? `${r.percent}%` : "–")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/** Staff: the class gradebook (pupils down the side, assessments across), the same one as Teaching › Gradebook. */
function StaffGrades({ classId }: { classId: string }) {
  const pupils = useClassRoster(classId);
  const [subjectId, setSubjectId] = useState<string | null | undefined>(undefined);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("classes")
      .select("subject_id")
      .eq("id", classId)
      .maybeSingle()
      .then(({ data }) => setSubjectId((data as { subject_id: string | null } | null)?.subject_id ?? null));
  }, [classId]);
  if (subjectId === undefined) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;
  return <ClassGradebook classId={classId} subjectId={subjectId} pupils={pupils} selected={selected} onSelect={(id) => setSelected(id === selected ? "" : id)} />;
}

/**
 * One class's own page, the home for its teaching work (Google Classroom's
 * class, Teams for Education's class team): a header, then the class
 * sections as tabs: Stream (announcements, upcoming), Classwork (assign,
 * mark and To review, grouped by topic), Lessons (the week-by-week course
 * view), People, and Grades; staff also get Attendance (this class's
 * registers), Insights (the class at a glance) and Settings. The tab lives in
 * the URL (?tab=grades) so it survives a refresh. Older links (?tab=course,
 * assignments, participants, announcements) still land on the matching tab.
 */
type TabKey = "stream" | "classwork" | "lessons" | "people" | "attendance" | "grades" | "insights" | "settings";

const TAB_LABELS: Record<TabKey, string> = {
  stream: "Stream",
  classwork: "Classwork",
  lessons: "Lessons",
  people: "People",
  attendance: "Attendance",
  grades: "Grades",
  insights: "Insights",
  settings: "Settings",
};

const TAB_ALIASES: Record<string, TabKey> = { course: "lessons", assignments: "classwork", participants: "people", announcements: "stream", register: "attendance", gradebook: "grades" };

export function ClassPage({ viewer }: { viewer: ClassViewer }) {
  const params = useSearchParams();
  const classId = params.get("id") || "";
  const [cls, setCls] = useState<ClassSummary | null | undefined>(undefined);
  const { area, lessonBase, extra } = routesFor(viewer);
  const childQuery = viewer.kind === "parent" ? `&child=${viewer.childId}` : "";
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";

  const tabs: TabKey[] = isStaff ? ["stream", "classwork", "lessons", "people", "attendance", "grades", "insights", "settings"] : ["stream", "classwork", "lessons", "people", "grades"];
  const rawTab = params.get("tab") || "";
  const requested = (TAB_ALIASES[rawTab] ?? rawTab) as TabKey;
  const tab: TabKey = tabs.includes(requested) ? requested : "stream";
  const classHref = (t: string) => `${area}/class?id=${classId}${childQuery}&tab=${t}`;
  const router = useRouter();
  // "Set work" opens a panel over whichever section you are in. An address with ?set=assignment
  // (or quiz) opens the same panel, so links from elsewhere land on the class with it open.
  const setParam = params.get("set");
  const [setWork, setSetWork] = useState<"assignment" | "quiz" | null>(isStaff && (setParam === "assignment" || setParam === "quiz") ? setParam : null);

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

  if (!classId)
    return (
      <p className="text-sm text-ink/65">
        No class selected.{" "}
        <Link href={`${area}/classes${viewer.kind === "parent" ? `?child=${viewer.childId}` : ""}`} className="font-medium text-teal-700 underline">
          Choose a class
        </Link>
      </p>
    );
  if (cls === undefined) return <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />;
  if (cls === null)
    return (
      <p className="text-sm text-ink/65">
        That class couldn&apos;t be found, or you don&apos;t have access to it.{" "}
        <Link href={`${area}/classes${viewer.kind === "parent" ? `?child=${viewer.childId}` : ""}`} className="font-medium text-teal-700 underline">
          Back to classes
        </Link>
      </p>
    );

  const crumbs: Crumb[] = [
    { label: "Home", href: `${area}/dashboard` },
    { label: viewer.kind === "student" ? "My classes" : "Classes", href: `${area}/classes${viewer.kind === "parent" ? `?child=${viewer.childId}` : ""}` },
    { label: cls.name },
  ];

  return (
    <div>
      {/* The redesign's workspace header (docs/portal-redesign.md): where you are, the class, one main action and a menu; then the class sections. */}
      <WorkspaceHeader
        eyebrow={[{ label: crumbs[1].label, href: crumbs[1].href }, ...(cls.subject ? [{ label: cls.subject }] : []), ...(cls.yearGroup ? [{ label: cls.yearGroup }] : [])]}
        title={cls.name}
        primary={
          isStaff ? (
            <Button variant="primary" icon="plus" data-guide="class-set-work" onClick={() => setSetWork("assignment")}>
              Set work
            </Button>
          ) : undefined
        }
        menu={[
          ...(isStaff
            ? ([
                { label: "Set a quiz", icon: "listChecks", onSelect: () => setSetWork("quiz") },
                { label: "Take the register", icon: "userCheck", href: classHref("attendance") },
                { label: "Grades", icon: "chartColumnIncreasing", href: classHref("grades") },
                { label: "Class settings", icon: "settings", href: classHref("settings") },
              ] as MenuAction[])
            : []),
          { label: viewer.kind === "student" ? "All my classes" : "All classes", icon: "layoutGrid", href: crumbs[1].href as string },
        ]}
      />
      {setWork && (
        <SetWorkPanel
          classId={cls.id}
          className={cls.name}
          kind={setWork}
          onClose={() => {
            setSetWork(null);
            if (setParam) router.replace(classHref(tab), { scroll: false });
          }}
        />
      )}
      <div className="mt-2 lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-10">
      {/* The class's sections: a list down the left on wide screens and a dropdown on phones,
          not a strip across the top (owner, 11 Nov 2026; docs/portal-structure.md, pattern 5). */}
      <nav data-guide="class-tabs" aria-label="Class sections" className="mb-5 lg:mb-0">
        <div className="lg:hidden">
          <label className="t-eyebrow mb-1 block" htmlFor="class-section">
            Section
          </label>
          <Select id="class-section" value={tab} onChange={(e) => router.push(classHref(e.target.value), { scroll: false })} className="w-full">
            {tabs.map((t) => (
              <option key={t} value={t}>
                {TAB_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <ul className="portal-section-nav hidden lg:sticky lg:top-[calc(var(--portal-topbar-h)+1.5rem)] lg:block">
          {tabs.map((t) => {
            const active = t === tab;
            return (
              <li key={t}>
                <Link href={classHref(t)} scroll={false} aria-current={active ? "page" : undefined} className={`portal-section-link ${active ? "portal-section-link--active" : ""}`}>
                  {TAB_LABELS[t]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">

      {viewer.kind !== "staff" && (
        <JoinLessonCard
          who={viewer.kind === "teacher" ? { kind: "teacher" } : viewer.kind === "student" ? { kind: "student", childId: viewer.childId } : { kind: "parent", childId: viewer.childId }}
          classId={cls.id}
          className="mb-6"
        />
      )}

      {tab === "stream" && <StreamTab classId={cls.id} viewer={viewer} area={area} classHref={classHref} />}

      {tab === "classwork" && <ClassworkTab classId={cls.id} classTitle={cls.name} viewer={viewer} classHref={classHref} />}

      {tab === "lessons" && <CourseTab classId={cls.id} viewer={viewer} routes={{ area, lessonBase, extra, classHref }} />}

      {tab === "people" &&
        (isStaff ? (
          <Panel title="People">
            <ParticipantsTab classId={cls.id} />
          </Panel>
        ) : (
          <MeetYourTeachers classId={cls.id} />
        ))}

      {tab === "attendance" && isStaff && <ClassAttendanceTab classId={cls.id} area={area} />}

      {tab === "grades" &&
        (isStaff ? (
          <StaffGrades classId={cls.id} />
        ) : (
          <Panel title="Grades">
            <GradesTab classId={cls.id} viewer={viewer} />
          </Panel>
        ))}

      {tab === "insights" && isStaff && <ClassInsightsTab classId={cls.id} classHref={classHref} />}

      {tab === "settings" && isStaff && <ClassSettingsTab classId={cls.id} className={cls.name} subject={cls.subject} canRename={viewer.kind === "staff"} />}
      </div>
      </div>
    </div>
  );
}
