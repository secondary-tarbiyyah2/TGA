"use client";

import { useCallback, useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { HomeworkWorkspace } from "@/components/learn/homework/HomeworkWorkspace";
import { HOMEWORK_COLUMNS, type Homework } from "@/lib/learn/homework";
import { getSupabaseClient } from "@/lib/supabase/client";

type ClassOpt = { id: string; name: string };

function AdminHomeworkContent() {
  const supabase = getSupabaseClient();
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [homework, setHomework] = useState<Homework[] | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    let hwQuery = supabase.from("homework").select(HOMEWORK_COLUMNS);
    if (!showDeleted) hwQuery = hwQuery.is("archived_at", null);
    const [{ data: cls }, { data: hw }] = await Promise.all([supabase.from("classes").select("id, name").order("name"), hwQuery.order("due_at", { ascending: false })]);
    setClasses((cls as ClassOpt[]) || []);
    setHomework((hw as unknown as Homework[]) || []);
  }, [supabase, showDeleted]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
  }, [load]);

  return (
    <HomeworkWorkspace
      scope="admin"
      subtitle="Classwork set across every class, with late and missing work. Each class also has its own Classwork tab, where work is set and marked."
      classes={classes}
      homework={homework}
      showDeleted={showDeleted}
      onShowDeleted={setShowDeleted}
      onReload={load}
    />
  );
}

export default function AdminHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminHomeworkContent />
      </LearnGate>
    </section>
  );
}
