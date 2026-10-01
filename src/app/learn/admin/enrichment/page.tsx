"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { EnrichmentRegister } from "@/components/learn/enrichment/EnrichmentRegister";

export default function AdminEnrichmentPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Enrichment" }]}
          title="Enrichment attendance"
          subtitle="Who joined each supervised enrichment block, as ticked by its supervisor."
        />
        <EnrichmentRegister mode="admin" />
      </LearnGate>
    </section>
  );
}
