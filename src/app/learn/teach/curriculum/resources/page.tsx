"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { CurriculumHome } from "@/components/learn/curriculum/CurriculumHome";

/** Resources now live in the Curriculum browser (each unit's folder); this address opens it
 * showing resources, and `?terms=1` keeps each term's printable list. Staff only. */
export default function TeachResourcesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <CurriculumHome area="teach" mode="resources" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
