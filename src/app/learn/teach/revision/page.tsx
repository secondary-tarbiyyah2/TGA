"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FeatureGate } from "@/components/learn/FeatureGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { RevisionOverview } from "@/components/learn/revision/RevisionOverview";

export default function TeachRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <FeatureGate feature="revision_packs" home="/teach/dashboard">
          <LearnShell role="teach">
            <PageHeader
              title="Revision results"
              subtitle="Every unit your pupils have revised, with the class average, how many are under 60% and the weakest topic. Open a unit for the full results and a reteach plan."
            />
            <RevisionOverview area="teach" />
          </LearnShell>
        </FeatureGate>
      </LearnGate>
    </section>
  );
}
