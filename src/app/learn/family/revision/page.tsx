"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FeatureGate } from "@/components/learn/FeatureGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { FamilyRevision } from "@/components/learn/revision/FamilyRevision";

export default function FamilyRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FeatureGate feature="revision_packs" home="/family/dashboard">
          <LearnShell role="family">
            <FamilyRevision />
          </LearnShell>
        </FeatureGate>
      </LearnGate>
    </section>
  );
}
