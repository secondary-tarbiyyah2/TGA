"use client";

import { Suspense } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { FamilyRevision } from "@/components/learn/revision/FamilyRevision";

export default function FamilyRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white" />}>
            <FamilyRevision />
          </Suspense>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
