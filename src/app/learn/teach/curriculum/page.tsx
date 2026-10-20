"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";
import { SyllabusPack } from "@/components/learn/curriculum/SyllabusPack";

export default function TeachCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Lesson library" }]}
            title="Lesson library"
            subtitle="Pick a year, then a unit. Each unit has its lessons (slides and lesson plans to view, download, edit or share), its revision pack for pupils, and your pupils' revision results."
          />
          <CurriculumLibrary area="teach" />
          <SyllabusPack />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
