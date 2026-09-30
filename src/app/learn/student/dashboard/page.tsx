"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";
import { HomeworkDueWidget } from "@/components/learn/HomeworkDueWidget";
import { LatestGradesWidget } from "@/components/learn/LatestGradesWidget";
import { QuranProgressWidget } from "@/components/learn/QuranProgressWidget";
import { WeeklyTarbiyahNoteWidget } from "@/components/learn/WeeklyTarbiyahNoteWidget";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { SignaturePrompts } from "@/components/learn/SignaturePrompts";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimetableSlot } from "@/lib/learn/timetable";

// Younger year groups (Reception - Year 3) get a bigger, simpler view —
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
  const { session } = useLearnSession();
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
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "student", childId } : null), [childId]);
  const myClasses = useViewerClasses(viewer);

  const content = (
    <div className="space-y-6">
      {viewer && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">My classes</h2>
            <Link href="/student/classes" className="text-sm font-medium text-teal-700 hover:underline">
              View all
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

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">My timetable</h1>
            <p className="mt-1 text-sm text-ink/60">
              Signed in as {session && session !== "loading" ? session.user.email : ""}.
            </p>
          </div>
          <div className="print:hidden flex items-center gap-2">
            <PrintButton />
            <ReportConcernLink />
          </div>
        </div>

        <div className="mt-6">
          {slots === null ? <p className="text-sm text-ink/60">Loading…</p> : <TimetableGrid slots={slots} simplified={simplified} />}
        </div>

        <IcsFeedLink />
      </div>

      <SignaturePrompts />

      {childId && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-h3 font-semibold text-ink">Homework &amp; grades</h2>
            <div className="flex gap-3">
              <Link href="/student/homework" className="text-sm text-gold-700 underline">
                View all homework
              </Link>
              <Link href="/student/reports" className="text-sm text-gold-700 underline">
                Term reports
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <HomeworkDueWidget childId={childId} />
            <LatestGradesWidget childId={childId} />
            <QuranProgressWidget childId={childId} />
          </div>
          <WeeklyTarbiyahNoteWidget childId={childId} />
        </div>
      )}

      <AnnouncementsFeed classIds={classIds} />
    </div>
  );

  if (!childId) return content;
  return (
    <DashboardWithPanel viewer={{ kind: "student", childId, classIds }}>
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
