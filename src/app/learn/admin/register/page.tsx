"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { RegisterSheet } from "@/components/learn/attendance/RegisterSheet";

function Content() {
  const params = useSearchParams();
  return <RegisterSheet lessonId={params.get("id")} base="/admin" from={params.get("from")} />;
}

/** One lesson's register on its own page, opened from Registers or a class. */
export default function AdminRegisterPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <Suspense fallback={null}>
          <Content />
        </Suspense>
      </LearnGate>
    </section>
  );
}
