"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { ActionCentre } from "@/components/learn/ActionCentre";

export default function FamilyActionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <PageHeader crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Action centre" }]} title="Action centre" subtitle="What your children need to do, and what is coming up: homework, Qur'an revision and one-to-one sessions." />
          <ActionCentre role="family" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
