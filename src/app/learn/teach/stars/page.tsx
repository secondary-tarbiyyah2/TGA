"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HousePoints } from "@/components/learn/rewards/HousePoints";

export default function TeachStarsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <HousePoints isHead={false} />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
