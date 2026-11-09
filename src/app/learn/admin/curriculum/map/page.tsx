"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumMap } from "@/components/learn/curriculum/CurriculumMap";

export default function AdminCurriculumMapPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Curriculum map" }]}
          title="Curriculum map"
          subtitle="How each year's units follow on from one another across the six half terms, with lessons and approvals for each."
        />
        <CurriculumMap area="admin" />
      </LearnGate>
    </section>
  );
}
