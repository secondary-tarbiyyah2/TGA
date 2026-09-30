"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { StatTile } from "@/components/learn/Card";
import { useLearnPermission, useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Replaces the previous bare "Welcome, signed in as X" line with real
 * at-a-glance counts — reported from a live screenshot as "too simplistic".
 * Every number here is the SAME query the Compliance page already runs
 * (see admin/compliance/page.tsx), never an invented figure: this page is
 * just surfacing what's already true elsewhere, one click closer to where
 * an admin actually lands after signing in.
 */
function DashboardContent() {
  const { session, roles } = useLearnSession();
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  const myRoles = roles.map((r) => learnRoleLabel(r.role)).join(", ");
  const supabase = getSupabaseClient();

  const [absenceCount, setAbsenceCount] = useState<number | null>(null);
  const [outstandingCount, setOutstandingCount] = useState<number | null>(null);
  const [flaggedCount, setFlaggedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "ABSENCE_ALERT_SENT")
      .then(({ count }) => setAbsenceCount(count ?? 0));
    supabase
      .from("outstanding_signatures")
      .select("user_id", { count: "exact", head: true })
      .then(({ count }) => setOutstandingCount(count ?? 0));
    if (isSafeguardingLead) {
      supabase
        .from("message_thread_messages")
        .select("id", { count: "exact", head: true })
        .eq("flagged", true)
        .then(({ count }) => setFlaggedCount(count ?? 0));
    }
  }, [supabase, isSafeguardingLead]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Welcome.</h1>
        <p className="mt-1 text-sm text-ink/60">
          Signed in as {session && session !== "loading" ? session.user.email : ""} — {myRoles}.
        </p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">At a glance</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Unexplained absences"
            value={absenceCount ?? "…"}
            status={absenceCount === null ? undefined : absenceCount === 0 ? "ok" : "warning"}
            href="/admin/compliance"
          />
          <StatTile
            label="Outstanding signatures"
            value={outstandingCount ?? "…"}
            status={outstandingCount === null ? undefined : outstandingCount === 0 ? "ok" : "warning"}
            href="/admin/compliance"
          />
          {isSafeguardingLead && (
            <StatTile
              label="Flagged messages"
              value={flaggedCount ?? "…"}
              status={flaggedCount === null ? undefined : flaggedCount === 0 ? "ok" : "warning"}
              href="/admin/compliance"
            />
          )}
        </div>
      </div>
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
