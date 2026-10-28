"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { StaffHandbook } from "@/components/learn/StaffHandbook";

export default function AdminHandbookPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <PageHeader crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Staff handbook" }]} title="Staff handbook" subtitle="The few things every member of staff needs to know." />
        <StaffHandbook />
      </LearnGate>
    </section>
  );
}
