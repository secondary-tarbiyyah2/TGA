"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { AdminParentEvenings } from "@/components/learn/parentEvenings/AdminParentEvenings";

export default function AdminParentEveningsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Parent evenings" }]}
          title="Parent evenings"
          subtitle="Set the date, meeting length and teachers. Parents book their own slot from the family area; no slot can be booked twice."
        />
        <AdminParentEvenings />
      </LearnGate>
    </section>
  );
}
