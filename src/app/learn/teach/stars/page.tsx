"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FeatureGate } from "@/components/learn/FeatureGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { HousePoints } from "@/components/learn/rewards/HousePoints";

export default function TeachStarsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <FeatureGate feature="house_points" home="/teach/dashboard">
          <LearnShell role="teach">
            <HousePoints isHead={false} />
          </LearnShell>
        </FeatureGate>
      </LearnGate>
    </section>
  );
}
