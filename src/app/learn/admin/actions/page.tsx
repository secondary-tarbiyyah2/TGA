"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ActionCentre } from "@/components/learn/ActionCentre";

export default function AdminActionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Action centre" }]} title="Action centre" subtitle="Missing homework and absence follow-ups across the school, most urgent first. Items clear by themselves when the work is done." />
        <ActionCentre role="admin" />
      </LearnGate>
    </section>
  );
}
