"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { ActionCentre } from "@/components/learn/ActionCentre";

export default function StudentActionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <PageHeader crumbs={[{ label: "Today", href: "/student/dashboard" }, { label: "Waiting for you" }]} title="Waiting for you" subtitle="What to do next: homework to hand in, Qur'an to revise and your next one-to-one." />
          <ActionCentre role="student" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
