"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { ClassworkToAction } from "@/components/learn/homework/ClassworkToAction";

/** Classwork to action across a teacher's classes, linking into each class's Classwork tab, where work is set and marked. */
export default function TeachHomeworkPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <ClassworkToAction scope="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
