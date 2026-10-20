"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { TeacherAbsences } from "@/components/learn/absences/TeacherAbsences";

export default function TeachAbsencesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "head_teacher", "admin"]}>
        <TeacherAbsences />
      </LearnGate>
    </section>
  );
}
