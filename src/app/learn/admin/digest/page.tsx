"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { DigestAdmin } from "@/components/learn/rewards/DigestAdmin";

export default function AdminDigestPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Weekly digest" }]}
          title="Weekly parent digest"
          subtitle="The Friday email to parents. Preview any family's digest or send yourself a test."
        />
        <DigestAdmin />
      </LearnGate>
    </section>
  );
}
