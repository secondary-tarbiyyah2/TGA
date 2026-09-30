"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { FamilyFees } from "@/components/learn/FamilyFees";
import { UpcomingLessons } from "@/components/learn/UpcomingLessons";
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

type Child = { id: string; name: string; year_group_id: string | null; year_groups?: { name: string } | null };

function useChildClassIds(childId: string) {
  const supabase = getSupabaseClient();
  const [classIds, setClassIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("enrolments")
      .select("class_id")
      .eq("child_id", childId)
      .then(({ data }) => setClassIds((data || []).map((e) => e.class_id as string)));
  }, [supabase, childId]);

  return classIds;
}

function ChildTimetable({ classIds }: { classIds: string[] | null }) {
  const supabase = getSupabaseClient();
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);

  useEffect(() => {
    if (!supabase || classIds === null) return;
    (classIds.length === 0
      ? Promise.resolve({ data: [] as TimetableSlot[] })
      : supabase
          .from("timetable_slots")
          .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
          .in("class_id", classIds)
    ).then(({ data }) => setSlots((data as unknown as TimetableSlot[]) || []));
  }, [supabase, classIds]);

  if (slots === null) return <p className="text-sm text-ink/60">Loading timetable…</p>;
  return <TimetableGrid slots={slots} />;
}

function ChildCard({ child }: { child: Child }) {
  const classIds = useChildClassIds(child.id);
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-h3 font-semibold text-ink">
          {child.name}
          {child.year_groups?.name ? <span className="ml-2 text-sm font-normal text-ink/60">{child.year_groups.name}</span> : null}
        </h2>
        <PrintButton />
      </div>
      <div className="mt-4">
        <ChildTimetable classIds={classIds} />
      </div>
      <div className="mt-4 border-t border-gold-light/30 pt-4">
        <h3 className="text-sm font-medium text-ink">Lessons</h3>
        <div className="mt-2">
          <UpcomingLessons
            classIds={classIds || []}
            basePath="/family/lessons/view"
            extraQuery={`&child=${child.id}`}
            emptyLabel="No lessons in the next two weeks."
          />
        </div>
      </div>

      <div className="mt-4 border-t border-gold-light/30 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Homework &amp; grades</h3>
          <div className="flex gap-3">
            <Link href={`/family/homework?child=${child.id}`} className="text-sm text-gold-700 underline">
              View all homework
            </Link>
            <Link href="/family/reports" className="text-sm text-gold-700 underline">
              Term reports
            </Link>
            <Link href="/family/messages" className="text-sm text-gold-700 underline">
              Messages
            </Link>
          </div>
        </div>
        <div className="mt-2 grid gap-6 sm:grid-cols-2">
          <HomeworkDueWidget childId={child.id} />
          <LatestGradesWidget childId={child.id} />
          <QuranProgressWidget childId={child.id} />
        </div>
      </div>

      <WeeklyTarbiyahNoteWidget childId={child.id} />

      {classIds && classIds.length > 0 && (
        <div className="mt-4 border-t border-gold-light/30 pt-4">
          <AnnouncementsFeed classIds={classIds} limit={3} />
        </div>
      )}
    </div>
  );
}

function FamilyContent() {
  const { session } = useLearnSession();
  const supabase = getSupabaseClient();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildDob, setNewChildDob] = useState("");
  const [busy, setBusy] = useState(false);

  const loadChildren = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("children").select("id, name, year_group_id, year_groups(name)").order("name");
    setChildren((data as unknown as Child[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const addChild = async () => {
    if (!supabase || !newChildName.trim() || !newChildDob) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("children")
        .insert({ parent_user_id: user.id, name: newChildName.trim(), dob: newChildDob });
      if (!error) {
        setNewChildName("");
        setNewChildDob("");
        await loadChildren();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">My children</h1>
            <p className="mt-1 text-sm text-ink/60">
              Signed in as {session && session !== "loading" ? session.user.email : ""}.
            </p>
          </div>
          <div className="print:hidden flex items-center gap-2">
            <ReportConcernLink />
          </div>
        </div>

        <div className="print:hidden mt-4 flex flex-wrap items-end gap-2 border-t border-gold-light/30 pt-4">
          <div>
            <label className="block text-xs font-medium text-ink/70">Child&apos;s name</label>
            <input
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">Date of birth</label>
            <input
              type="date"
              value={newChildDob}
              onChange={(e) => setNewChildDob(e.target.value)}
              className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={addChild}
            disabled={busy}
            className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-50 text-white hover:bg-gold-900 transition-colors"
          >
            Add child
          </button>
        </div>
      </div>

      {children === null && <p className="text-sm text-ink/60">Loading…</p>}
      {children && children.length === 0 && (
        <p className="text-sm text-ink/60">No children added yet — add your child above to see their timetable.</p>
      )}
      <SignaturePrompts />

      {children?.map((child) => (
        <ChildCard key={child.id} child={child} />
      ))}

      {children && children.length > 0 && <FamilyFees familyChildren={children} />}

      <AnnouncementsFeed />

      <IcsFeedLink />
    </div>
  );
}

export default function FamilyDashboardPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <FamilyContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
