"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { CurriculumHome } from "@/components/learn/curriculum/CurriculumHome";

/** Curriculum: one browser of years, subjects, units, lessons and resources (owner feedback 2, items 14 and 18). */
export default function TeachCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <CurriculumHome area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
