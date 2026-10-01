"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { EnrichmentRegister } from "@/components/learn/enrichment/EnrichmentRegister";

export default function TeachEnrichmentPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <PageHeader
          crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Enrichment" }]}
          title="Enrichment register"
          subtitle="Tick the children who joined the enrichment blocks you supervise."
        />
        <EnrichmentRegister mode="supervisor" />
      </LearnGate>
    </section>
  );
}
