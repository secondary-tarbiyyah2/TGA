"use client";

import { Loading } from "@/components/learn/kit";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { LessonDetail } from "@/components/learn/LessonDetail";
import { getSupabaseClient } from "@/lib/supabase/client";

function StudentLessonContent() {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [childId, setChildId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("student_accounts").select("child_id").eq("profile_id", user.id).maybeSingle();
      setChildId(data?.child_id ?? null);
    })();
  }, [supabase]);

  if (!id) return <p className="text-sm text-ink/65">No lesson selected, open a lesson from your dashboard.</p>;
  if (childId === undefined) return <Loading label="Loading…" bare />;
  if (childId === null) return <p className="text-sm text-ink/65">Your account isn&apos;t linked to a student record yet.</p>;
  return <LessonDetail lessonInstanceId={id} variant="student" childId={childId} />;
}

export default function StudentLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <Suspense fallback={<Loading label="Loading…" bare />}>
            <StudentLessonContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
