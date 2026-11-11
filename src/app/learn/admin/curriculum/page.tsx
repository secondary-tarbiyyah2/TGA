"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { CurriculumHome } from "@/components/learn/curriculum/CurriculumHome";

/** Curriculum: one browser of years, subjects, units, lessons and resources (owner feedback 2, items 14 and 18). */
export default function AdminCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <CurriculumHome area="admin" />
      </LearnGate>
    </section>
  );
}
