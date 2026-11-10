"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";

export default function AdminCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Lesson library" }]}
          title="Lesson library"
          subtitle="Pick a year, then a unit. Each unit has its lessons (slides and plans, with version history), its revision pack for pupils, and pupil results."
        />
        <CurriculumLibrary area="admin" />
      </LearnGate>
    </section>
  );
}
