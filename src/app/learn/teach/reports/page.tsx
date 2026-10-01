"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReportsWorkspace } from "@/components/learn/reports/ReportsWorkspace";

export default function TeachReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <ReportsWorkspace mode="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
