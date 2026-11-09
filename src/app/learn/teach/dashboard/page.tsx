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
import { SignaturePrompts } from "@/components/learn/SignaturePrompts";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useNavBadges } from "@/lib/learn/navBadges";
import { RecentLessons } from "@/components/learn/curriculum/RecentLessons";
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

  // Home answers "what do I need to do today?" and nothing else: the counts,
  // today's lessons and quick actions (TeachNow), anything to sign, cover,
  // and the latest few announcements. Timetable, classes and house points
  // live on their own pages (Calendar, My classes, Houses and stars).
  const badges = useNavBadges("teach");
  // timetable weekday: 1 = Monday ... 7 = Sunday (ISO)
  const isoToday = ((new Date().getDay() + 6) % 7) + 1;
  const todayCount = slots === null ? "…" : slots.filter((s) => Number(s.weekday) === isoToday).length;
  return (
    <DashboardWithPanel viewer={{ kind: "teacher", classIds }}>
      <div className="space-y-6">
        <DashboardHero
          area="teach"
          subtitle="Here's what needs your attention."
          chips={[
            { label: "Lessons today", value: todayCount, href: "/teach/today" },
            { label: "Work to review", value: badges.review ?? "…", tone: "pink", href: "/teach/review" },
            { label: "My classes", value: classIds.length, href: "/teach/classes" },
            { label: "Unread messages", value: badges.messages ?? "…", tone: "pink", href: "/teach/messages" },
          ]}
        />

        <ActionCentreWidget role="teach" />

        <TeachNow slots={slots} />

        <RecentLessons area="teach" />

        <SignaturePrompts limit={3} />

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
                  <span className="text-ink/65">{c.covering_teacher_user_id === userId ? "you are covering" : "you are being covered"}</span>
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
