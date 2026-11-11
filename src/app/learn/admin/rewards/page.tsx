"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { FeatureGate } from "@/components/learn/FeatureGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { HousesAdmin } from "@/components/learn/rewards/HousesAdmin";
import { StarManager } from "@/components/learn/rewards/StarManager";

export default function AdminRewardsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <FeatureGate feature="house_points" home="/admin/dashboard">
          <PageHeader
            crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "House points" }]}
            title="House points and stars"
            subtitle="Choose and approve each class's Star of the Week, see who hasn't been star yet, and run the house points."
          />
          <StarManager isHead housesAdmin={<HousesAdmin />} />
        </FeatureGate>
      </LearnGate>
    </section>
  );
}
