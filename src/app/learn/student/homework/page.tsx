"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HomeworkForChild } from "@/components/learn/HomeworkForChild";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";

function StudentHomeworkContent() {
  const supabase = getSupabaseClient();
  const [childId, setChildId] = useState<string | null>(null);
  const openId = useSearchParams().get("hw") || undefined;

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
      <PageHeader crumbs={[{ label: "Home", href: "/student/dashboard" }, { label: "To do", href: "/student/todo" }, { label: "My homework" }]} title="My homework" subtitle="Tap a piece of homework to open it, hand in your work and read your teacher's feedback." />
      {childId ? <HomeworkForChild childId={childId} canSubmit groupByStatus openId={openId} /> : <p className="text-sm text-ink/65">Loading…</p>}
    </div>
  );
}

export default function StudentHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <Suspense fallback={<p className="text-ink/65">Loading…</p>}>
            <StudentHomeworkContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
