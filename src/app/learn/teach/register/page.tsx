"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { RegisterSheet } from "@/components/learn/attendance/RegisterSheet";

function Content() {
  const params = useSearchParams();
  return <RegisterSheet lessonId={params.get("id")} base="/teach" from={params.get("from")} />;
}

/** One lesson's register on its own page, opened from Lessons and registers or a class. */
export default function TeachRegisterPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <Content />
        </Suspense>
      </LearnGate>
    </section>
  );
}
