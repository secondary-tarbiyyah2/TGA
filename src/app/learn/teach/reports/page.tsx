"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReportsWorkspace } from "@/components/learn/reports/ReportsWorkspace";

export default function TeachReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <Suspense fallback={<div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />}>
            <ReportsWorkspace mode="teach" />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
