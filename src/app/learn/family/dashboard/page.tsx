"use client";

import { UpNextCard } from "@/components/learn/UpNextCard";
import { Icon } from "@/components/learn/Icon";
import { DashboardHero } from "@/components/learn/DashboardHero";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { PrintScope } from "@/components/learn/printScope";
import { JoinLessonCard } from "@/components/learn/live/JoinLessonCard";
import { ChildDetailsBanner } from "@/components/learn/pupil/ChildDetailsBanner";
import { UpcomingLessons } from "@/components/learn/UpcomingLessons";
import { HomeworkDueWidget } from "@/components/learn/HomeworkDueWidget";
import { LatestGradesWidget } from "@/components/learn/LatestGradesWidget";
import { QuranProgressWidget } from "@/components/learn/QuranProgressWidget";
import { GcseProgressWidget } from "@/components/learn/GcseTracker";
import { WeeklyTarbiyahNoteWidget } from "@/components/learn/WeeklyTarbiyahNoteWidget";
import { FamilyRewards } from "@/components/learn/rewards/RewardsCards";
import { ui } from "@/components/learn/ui";
import { AnnouncementsFeed } from "@/components/learn/AnnouncementsFeed";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimetableSlot } from "@/lib/learn/timetable";
import { ukToday } from "@/lib/learn/ukTime";

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

function ChildTimetable({ classIds, yearGroup }: { classIds: string[] | null; yearGroup?: string }) {
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

  if (slots === null) return <p className="text-sm text-ink/65">Loading timetable…</p>;
  return <TimetableGrid slots={slots} yearGroups={yearGroup ? [yearGroup] : undefined} />;
}

