"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useMyClasses } from "@/lib/learn/useMyClasses";
import { HomeworkWorkspace } from "@/components/learn/homework/HomeworkWorkspace";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";

function TeachHomeworkContent() {
  const supabase = getSupabaseClient();
  const classes = useMyClasses();
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const classIds = useMemo(() => (classes || []).map((c) => c.id), [classes]);

  const load = useCallback(async () => {
    if (!supabase || classes === null) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Homework this teacher set, plus homework any colleague set for a class they teach.
    const scope = classIds.length > 0 ? `teacher_id.eq.${user.id},class_id.in.(${classIds.join(",")})` : `teacher_id.eq.${user.id}`;
    let q = supabase.from("homework").select(HOMEWORK_COLUMNS).or(scope);
    if (!showDeleted) q = q.is("archived_at", null);
    const { data } = await q.order("due_at", { ascending: false }).limit(80);
    setHomework((data as unknown as Homework[]) || []);
  }, [supabase, classes, classIds, showDeleted]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  return (
    <HomeworkWorkspace
      scope="teach"
      subtitle="Set homework for your classes, then mark what is handed in."
      classes={classes}
      homework={homework}
      showDeleted={showDeleted}
      onShowDeleted={setShowDeleted}
      onReload={load}
    />
  );
}

export default function TeachHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <TeachHomeworkContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
