"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { StaffAdmin } from "@/components/learn/staff/StaffAdmin";

function StaffContent() {
  const user = useSearchParams().get("user") || undefined;
  return (
    <div>
      <PageHeader
        title="Staff profiles"
        subtitle="Teacher profiles shown to families, and internal DBS, safeguarding training, right-to-work and start dates (never shown to families)."
      />
      <StaffAdmin initialUserId={user} />
    </div>
  );
}

export default function AdminStaffPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <Suspense fallback={null}>
            <StaffContent />
          </Suspense>
        </AdminShell>
      </LearnGate>
    </section>
  );
}