function ChildCard({ child }: { child: Child }) {
  const classIds = useChildClassIds(child.id);
  return (
    <div className="space-y-4">
      <UpNextCard
        heading={`Up next for ${child.name.split(" ")[0]}`}
        classIds={classIds}
        childId={child.id}
        lessonHref={(id) => `/family/lessons/view?id=${id}&child=${child.id}`}
        homeworkHref={`/family/todo?child=${child.id}`}
      />
      <section aria-label={child.name} className="rounded-2xl border border-gold-light bg-white p-4 sm:p-6">
        <h2 className="text-h3 font-semibold text-ink">
          {child.name}
          {child.year_groups?.name ? <span className="ml-2 text-sm font-normal text-ink/65">{child.year_groups.name}</span> : null}
        </h2>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-ink">Homework and progress</h3>
            <Link href={`/family/homework?child=${child.id}`} className="text-sm font-medium text-teal-700 hover:underline">
              All homework
            </Link>
          </div>
          <div className="mt-2 grid gap-6 sm:grid-cols-2">
            <HomeworkDueWidget childId={child.id} />
            <LatestGradesWidget childId={child.id} />
            <QuranProgressWidget childId={child.id} />
            <GcseProgressWidget childId={child.id} />
          </div>
        </div>

        <WeeklyTarbiyahNoteWidget childId={child.id} limit={1} />

        <details className="group mt-4 border-t border-gold-light pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-1 text-sm font-semibold text-ink">
            Timetable and upcoming lessons
            <Icon name="chevronDown" className="h-4 w-4 text-ink/65 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-3">
            <div className="print:hidden mb-2 flex justify-end">
              <PrintButton />
            </div>
            <PrintScope title={`${child.name}: timetable`}>
              <ChildTimetable classIds={classIds} yearGroup={child.year_groups?.name} />
            </PrintScope>
            <h4 className="mt-4 text-sm font-medium text-ink">Next two weeks</h4>
            <div className="mt-2">
              <UpcomingLessons classIds={classIds || []} basePath="/family/lessons/view" extraQuery={`&child=${child.id}`} emptyLabel="No lessons in the next two weeks." />
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}

const CHILD_KEY = "tga-family-dashboard-child";

function FamilyContent() {
  const supabase = getSupabaseClient();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildDob, setNewChildDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  // With several children, show one at a time (chosen with the chips) rather
  // than stacking every child's full card down the page. Remembered per browser.
  const [chosen, setChosen] = useState("");

  const loadChildren = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("children").select("id, name, year_group_id, year_groups(name)").order("name");
    setChildren((data as unknown as Child[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadChildren();
    try {
      setChosen(window.localStorage.getItem(CHILD_KEY) || "");
    } catch {
      /* storage unavailable: first child */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const choose = (id: string) => {
    setChosen(id);
    try {
      window.localStorage.setItem(CHILD_KEY, id);
    } catch {
      /* fine unremembered */
    }
  };

  const addChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!newChildName.trim()) return setAddError("Please enter your child's full name.");
    if (!newChildDob) return setAddError("Please enter your child's date of birth.");
    setBusy(true);
    setAddError(null);
    setAdded(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setAddError("Your session has ended. Please sign in again.");
      const { error } = await supabase.from("children").insert({ parent_user_id: user.id, name: newChildName.trim(), dob: newChildDob });
      if (error) return setAddError("We couldn't add your child just now. Please try again, or contact the school office.");
      setAdded(newChildName.trim());
      setNewChildName("");
      setNewChildDob("");
      await loadChildren();
    } finally {
      setBusy(false);
    }
  };

  // Class notices for every child's classes, not just school-wide ones
  // (the feed only shows class announcements for the class ids it is given).
  const [allClassIds, setAllClassIds] = useState<string[]>([]);
  const childKey = (children || []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!supabase || !childKey) return;
    supabase
      .from("enrolments")
      .select("class_id")
      .in("child_id", childKey.split(","))
      .then(({ data }) => setAllClassIds([...new Set((data || []).map((e) => e.class_id as string))]));
  }, [supabase, childKey]);

  const hasChildren = !!children && children.length > 0;
  const current = children?.find((c) => c.id === chosen) || children?.[0];

  // What a parent needs first: anything waiting on them, then what's next
  // for the child, then the detail. Adding a child sits at the bottom
  // (it's rare), unless there are no children yet.
  return (
    <DashboardWithPanel viewer={{ kind: "parent", children: (children || []).map((c) => ({ id: c.id, name: c.name })) }} wideOnly>
      <div className="space-y-6">
        <DashboardHero subtitle="Your children's school life in one place" />

        {hasChildren && (
          <nav aria-label="Quick actions" className="flex flex-wrap gap-2 print:hidden">
            <Link href="/family/absences" className={ui.btnPrimary}>
              Report an absence
            </Link>
            <Link href="/family/messages" className={ui.btnSecondary}>
              Message a teacher
            </Link>
          </nav>
        )}

        <ActionCentreWidget role="family" />
        <ChildDetailsBanner />
        <JoinLessonCard who={{ kind: "parent" }} />

        {children === null && <div className="h-32 animate-pulse rounded-2xl bg-white" />}
        {children && children.length > 1 && (
          <div role="group" aria-label="Choose a child" className="flex flex-wrap gap-2">
            {children.map((c) => (
              <button key={c.id} type="button" aria-pressed={current?.id === c.id} onClick={() => choose(c.id)} className={`${current?.id === c.id ? ui.chipOn : ui.chip} min-h-10`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        {current && <ChildCard key={current.id} child={current} />}

        {hasChildren && <FamilyRewards childIds={children.map((c) => c.id)} />}

        <AnnouncementsFeed classIds={allClassIds} limit={3} hideWhenEmpty />

        <details className="group rounded-2xl border border-gold-light bg-white print:hidden" open={children !== null && !hasChildren ? true : undefined}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-3">
            <h2 className="text-h3 font-semibold text-ink">{hasChildren ? "Add another child" : "Add your child"}</h2>
            <Icon name="chevronDown" className="h-4 w-4 text-ink/65 transition-transform group-open:rotate-180" />
          </summary>
          <form onSubmit={addChild} className="border-t border-gold-light p-5">
            {!hasChildren && children !== null && <p className="mb-3 text-sm text-ink/70">Add your child to see their timetable, homework and reports.</p>}
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-auto">
                <label htmlFor="new-child-name" className="block text-xs font-medium text-ink/70">
                  Child&apos;s full name
                </label>
                <input id="new-child-name" value={newChildName} onChange={(e) => setNewChildName(e.target.value)} autoComplete="off" className={`mt-1 ${ui.input}`} placeholder="Maryam Khan" />
              </div>
              <div className="w-full sm:w-auto">
                <label htmlFor="new-child-dob" className="block text-xs font-medium text-ink/70">
                  Date of birth
                </label>
                <input id="new-child-dob" type="date" value={newChildDob} max={ukToday()} onChange={(e) => setNewChildDob(e.target.value)} className={`mt-1 ${ui.input}`} />
              </div>
              <button type="submit" disabled={busy} className={ui.btnPrimary}>
                {busy ? "Adding…" : "Add child"}
              </button>
            </div>
            {addError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{addError}</p>}
            {added && (
              <p role="status" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                {added} has been added. Next, please{" "}
                <Link href="/family/child-details" className="font-medium underline">
                  complete their details
                </Link>
                .
              </p>
            )}
          </form>
        </details>
      </div>
    </DashboardWithPanel>
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
