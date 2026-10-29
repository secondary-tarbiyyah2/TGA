"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { QuranProgressForm } from "@/components/learn/QuranProgressForm";
import { GcseClassPanel } from "@/components/learn/GcseTracker";
import { WeeklyTarbiyahNoteForm } from "@/components/learn/WeeklyTarbiyahNoteForm";
import { useMyClasses } from "@/lib/learn/useMyClasses";
import { PageHeader } from "@/components/learn/PageHeader";
import { ClassGradebook } from "@/components/learn/assessment/ClassGradebook";

type Child = { id: string; name: string };

function AssessmentContent() {
  const supabase = getSupabaseClient();
  const isAssessmentLead = useLearnPermission("assessment_lead");
  const [classId, setClassId] = useState("");
  const classes = useMyClasses((firstId) => setClassId((current) => current || firstId));
  const [children, setChildren] = useState<{ classId: string; list: Child[] } | null>(null);
  const [childId, setChildId] = useState("");

  useEffect(() => {
    if (!supabase || !classId) return;
    let alive = true;
    supabase
      .from("enrolments")
      .select("child_id, children(id, name)")
      .eq("class_id", classId)
      .then(({ data }) => {
        if (!alive) return;
        const kids = ((data as unknown as { children: Child | null }[]) || []).map((r) => r.children).filter(Boolean) as Child[];
        kids.sort((a, b) => a.name.localeCompare(b.name));
        setChildren({ classId, list: kids });
      });
    return () => {
      alive = false;
    };
  }, [supabase, classId]);

  const pupils = children && children.classId === classId ? children.list : null;
  const cls = (classes || []).find((c) => c.id === classId);
  const child = pupils?.find((c) => c.id === childId);

  return (
    <div className="space-y-6">
      <PageHeader title="Gradebook" subtitle="Enter a whole class's results at once. The same gradebook is on each class's Grades tab." />
      {classes !== null && classes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">
          You don&apos;t teach any classes yet. Once the office gives you a class (or the published timetable does), it appears here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-ink">
            Class{" "}
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setChildId("");
              }}
              className="ml-1 min-h-10 max-w-[16rem] rounded-lg border border-gold-light bg-white px-3 py-2 text-sm font-normal"
            >
              {(classes || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {pupils && <span className="text-sm text-ink/65">{pupils.length} pupil{pupils.length === 1 ? "" : "s"}</span>}
        </div>
      )}

      {classId && <ClassGradebook key={classId} classId={classId} subjectId={cls?.subject_id || null} pupils={pupils} selected={childId} onSelect={(id) => setChildId(id === childId ? "" : id)} />}

      {child && (
        <section aria-label={`${child.name}: progress and notes`} className="space-y-4">
          <h2 className="font-serif text-h3 font-semibold text-ink">{child.name}</h2>
          {isAssessmentLead && <QuranProgressForm childId={child.id} classId={classId || null} />}
          <WeeklyTarbiyahNoteForm childId={child.id} classId={classId} childName={child.name} />
        </section>
      )}

      {classId && <GcseClassPanel classId={classId} />}
    </div>
  );
}

export default function TeachAssessmentPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <AssessmentContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
