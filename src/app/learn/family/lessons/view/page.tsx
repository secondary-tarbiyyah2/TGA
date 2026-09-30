"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LessonDetail } from "@/components/learn/LessonDetail";

function FamilyLessonContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const childId = searchParams.get("child");
  if (!id || !childId) return <p className="text-sm text-ink/60">Open this lesson from your dashboard so it knows which child it&apos;s for.</p>;
  return <LessonDetail lessonInstanceId={id} variant="parent" childId={childId} />;
}

export default function FamilyLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<p className="text-sm text-ink/60">Loading…</p>}>
          <FamilyLessonContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
