"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { AuditLogViewer } from "@/components/learn/compliance/AuditLogViewer";

export default function AuditLogPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Audit log" }]}
          title="Audit log"
          subtitle="Who changed what, and when. Restricted records show only that a change happened."
        />
        <AuditLogViewer />
      </LearnGate>
    </section>
  );
}
