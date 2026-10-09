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
            subtitle="Every lesson with ready-made slides and a lesson plan (timings, slide-by-slide script, adaptations). View or present in the browser, download a whole unit at once, edit and re-upload, or share slides to your class."
          />
          <CurriculumLibrary area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
