"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { useLearnSession, learnRoleLabel } from "@/lib/learn/session";

function DashboardContent() {
  const { session, roles } = useLearnSession();
  const myRoles = roles.map((r) => learnRoleLabel(r.role)).join(", ");
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">Welcome.</h1>
      <p className="mt-1 text-sm text-ink/60">
        Signed in as {session && session !== "loading" ? session.user.email : ""} — {myRoles}.
      </p>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <DashboardContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
