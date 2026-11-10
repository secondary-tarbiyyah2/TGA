"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumPlanner } from "@/components/learn/curriculum/CurriculumPlanner";

export default function AdminPlannerPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Curriculum planner" }]}
          title="Curriculum planner"
          subtitle="The long-term plan for each year group, subject by subject and half term by half term. Open a unit to change what it covers or plan it week by week. The syllabus pack updates itself after you save."
        />
        <CurriculumPlanner />
      </LearnGate>
    </section>
  );
}
