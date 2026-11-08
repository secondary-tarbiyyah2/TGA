"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumPlanner } from "@/components/learn/curriculum/CurriculumPlanner";

export default function TeachPlannerPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            title="Curriculum planner"
            subtitle="The long-term plan for each year group, subject by subject and half term by half term. Open a unit to change what it covers or plan it week by week. The syllabus pack updates itself after you save."
          />
          <CurriculumPlanner />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
