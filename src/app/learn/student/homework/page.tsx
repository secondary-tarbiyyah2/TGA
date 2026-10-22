"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";

function StudentHomeworkContent() {
  const supabase = getSupabaseClient();
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: account } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
      setChildId((account?.child_id as string) || null);
    })();
  }, [supabase]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "Home", href: "/student/dashboard" }, { label: "To do", href: "/student/todo" }, { label: "My homework" }]} title="My homework" subtitle="Hand in your work and read your teacher's feedback." />
      <div className="rounded-2xl border border-gold-light bg-white p-6">{childId ? <HomeworkForChild childId={childId} canSubmit /> : <p className="text-sm text-ink/65">Loading…</p>}</div>
    </div>
  );
}

export default function StudentHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <StudentHomeworkContent />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
