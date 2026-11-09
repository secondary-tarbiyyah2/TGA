"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { ClassworkToAction } from "@/components/learn/homework/ClassworkToAction";

/** Classwork to action: what needs marking or chasing, linking into each class. Work itself is set and marked in the class. */
export default function AdminHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <ClassworkToAction scope="admin" />
      </LearnGate>
    </section>
  );
}
