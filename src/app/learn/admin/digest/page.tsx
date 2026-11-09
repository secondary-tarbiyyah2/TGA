"use client";

import { Suspense } from "react";
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
          subtitle="The Friday afternoon email to families: when it goes, who gets it, how it went, and what it includes."
        />
        <Suspense fallback={<div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />}>
          <DigestAdmin />
        </Suspense>
      </LearnGate>
    </section>
  );
}
