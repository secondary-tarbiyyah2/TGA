"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumMap } from "@/components/learn/curriculum/CurriculumMap";

export default function TeachCurriculumMapPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader title="Curriculum map" subtitle="How each year's units follow on from one another across the six half terms." />
          <CurriculumMap area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
