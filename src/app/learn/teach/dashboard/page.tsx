"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TeachNow } from "@/components/learn/teach/TeachNow";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { JoinLessonCard } from "@/components/learn/live/JoinLessonCard";
import { EnrichmentSupervisorLink } from "@/components/learn/enrichment/SupervisorLink";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { TeacherLeaderboard } from "@/components/learn/behaviour/LeaderboardCards";
import { TeacherRewards } from "@/components/learn/rewards/RewardsCards";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { SignaturePrompts } from "@/components/learn/SignaturePrompts";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";

type Cover = {
  id: string;
  cover_date: string;
  reason: string | null;
  original_teacher_user_id: string;
  covering_teacher_user_id: string;
  timetable_slots?: { classes?: { name: string } | null; subjects?: { name: string } | null } | null;
};

const TEACHER: ClassViewer = { kind: "teacher" };

/** Moodle's "Course overview" block: the first few class cards, linking to all. */
function MyClassesStrip() {
  const classes = useViewerClasses(TEACHER);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">My classes</h2>
        <Link href="/teach/classes" className="text-sm font-medium text-teal-700 hover:underline">
          View all
        </Link>
      </div>
      <ClassGrid viewer={TEACHER} classes={classes ? classes.slice(0, 4) : null} hrefFor={(c) => `/teach/class?id=${c.id}`} emptyLabel="You haven't been assigned to any classes yet." controls={false} />
    </section>
  );
}

function TeachContent() {
  const supabase = getSupabaseClient();
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);
  const [covers, setCovers] = useState<Cover[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [classIds, setClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Own slots in published runs only (filtered server-side), cover
      // assignments and class roles fetched in parallel.
      const [slotRes, coverRes, roleRes] = await Promise.all([
        supabase
          .from("timetable_slots")
          .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name), timetable_runs!inner(status)")
          .eq("teacher_user_id", user.id)
          .eq("timetable_runs.status", "published"),
        supabase
          .from("cover_assignments")
          .select("id, cover_date, reason, original_teacher_user_id, covering_teacher_user_id, timetable_slots(classes(name), subjects(name))")
          .or(`original_teacher_user_id.eq.${user.id},covering_teacher_user_id.eq.${user.id}`)
          .gte("cover_date", localDateKey(new Date()))
          .order("cover_date", { ascending: true })
          .limit(20),
        supabase.from("user_roles").select("scope_id").eq("user_id", user.id).eq("scope_type", "class").in("role", ["teacher", "teaching_assistant_cover"]),
      ]);
      setSlots((slotRes.data as unknown as TimetableSlot[]) || []);
      setCovers((coverRes.data as unknown as Cover[]) || []);
      setClassIds((roleRes.data || []).map((r) => r.scope_id as string).filter(Boolean));
    })();
  }, [supabase]);

  return (
    <DashboardWithPanel viewer={{ kind: "teacher", classIds }}>
    <div className="space-y-5">
      <JoinLessonCard who={{ kind: "teacher" }} />

      <TeachNow slots={slots} />

      <EnrichmentSupervisorLink />

      <MyClassesStrip />

      <details className="group rounded-2xl border border-gold-light bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
          <span className="font-serif text-h3 font-semibold text-ink">My timetable</span>
          <span className="text-sm text-ink/55">{slots === null ? "" : `${slots.length} lessons a week`}</span>
        </summary>
        <div className="border-t border-gold-light p-5">
          <div className="print:hidden mb-3 flex items-center justify-end gap-2">
            <PrintButton />
            <ReportConcernLink />
          </div>
          {slots === null ? <div className="h-40 animate-pulse rounded-lg bg-cream" /> : <TimetableGrid slots={slots} showClassLabel />}
        </div>
      </details>

      <SignaturePrompts />

      <TeacherLeaderboard />
      <TeacherRewards />

      <AnnouncementsFeed classIds={classIds} canPost={classIds.length > 0} postClassId={classIds[0]} postScope="class" />

      {covers && covers.length > 0 && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Cover</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {covers.map((c) => (
              <li key={c.id} className="rounded-lg border border-gold-light/40 p-3">
                <span className="font-medium">{new Date(c.cover_date).toLocaleDateString("en-GB")}</span> —{" "}
                {c.timetable_slots?.subjects?.name} ({c.timetable_slots?.classes?.name}) —{" "}
                {c.covering_teacher_user_id === userId ? "you are covering" : "you are being covered"}
                {c.reason ? <span className="text-ink/60"> · {c.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <IcsFeedLink />
    </div>
    </DashboardWithPanel>
  );
}

export default function TeachDashboardPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
