"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LessonDetail } from "@/components/learn/LessonDetail";

function TeachLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  if (!id) return <p className="text-sm text-ink/60">No lesson selected — open a lesson from your dashboard.</p>;
  return <LessonDetail lessonInstanceId={id} variant="teacher" />;
}

export default function TeachLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <Suspense fallback={<p className="text-sm text-ink/60">Loading…</p>}>
          <TeachLessonContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
