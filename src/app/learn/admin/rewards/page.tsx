"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FeatureGate } from "@/components/learn/FeatureGate";
import { HousesAdmin } from "@/components/learn/rewards/HousesAdmin";
import { HousePoints } from "@/components/learn/rewards/HousePoints";

export default function AdminRewardsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <FeatureGate feature="house_points" home="/admin/dashboard">
          <HousePoints isHead housesAdmin={<HousesAdmin />} />
        </FeatureGate>
      </LearnGate>
    </section>
  );
}
