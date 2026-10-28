"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ReleasedReports } from "@/components/learn/reports/ReleasedReports";

export default function StudentReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white" />}>
            <ReleasedReports />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
