"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { TeachPupils } from "@/components/learn/pupil/TeachPupils";

export default function TeachPupilsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover", "head_teacher", "admin"]}>
        <TeachPupils />
      </LearnGate>
    </section>
  );
}
