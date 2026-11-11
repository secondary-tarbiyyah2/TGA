"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumViews } from "@/components/learn/curriculum/CurriculumHome";
import { CurriculumMap } from "@/components/learn/curriculum/CurriculumMap";

export default function TeachCurriculumMapPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader actions={<CurriculumViews area="teach" />} title="Curriculum map" subtitle="How each year's learning builds across the six half terms. Choose a unit to see what it covers, what it builds on and its lessons." />
          <CurriculumMap area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
