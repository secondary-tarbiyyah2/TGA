"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReportsList } from "@/components/learn/ReportsList";

export default function StudentReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <ReportsList />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
