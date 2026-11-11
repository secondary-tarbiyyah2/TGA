"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { DashboardHero } from "@/components/learn/DashboardHero";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { myTeachingClasses } from "@/lib/learn/classes";
import { LearnGate } from "@/components/learn/LearnGate";
import { useLearnSession } from "@/lib/learn/session";
import { isSencoOnly } from "@/lib/learn/nav";
import { LearnShell } from "@/components/learn/LearnShell";
import { TeachNow } from "@/components/learn/teach/TeachNow";
import { EnrichmentSupervisorLink } from "@/components/learn/enrichment/SupervisorLink";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { getSupabaseClient } from "@/lib/supabase/client";
import { RecentLessons } from "@/components/learn/curriculum/RecentLessons";
import { localDateKey } from "@/lib/learn/calendar";
import type { TimetableSlot } from "@/lib/learn/timetable";
import { PushOptIn } from "@/components/learn/PushOptIn";

type Cover = {
  id: string;
  cover_date: string;
  reason: string | null;
  original_teacher_user_id: string;
  covering_teacher_user_id: string;
  timetable_slots?: { classes?: { name: string } | null; subjects?: { name: string } | null } | null;
};

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
        myTeachingClasses(),
      ]);
      setSlots((slotRes.data as unknown as TimetableSlot[]) || []);
      setCovers((coverRes.data as unknown as Cover[]) || []);
      setClassIds(roleRes.map((c) => c.id));
    })();
  }, [supabase]);

  // Today answers "what do I need to do today?" and nothing else (owner, 11 Nov 2026): quick
  // actions at the very top, then the day's lessons, then what is waiting, sorted into
  // categories (documents to sign included), then cover and the latest announcements.
  // Registers are left out of Waiting for you here because Your day shows each one.
  return (
    <DashboardWithPanel viewer={{ kind: "teacher", classIds }}>
      <div className="space-y-6">
        <DashboardHero area="teach" />

        <TeachNow slots={slots} classIds={classIds} />

        <ActionCentreWidget role="teach" skipAreas={["Registers"]} />

        {covers && covers.length > 0 && (
          <section className="rounded-2xl border border-gold-light bg-white px-5 py-4" aria-labelledby="cover-heading">
            <h2 id="cover-heading" className="text-sm font-semibold text-ink">
              Cover coming up
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {covers.slice(0, 3).map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{new Date(c.cover_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span>
                    {c.timetable_slots?.subjects?.name} ({c.timetable_slots?.classes?.name})
                  </span>
                  <span className="text-ink/65">{c.covering_teacher_user_id === userId ? "You are covering" : "You are being covered"}</span>
                </li>
              ))}
            </ul>
            {covers.length > 3 && (
              <Link href="/teach/calendar" className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline">
                {covers.length - 3} more on the calendar
              </Link>
            )}
          </section>
        )}

        <EnrichmentSupervisorLink />

        {/* Read-only here: posting lives on the Announcements page (and each class's Stream), where you choose the class. */}
        <AnnouncementsFeed classIds={classIds} limit={3} viewAllHref="/teach/announcements" hideWhenEmpty />

        <RecentLessons area="teach" compact />
        <PushOptIn />
      </div>
    </DashboardWithPanel>
  );
}

/** A SENCo-only account has no classes: its home is the SEND register. */
function SencoHome({ children }: { children: React.ReactNode }) {
  const { roles } = useLearnSession();
  const sencoOnly = isSencoOnly(roles.map((r) => r.role));
  useEffect(() => {
    if (sencoOnly) window.location.replace("/teach/send");
  }, [sencoOnly]);
  return sencoOnly ? <p className="text-ink/65">Opening the SEND register…</p> : <>{children}</>;
}

export default function TeachDashboardPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "senco"]}>
        <SencoHome>
          <LearnShell role="teach">
            <TeachContent />
          </LearnShell>
        </SencoHome>
      </LearnGate>
    </section>
  );
}
