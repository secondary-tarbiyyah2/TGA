"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";

export default function TeachCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Lesson library" }]}
            title="Lesson library"
            subtitle="Every lesson as a ready-made PowerPoint. Download it, edit it in PowerPoint if you need to catch up or change pace, upload it back, and share it to your class."
          />
          <CurriculumLibrary area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
