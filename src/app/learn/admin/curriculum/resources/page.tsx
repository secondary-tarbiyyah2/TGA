"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { CurriculumHome } from "@/components/learn/curriculum/CurriculumHome";

/** Resources now live in the Curriculum browser (each unit's folder); this address opens it
 * showing resources, and `?terms=1` keeps each term's printable list. Staff only. */
export default function AdminResourcesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <CurriculumHome area="admin" mode="resources" />
      </LearnGate>
    </section>
  );
}
