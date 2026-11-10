"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { LessonWorkspace } from "@/components/learn/curriculum/LessonWorkspace";

function Content() {
  const p = useSearchParams();
  const id = p.get("id") || "";
  // The term resource list links by subject, year and lesson number (?s=&y=&n=).
  const n = Number(p.get("n"));
  const at = !id && p.get("s") && p.get("y") && n ? { subject: p.get("s") || "", year: p.get("y") || "", n } : undefined;
  return <LessonWorkspace key={id || `${at?.subject}/${at?.year}/${at?.n}`} id={id} at={at} area="teach" />;
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
