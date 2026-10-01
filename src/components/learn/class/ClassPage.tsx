"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { classBannerStyle, fetchClass, recordRecentPage, type ClassSummary, type ClassViewer } from "@/lib/learn/classes";
import type { Crumb } from "@/components/learn/PageHeader";
import { ParticipantsTab } from "@/components/learn/class/ParticipantsTab";
import { CourseTab } from "@/components/learn/class/CourseTab";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
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
  const childId = viewer.kind === "student" || viewer.kind === "parent" ? viewer.childId : null;

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
  const teacher = !childId;
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

/**
 * One class's own page, laid out like a Moodle course page: coloured
 * banner, breadcrumb, then tabs (Moodle's secondary navigation). The
 * default "Course" tab is Moodle's weekly format: week-by-week sections of
 * lessons, assignments and graded work, with a course index on the left.
 * The tab lives in the URL (?tab=grades) so it survives refresh.
 */
type TabKey = "course" | "assignments" | "grades" | "participants" | "announcements";

const TAB_LABELS: Record<TabKey, string> = {
  course: "Course",
  assignments: "Assignments",
  grades: "Grades",
  participants: "Participants",
  announcements: "Announcements",
};

export function ClassPage({ viewer }: { viewer: ClassViewer }) {
  const params = useSearchParams();
  const classId = params.get("id") || "";
  const [cls, setCls] = useState<ClassSummary | null | undefined>(undefined);
  const { area, lessonBase, extra } = routesFor(viewer);
  const childQuery = viewer.kind === "parent" ? `&child=${viewer.childId}` : "";
  const isStaff = viewer.kind === "teacher" || viewer.kind === "staff";

  const tabs: TabKey[] = isStaff ? ["course", "assignments", "grades", "participants", "announcements"] : ["course", "assignments", "grades", "announcements"];
  const requested = params.get("tab") as TabKey | null;
  const tab: TabKey = requested && tabs.includes(requested) ? requested : "course";
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
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-ink/55">
          {crumbs.map((c, i) => (
            <li key={c.label} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-teal-700 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-ink/75">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Course header: Moodle shows the course image/pattern behind the title */}
      <div className="relative mb-0 overflow-hidden rounded-t-2xl px-6 pb-6 pt-10 text-white" style={classBannerStyle(cls.id)}>
        {meta && <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{meta}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{cls.name}</h1>
      </div>

      <nav aria-label="Class sections" className="mb-6 flex gap-1 overflow-x-auto rounded-b-2xl border border-t-0 border-gold-light bg-white px-3">
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

      {viewer.kind !== "staff" && (
        <JoinLessonCard
          who={viewer.kind === "teacher" ? { kind: "teacher" } : viewer.kind === "student" ? { kind: "student", childId: viewer.childId } : { kind: "parent", childId: viewer.childId }}
          classId={cls.id}
          className="mb-6"
        />
      )}

      {tab === "course" && !isStaff && (
        <div className="mb-6">
          <MeetYourTeachers classId={cls.id} />
        </div>
      )}

      {tab === "course" && <CourseTab classId={cls.id} viewer={viewer} routes={{ area, lessonBase, extra, classHref }} />}

      {tab === "assignments" &&
        (viewer.kind === "student" || viewer.kind === "parent" ? (
          <Panel title="Assignments">
            <HomeworkForChild childId={viewer.childId} canSubmit={viewer.kind === "student"} classId={cls.id} />
          </Panel>
        ) : (
          <Panel
            title="Assignments"
            action={
              viewer.kind === "teacher" ? (
                <Link href="/teach/homework" className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900">
                  + Set homework
                </Link>
              ) : undefined
            }
          >
            <TeacherHomework classId={cls.id} />
          </Panel>
        ))}

      {tab === "grades" && (
        <Panel
          title="Grades"
          action={
            viewer.kind === "teacher" ? (
              <Link href="/teach/assessment" className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900">
                + Record a grade
              </Link>
            ) : undefined
          }
        >
          <GradesTab classId={cls.id} viewer={viewer} />
        </Panel>
      )}

      {tab === "participants" && isStaff && (
        <Panel title="Participants">
          <ParticipantsTab classId={cls.id} />
        </Panel>
      )}

      {tab === "announcements" && (
        <AnnouncementsFeed classIds={[cls.id]} includeSchool={false} canPost={isStaff} postClassId={cls.id} postScope="class" />
      )}
    </div>
  );
}
