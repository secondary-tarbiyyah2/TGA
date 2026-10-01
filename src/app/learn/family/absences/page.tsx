"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FamilyAbsences } from "@/components/learn/absences/FamilyAbsences";

export default function FamilyAbsencesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilyAbsences />
      </LearnGate>
    </section>
  );
}
