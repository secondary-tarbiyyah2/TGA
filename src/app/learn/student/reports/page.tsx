"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReleasedReports } from "@/components/learn/reports/ReleasedReports";

export default function StudentReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <ReleasedReports audience="student" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
