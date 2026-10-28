"use client";

import Link from "next/link";
import { ukToday } from "@/lib/learn/ukTime";
import { useEffect, useState } from "react";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { DashboardHero } from "@/components/learn/DashboardHero";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { myTeachingClasses } from "@/lib/learn/classes";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TeachNow } from "@/components/learn/teach/TeachNow";
import { EnrichmentSupervisorLink } from "@/components/learn/enrichment/SupervisorLink";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { SignaturePrompts } from "@/components/learn/SignaturePrompts";
import { getSupabaseClient } from "@/lib/supabase/client";
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
          .gte("cover_date", ukToday())
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
  return (
    <DashboardWithPanel viewer={{ kind: "teacher", classIds }}>
      <div className="space-y-5">
        <DashboardHero subtitle="What needs doing today" chips={[{ label: "Lessons this week", value: slots === null ? "…" : slots.length, tone: "yellow" }, { label: "My classes", value: classIds.length, tone: "white" }]} />

        <ActionCentreWidget role="teach" />

        <TeachNow slots={slots} />

        <SignaturePrompts />

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

        <AnnouncementsFeed classIds={classIds} canPost={classIds.length > 0} postClassId={classIds[0]} postScope="class" limit={3} viewAllHref="/teach/announcements" />
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
