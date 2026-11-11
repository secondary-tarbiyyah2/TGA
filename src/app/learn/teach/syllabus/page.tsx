"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumViews } from "@/components/learn/curriculum/CurriculumHome";
import { SyllabusBrowser } from "@/components/learn/curriculum/SyllabusBrowser";

export default function TeachSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader actions={<CurriculumViews area="teach" />}
            title="Syllabus"
            subtitle="What each subject teaches from Year 1 to Year 11: the long-term plan, every unit week by week, progression and exams, all on this page."
          />
          <SyllabusBrowser area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
