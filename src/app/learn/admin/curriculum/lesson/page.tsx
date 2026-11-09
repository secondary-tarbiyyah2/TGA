"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LessonWorkspace } from "@/components/learn/curriculum/LessonWorkspace";

function Content() {
  const id = useSearchParams().get("id") || "";
  return <LessonWorkspace key={id} id={id} area="admin" />;
}

/** One lesson's workspace (docs/portal-redesign.md, phase 4). */
export default function AdminLessonPage() {
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
