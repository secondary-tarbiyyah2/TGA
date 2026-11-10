"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { LessonWorkspace } from "@/components/learn/curriculum/LessonWorkspace";

function Content() {
  const id = useSearchParams().get("id") || "";
  return <LessonWorkspace key={id} id={id} area="teach" />;
}

/** One lesson's workspace (docs/portal-redesign.md, phase 4). */
export default function TeachLessonPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <Suspense fallback={null}>
            <Content />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
