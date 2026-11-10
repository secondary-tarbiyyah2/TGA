"use client";

import { DashboardHero } from "@/components/learn/DashboardHero";
import { useNavBadges } from "@/lib/learn/navBadges";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { PrintScope } from "@/components/learn/printScope";
import { JoinLessonCard } from "@/components/learn/live/JoinLessonCard";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";
import { LatestGradesWidget } from "@/components/learn/LatestGradesWidget";
import { QuranProgressWidget } from "@/components/learn/QuranProgressWidget";
import { GcseProgressWidget } from "@/components/learn/GcseTracker";
import { WeeklyTarbiyahNoteWidget } from "@/components/learn/WeeklyTarbiyahNoteWidget";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { UpNextCard } from "@/components/learn/UpNextCard";
import { Icon } from "@/components/learn/Icon";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimetableSlot } from "@/lib/learn/timetable";

// Younger year groups (Reception - Year 3) get a bigger, simpler view, 
// same data and RLS as every other student account (see the Phase A
// ground rule: "the only difference for younger students is a
// simpler/larger-UI frontend view, not a different data/permission
// model"). This is a UI-only heuristic on the year group's name string,
// never used for any access decision.
function isYoungerYearGroup(yearGroupName: string | undefined): boolean {
  if (!yearGroupName) return false;
  const match = yearGroupName.match(/year\s*(\d+)/i);
  if (match) return Number(match[1]) <= 3;
  return /reception|nursery/i.test(yearGroupName);
}

function StudentContent() {
  const supabase = getSupabaseClient();
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);
  const [yearGroupName, setYearGroupName] = useState<string | undefined>(undefined);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: account } = await supabase
        .from("student_accounts")
        .select("child_id, children(year_groups(name))")
        .eq("profile_id", user.id)
        .maybeSingle();
      const childId = account?.child_id as string | undefined;
      const yg = (account?.children as unknown as { year_groups?: { name?: string } } | null)?.year_groups?.name;
      setYearGroupName(yg);
      setChildId(childId || null);

      if (!childId) {
        setSlots([]);
        return;
      }
      const { data: enrolments } = await supabase.from("enrolments").select("class_id").eq("child_id", childId);
      const ids = (enrolments || []).map((e) => e.class_id);
      setClassIds(ids);
      if (ids.length === 0) {
        setSlots([]);
        return;
      }
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
        .in("class_id", ids);
      setSlots((data as unknown as TimetableSlot[]) || []);
    })();
  }, [supabase]);

  const simplified = isYoungerYearGroup(yearGroupName);
  const badges = useNavBadges("student");
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "student", childId } : null), [childId]);
  const myClasses = useViewerClasses(viewer);

  // What a pupil needs now: the next lesson (and its join button), then
  // what is due. Everything else is one tap away in the menu (merits and
  // house points on Progress, the calendar and notices under School), so
  // the page stays short on a phone. The timetable is folded away.
  const content = (
    <div className="space-y-6">
      <DashboardHero
        area="student"
        subtitle="Ready to learn today?"
        chips={[
          { label: "Lessons today", value: slots === null ? "…" : slots.filter((s) => Number(s.weekday) === ((new Date().getDay() + 6) % 7) + 1).length, href: "/student/classes" },
          { label: "Homework to do", value: badges.todo ?? "…", tone: badges.todo ? "pink" : undefined, href: "/student/todo" },
          { label: "Lessons a week", value: slots === null ? "…" : slots.length },
        ]}
      />

      {childId && <JoinLessonCard who={{ kind: "student", childId }} />}
      {childId && <UpNextCard classIds={slots === null ? null : classIds} childId={childId} lessonHref={(id) => `/student/lessons/view?id=${id}`} homeworkHref="/student/todo" />}
      <ActionCentreWidget role="student" />

      {viewer && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">My classes</h2>
            <Link href="/student/classes" className="text-sm font-medium text-teal-700 hover:underline">
              See all
            </Link>
          </div>
          <ClassGrid
            viewer={viewer}
            classes={myClasses ? myClasses.slice(0, 4) : null}
            hrefFor={(c) => `/student/class?id=${c.id}`}
            emptyLabel="You're not in any classes yet."
            controls={false}
          />
        </section>
      )}

      {childId && (
        <section className="rounded-2xl border border-gold-light bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3 font-semibold text-ink">How I&apos;m doing</h2>
            <Link href="/student/behaviour" className="text-sm font-medium text-teal-700 hover:underline">
              My merits and badges
            </Link>
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <LatestGradesWidget childId={childId} />
            <QuranProgressWidget childId={childId} />
            <GcseProgressWidget childId={childId} />
          </div>
          <WeeklyTarbiyahNoteWidget childId={childId} limit={1} />
        </section>
      )}

      <details className="group rounded-2xl border border-gold-light bg-white" open={simplified || undefined}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
          <h2 className="text-h3 font-semibold text-ink">My timetable</h2>
          <span className="flex items-center gap-2 text-sm text-ink/65">
            {slots === null ? "" : `${slots.length} ${slots.length === 1 ? "lesson" : "lessons"} a week`}
            <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-gold-light p-5">
          <div className="print:hidden mb-3 flex items-center justify-end gap-2">
            <PrintButton />
            <ReportConcernLink />
          </div>
          <PrintScope title="My timetable">
            {slots === null ? <p className="text-sm text-ink/65">Loading…</p> : <TimetableGrid slots={slots} simplified={simplified} yearGroups={yearGroupName ? [yearGroupName] : undefined} />}
          </PrintScope>
          <IcsFeedLink />
        </div>
      </details>

      <AnnouncementsFeed classIds={classIds} limit={3} hideWhenEmpty />
    </div>
  );

  if (!childId) return content;
  return (
    <DashboardWithPanel viewer={{ kind: "student", childId, classIds }} wideOnly>
      {content}
    </DashboardWithPanel>
  );
}

export default function StudentDashboardPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <StudentContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
