"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell, PhasePlaceholder } from "@/components/learn/AdminShell";

export default function AdminLessonsPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <PhasePlaceholder title="Lessons" />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
