"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { FamilyRevision } from "@/components/learn/revision/FamilyRevision";

export default function FamilyRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <FamilyRevision />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
