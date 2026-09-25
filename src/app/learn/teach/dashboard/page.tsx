"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { UpcomingLessons } from "@/components/learn/UpcomingLessons";
import { useLearnSession, useLearnSignOut } from "@/lib/learn/session";
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
  const { session } = useLearnSession();
  const signOut = useLearnSignOut();
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

      // Own slots, from the run(s) they can see: RLS already limits this
      // to their own slots (any run status) plus other people's slots only
      // when published — filter to published OR a run they're actually
      // teaching in, client-side, to avoid mixing a stale draft into "my
      // weekly timetable" by accident.
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name), timetable_runs(status)")
        .eq("teacher_user_id", user.id);
      const rows = ((data as unknown as (TimetableSlot & { timetable_runs?: { status: string } | null })[]) || []).filter(
        (s) => s.timetable_runs?.status === "published"
      );
      setSlots(rows);

      const { data: coverRows } = await supabase
        .from("cover_assignments")
        .select("id, cover_date, reason, original_teacher_user_id, covering_teacher_user_id, timetable_slots(classes(name), subjects(name))")
        .or(`original_teacher_user_id.eq.${user.id},covering_teacher_user_id.eq.${user.id}`)
        .order("cover_date", { ascending: true });
      setCovers((coverRows as unknown as Cover[]) || []);

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("scope_id")
        .eq("user_id", user.id)
        .eq("scope_type", "class")
        .in("role", ["teacher", "teaching_assistant_cover"]);
      setClassIds((roleRows || []).map((r) => r.scope_id as string).filter(Boolean));
    })();
  }, [supabase]);

  return (
    <div className="space-y-6">
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
          {slots === null ? <p className="text-sm text-ink/60">Loading…</p> : <TimetableGrid slots={slots} showClassLabel />}
        </div>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Lessons</h2>
        <p className="mt-1 text-sm text-ink/60">Join a live lesson, set objectives/resources, and take the register.</p>
        <div className="mt-4">
          <UpcomingLessons classIds={classIds} basePath="/learn/teach/lessons/view" emptyLabel="No lessons scheduled in the next two weeks." />
        </div>
      </div>

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
  );
}

export default function TeachDashboardPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <TeachContent />
      </LearnGate>
    </section>
  );
}
