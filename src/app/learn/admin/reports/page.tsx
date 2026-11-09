"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { ReportsWorkspace } from "@/components/learn/reports/ReportsWorkspace";

export default function AdminReportsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <Suspense fallback={<div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />}>
            <ReportsWorkspace mode="admin" />
          </Suspense>
        </AdminShell>
      </LearnGate>
    </section>
  );
}
