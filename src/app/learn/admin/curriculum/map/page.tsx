"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumMap } from "@/components/learn/curriculum/CurriculumMap";

export default function AdminCurriculumMapPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Curriculum map" }]}
          title="Curriculum map"
          subtitle="How each year's learning builds across the six half terms. Choose a unit to see what it covers, what it builds on and its lessons."
        />
        <CurriculumMap area="admin" />
      </LearnGate>
    </section>
  );
}
