"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { StaffAbsences } from "@/components/learn/absences/StaffAbsences";

export default function TeachAbsencesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "head_teacher", "admin"]}>
        <StaffAbsences crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Absences" }]} subtitle="What families have told us about your classes, and who has not been heard from." />
      </LearnGate>
    </section>
  );
}
