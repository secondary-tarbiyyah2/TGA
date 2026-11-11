"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { HousesAdmin } from "@/components/learn/rewards/HousesAdmin";
import { HousePoints } from "@/components/learn/rewards/HousePoints";

export default function AdminRewardsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <HousePoints isHead housesAdmin={<HousesAdmin />} />
      </LearnGate>
    </section>
  );
}
