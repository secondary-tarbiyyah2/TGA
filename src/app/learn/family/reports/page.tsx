"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReleasedReports } from "@/components/learn/reports/ReleasedReports";

export default function FamilyReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <ReleasedReports />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
