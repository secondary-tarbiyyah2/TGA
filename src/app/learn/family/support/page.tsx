"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FamilySupportPlan } from "@/components/learn/send/FamilySupportPlan";

export default function FamilySupportPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilySupportPlan />
      </LearnGate>
    </section>
  );
}
