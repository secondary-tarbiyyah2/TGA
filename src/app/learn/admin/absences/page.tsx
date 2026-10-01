"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { StaffAbsences } from "@/components/learn/absences/StaffAbsences";

export default function AdminAbsencesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <StaffAbsences crumbs={[{ label: "Dashboard", href: "/learn/admin/dashboard" }, { label: "Absences" }]} />
      </LearnGate>
    </section>
  );
}
