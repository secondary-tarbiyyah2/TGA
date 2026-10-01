"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { FamilyParentEvenings } from "@/components/learn/parentEvenings/FamilyParentEvenings";

export default function FamilyParentEveningsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <PageHeader
            crumbs={[{ label: "Overview", href: "/family/dashboard" }, { label: "Parent evenings" }]}
            title="Parent evenings"
            subtitle="Book a time with each of your children's teachers. You can change or cancel until the evening."
          />
          <FamilyParentEvenings />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
