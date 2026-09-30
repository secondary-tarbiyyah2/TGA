"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { StatTile } from "@/components/learn/Card";
import { useLearnPermission, useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

// Quick-action launcher tiles — a Google Classroom/SIMS-style "go straight
// to the thing you do most" grid, replacing the sidebar as the FIRST thing
// an admin sees rather than the last. Deliberately a fixed, hand-picked
// set (not every sidebar item) — the whole point is surfacing the handful
// of places an admin actually lands day to day, not repeating the nav.
const QUICK_ACTIONS: { href: string; label: string; hint: string; icon: string }[] = [
  { href: "/admin/people", label: "People", hint: "Invite a family or staff member", icon: "M10 9a3 3 0 100-6 3 3 0 000 6zm-6 8a6 6 0 0112 0v1H4v-1z" },
  { href: "/admin/admissions", label: "Admissions", hint: "Bookings, calls, availability", icon: "M4 4a1 1 0 011-1h10a1 1 0 011 1v12l-6-3-6 3V4z" },
  { href: "/admin/messages", label: "Messages", hint: "Read and reply to threads", icon: "M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 3v-3H4a2 2 0 01-2-2V5z" },
  { href: "/admin/fees", label: "Fees", hint: "Invoices and payment status", icon: "M10 2a1 1 0 011 1v1.06a5.5 5.5 0 014.09 4.49 1 1 0 11-1.98.27A3.5 3.5 0 0011 5.6V9c1.98.36 4 1.23 4 3.4 0 2.02-1.7 3.13-4 3.46V17a1 1 0 11-2 0v-1.06c-1.98-.28-3.5-1.4-4-3.03a1 1 0 111.9-.62c.3.98 1.09 1.62 2.1 1.83V9.86c-1.9-.38-3.7-1.25-3.7-3.3C5.3 4.6 6.9 3.5 9 3.16V2a1 1 0 011-1z" },
  { href: "/admin/attendance", label: "Attendance", hint: "Today's registers", icon: "M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8z" },
  { href: "/admin/compliance", label: "Compliance", hint: "Signatures, safeguarding, retention", icon: "M10 1l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V4l7-3z" },
];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  BOOKING_CALL_JOIN: "started a call for a booking",
  LESSON_JOIN: "joined a lesson call",
  ABSENCE_ALERT_SENT: "sent an absence alert",
};

function humanizeAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action.toLowerCase().replace(/_/g, " ");
}

type AuditRow = { id: number; actor_email: string | null; action: string; target_table: string | null; created_at: string };

/** A Dojo-style "what just happened" feed, straight from audit_log — never
 * a separate hand-maintained activity table, so it can't drift from what
 * actually happened. Read-only, admin-only (same RLS as Compliance's own
 * audit_log queries). */
function ActivityFeed() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("audit_log")
      .select("id, actor_email, action, target_table, created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setRows((data as AuditRow[]) || []));
  }, [supabase]);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Recent activity</h2>
      {rows === null ? (
        <p className="mt-3 text-sm text-ink/50">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink/50">Nothing recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-sm">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700" />
              <p className="text-ink/80">
                <span className="font-medium text-ink">{r.actor_email || "System"}</span> {humanizeAuditAction(r.action)}
                <span className="ml-2 text-xs text-ink/40">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  // roles can hold one row per scope (e.g. several classes) that all
  // resolve to the same label — dedupe before display, or "Head Teacher"
  // repeats once per underlying row (seen live: "Head Teacher, Head
  // Teacher, Head Teacher…").
  const myRoles = Array.from(new Set(roles.map((r) => learnRoleLabel(r.role)))).join(", ");
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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Go to</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="flex items-start gap-3 rounded-2xl border border-gold-light/50 bg-white p-4 transition hover:border-teal-700 hover:shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4.5 w-4.5 text-gold-700">
                  <path d={a.icon} fill="currentColor" />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{a.label}</span>
                <span className="block text-xs text-ink/60">{a.hint}</span>
              </span>
            </a>
          ))}
        </div>
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

      <ActivityFeed />
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <DashboardContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
