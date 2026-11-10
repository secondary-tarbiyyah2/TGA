"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { StaffAbsences } from "@/components/learn/absences/StaffAbsences";

export default function AdminAbsencesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <StaffAbsences crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Absences" }]} showCover showEmails />
      </LearnGate>
    </section>
  );
}
