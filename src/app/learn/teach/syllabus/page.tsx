"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { SyllabusBrowser } from "@/components/learn/curriculum/SyllabusBrowser";

export default function TeachSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            title="Syllabus and specifications"
            subtitle="What each subject teaches from Year 1 to Year 11: the long-term plan half term by half term, every unit with its week-by-week plan, and the curriculum document to print or download."
          />
          <SyllabusBrowser area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
