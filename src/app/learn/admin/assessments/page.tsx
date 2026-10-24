"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { BaselineImport } from "@/components/learn/pupil/BaselineImport";

export default function AdminAssessmentsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Baseline assessments" }]}
          title="Baseline assessments"
          subtitle="Entry and standardised test results from GL Assessment, on every pupil's record. Import GL's CSV export here, or add a result on the pupil's record."
        />
        <BaselineImport />
      </LearnGate>
    </section>
  );
}
