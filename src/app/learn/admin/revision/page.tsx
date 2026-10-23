"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { RevisionOverview } from "@/components/learn/revision/RevisionOverview";

export default function AdminRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Revision results" }]}
          title="Revision results"
          subtitle="Every unit your pupils have revised, with the class average, how many are under 60% and the weakest topic. Open a unit for the full results and a reteach plan."
        />
        <RevisionOverview area="admin" />
      </LearnGate>
    </section>
  );
}
