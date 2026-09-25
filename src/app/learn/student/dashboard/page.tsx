"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { useLearnSession, useLearnSignOut } from "@/lib/learn/session";
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
  const signOut = useLearnSignOut();
  const supabase = getSupabaseClient();
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);
  const [yearGroupName, setYearGroupName] = useState<string | undefined>(undefined);

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

      if (!childId) {
        setSlots([]);
        return;
      }
      const { data: enrolments } = await supabase.from("enrolments").select("class_id").eq("child_id", childId);
      const classIds = (enrolments || []).map((e) => e.class_id);
      if (classIds.length === 0) {
        setSlots([]);
        return;
      }
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
        .in("class_id", classIds);
      setSlots((data as unknown as TimetableSlot[]) || []);
    })();
  }, [supabase]);

  const simplified = isYoungerYearGroup(yearGroupName);

  return (
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
          <button type="button" onClick={signOut} className="rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
            Sign out
          </button>
        </div>
      </div>

      <div className="mt-6">
        {slots === null ? <p className="text-sm text-ink/60">Loading…</p> : <TimetableGrid slots={slots} simplified={simplified} />}
      </div>

      <IcsFeedLink />
    </div>
  );
}

export default function StudentDashboardPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["student"]}>
        <StudentContent />
      </LearnGate>
    </section>
  );
}
