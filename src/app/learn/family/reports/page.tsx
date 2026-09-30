"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReportsList } from "@/components/learn/ReportsList";

export default function FamilyReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <ReportsList />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
