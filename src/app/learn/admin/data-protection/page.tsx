"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { RetentionRules } from "@/components/learn/compliance/RetentionRules";
import { SubjectAccessExport } from "@/components/learn/compliance/SubjectAccessExport";

export default function DataProtectionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Data protection" }]}
          title="Data protection"
          subtitle="Retention rules with a review-first clean-up, and one-click subject access exports."
        />
        <div className="space-y-6">
          <SubjectAccessExport />
          <RetentionRules />
        </div>
      </LearnGate>
    </section>
  );
}
