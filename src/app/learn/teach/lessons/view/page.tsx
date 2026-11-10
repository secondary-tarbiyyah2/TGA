"use client";

import { Loading } from "@/components/learn/kit";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { LessonDetail } from "@/components/learn/LessonDetail";

function TeachLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  if (!id) return <p className="text-sm text-ink/65">No lesson selected, open a lesson from your dashboard.</p>;
  return <LessonDetail lessonInstanceId={id} variant="teacher" />;
}

export default function TeachLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <Suspense fallback={<Loading label="Loading…" bare />}>
            <TeachLessonContent />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
