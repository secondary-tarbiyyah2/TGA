"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { StaffHandbook } from "@/components/learn/StaffHandbook";

export default function TeachHandbookPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader crumbs={[{ label: "Home", href: "/teach/dashboard" }, { label: "Staff handbook" }]} title="Staff handbook" subtitle="The few things every member of staff needs to know." />
          <StaffHandbook />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
