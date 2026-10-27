"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { ukDateTime, ukDaysAgo, ukNowHm, ukToday } from "@/lib/learn/ukTime";
import { useAbsenceData } from "@/components/learn/absences/data";
import { AdminLeaderboard } from "@/components/learn/behaviour/LeaderboardCards";
import { StatTile } from "@/components/learn/Card";
import { WithdrawalNoticesAdmin } from "@/components/learn/fees/WithdrawalNoticesAdmin";
import { DashboardHero } from "@/components/learn/DashboardHero";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { useLearnPermission, useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  BOOKING_CALL_JOIN: "started a call for a booking",
  LESSON_JOIN: "joined a lesson call",
  ABSENCE_ALERT_SENT: "sent an absence alert",
};

function humanizeAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action.toLowerCase().replace(/_/g, " ");
}

type AuditRow = { id: number; actor_email: string | null; action: string; target_table: string | null; created_at: string };

/** A Dojo-style "what just happened" feed, straight from audit_log, never
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
    <div className="h-full rounded-2xl border border-gold-light bg-white">
      <div className="flex items-center justify-between border-b border-gold-light px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        <a href="/admin/audit-log" className="text-xs font-medium text-teal-700 hover:underline">
          Full audit log
        </a>
      </div>
      {rows === null ? (
        <p className="px-5 py-4 text-sm text-ink/65">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink/65">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-gold-light/70">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-3 text-sm">
              <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream text-[11px] font-semibold text-ink/65">
                {(r.actor_email || "S").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-ink/80">
                  <span className="font-medium text-ink">{r.actor_email || "System"}</span> {humanizeAuditAction(r.action)}
                </p>
                <p className="text-xs text-ink/65">{ukDateTime(r.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TodayLessonRow = { id: string; bbb_status: string; start_time: string; end_time: string; class_id: string; className: string; registered: number };
type Counted = { n: number; capped: boolean };

/**
 * The brief's admin "today" view: today's live lessons across the school,
 * which registers are taken and which are missing, plus overdue marking
 * and new enrolments. Every figure is a live query (RLS: manage_academic);
 * fees and inactive-student figures are left out until that data exists.
 */
function useSchoolToday() {
  const [lessons, setLessons] = useState<TodayLessonRow[] | null>(null);
  const [overdueMarking, setOverdueMarking] = useState<Counted | null>(null);
  const [newEnrolments, setNewEnrolments] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from("lesson_instances")
        .select("id, bbb_status, timetable_slots(start_time, end_time, class_id, classes(name), timetable_runs(status))")
        .eq("date", ukToday());
      // Only lessons on the published timetable, the same rule the
      // Attendance page uses, so draft runs don't show as "register missing".
      const rows = ((data as unknown as { id: string; bbb_status: string; timetable_slots?: { start_time: string; end_time: string; class_id: string; classes?: { name: string } | null; timetable_runs?: { status: string } | null } | null }[]) || []).filter(
        (r) => r.timetable_slots?.timetable_runs?.status === "published",
      );
      const ids = rows.map((r) => r.id);
      const { data: att } = ids.length ? await supabase.from("attendance_records").select("lesson_instance_id").in("lesson_instance_id", ids) : { data: [] };
      const counts = new Map<string, number>();
      for (const a of (att as { lesson_instance_id: string }[]) || []) counts.set(a.lesson_instance_id, (counts.get(a.lesson_instance_id) || 0) + 1);
      setLessons(
        rows
          .filter((r) => r.timetable_slots)
          .map((r) => ({
            id: r.id,
            bbb_status: r.bbb_status,
            start_time: r.timetable_slots!.start_time,
            end_time: r.timetable_slots!.end_time,
            class_id: r.timetable_slots!.class_id,
            className: r.timetable_slots!.classes?.name || "Class",
            registered: counts.get(r.id) || 0,
          }))
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
      );
    })();
    (async () => {
      // Handed in more than 7 days ago and still not marked.
      const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
      // Newest first, so if the cap is hit the most recent work is counted
      // (and the tile says "1000+" rather than silently undercounting).
      const LIMIT = 1000;
      const { data } = await supabase
        .from("homework_submissions")
        .select("id, submitted_at, homework_marks(id, marked_at)")
        .not("submitted_at", "is", null)
        .lt("submitted_at", cutoff)
        .order("submitted_at", { ascending: false })
        .limit(LIMIT);
      const rows = (data as unknown as { id: string; homework_marks: { marked_at: string | null }[] | { marked_at: string | null } | null }[]) || [];
      setOverdueMarking({
        n: rows.filter((r) => {
          const m = Array.isArray(r.homework_marks) ? r.homework_marks[0] : r.homework_marks;
          return !m || !m.marked_at;
        }).length,
        capped: rows.length >= LIMIT,
      });
    })();
    // Pupils, not class places: one new pupil put into three classes is one
    // new enrolment, not three.
    supabase
      .from("enrolments")
      .select("child_id")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(5000)
      .then(({ data }) => setNewEnrolments(new Set(((data as { child_id: string }[] | null) || []).map((r) => r.child_id)).size));
  }, []);

  return { lessons, overdueMarking, newEnrolments };
}

function TodayLessons({ lessons }: { lessons: TodayLessonRow[] | null }) {
  const now = ukNowHm();
  return (
    <div className="rounded-2xl border border-gold-light bg-white">
      <div className="flex items-center justify-between border-b border-gold-light px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Today&apos;s live lessons</h2>
        <span className="flex gap-3">
          <a href="/admin/attendance" className="text-xs font-medium text-teal-700 hover:underline">
            Take registers
          </a>
          <a href="/admin/calendar" className="text-xs font-medium text-teal-700 hover:underline">
            Calendar
          </a>
        </span>
      </div>
      {lessons === null ? (
        <p className="px-5 py-4 text-sm text-ink/65">Loading…</p>
      ) : lessons.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink/65">No lessons on the published timetable today.</p>
      ) : (
        <ul className="divide-y divide-gold-light/70">
          {lessons.map((l) => {
            const started = now >= l.start_time.slice(0, 5);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="w-24 shrink-0 font-medium tabular-nums text-ink/70">
                  {l.start_time.slice(0, 5)} to {l.end_time.slice(0, 5)}
                </span>
                <a href={`/admin/class?id=${l.class_id}`} className="min-w-0 flex-1 truncate font-medium text-ink hover:text-teal-700">
                  {l.className}
                </a>
                {l.bbb_status === "live" && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}
                {started ? (
                  l.registered > 0 ? (
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-800 ring-1 ring-inset ring-green-600/20">Register taken</span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-600/20">Register missing</span>
                  )
                ) : (
                  <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-ink/65">Later</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Absences still to follow up over the last 7 UK days (no note, no
 * reason, or "unknown"), once per pupil per day: the same rule as the
 * Absences page's "To follow up" tab. Only runs for heads/admins. */
function useUnexplainedAbsences(enabled: boolean): number | null {
  const [from] = useState(() => ukDaysAgo(6));
  const [to] = useState(() => ukToday());
  const { absences } = useAbsenceData(enabled ? from : "", enabled ? to : "");
  if (!enabled || absences === null) return null;
  return new Set(absences.filter((a) => a.kind === "unexplained" && (!a.reasonCode || a.reasonCode === "unknown")).map((a) => `${a.childId}|${a.date}`)).size;
}

/**
 * At-a-glance counts for whoever lands here after signing in. Every number
 * is a live query that matches the page it links to, never an invented
 * figure. Admissions-only staff can't read the school-wide tables (RLS:
 * manage_academic), so they get a short pointer to their pages instead of
 * a dashboard full of misleading zeros.
 */
function DashboardContent() {
  const { roles } = useLearnSession();
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  // roles can hold one row per scope (e.g. several classes) that all
  // resolve to the same label, dedupe before display.
  const isHead = roles.some((r) => r.role === "head_teacher" || r.role === "admin");
  const myRoles = Array.from(new Set(roles.map((r) => learnRoleLabel(r.role)))).join(", ");
  const supabase = getSupabaseClient();

  const [outstandingCount, setOutstandingCount] = useState<number | null>(null);
  const [flaggedCount, setFlaggedCount] = useState<number | null>(null);
  // Safeguarding reviews awaiting action (RLS returns rows only to the
  // Safeguarding Lead / Headteacher; everyone else simply gets 0).
  const isHeadTeacherRole = roles.some((r) => r.role === "head_teacher");
  const showReviews = isSafeguardingLead || isHeadTeacherRole;
  const [reviewCounts, setReviewCounts] = useState<{ open: number; overdue: number } | null>(null);
  useEffect(() => {
    if (!supabase || !showReviews) return;
    supabase
      .from("safeguarding_reviews")
      .select("due_at")
      .neq("status", "completed")
      .then(({ data }) => {
        const due = ((data as { due_at: string }[] | null) || []).map((r) => new Date(r.due_at).getTime());
        setReviewCounts({ open: due.length, overdue: due.filter((t) => t < Date.now()).length });
      });
  }, [supabase, showReviews]);

  useEffect(() => {
    if (!supabase || !isHead) return;
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
  }, [supabase, isHead, isSafeguardingLead]);

  const unexplained = useUnexplainedAbsences(isHead);
  const { lessons, overdueMarking, newEnrolments } = useSchoolToday();
  const now = ukNowHm();
  const startedLessons = (lessons || []).filter((l) => now >= l.start_time.slice(0, 5));
  const missingRegisters = startedLessons.filter((l) => l.registered === 0).length;
  const statusOf = (n: number | null | undefined) => (n === null || n === undefined ? undefined : n === 0 ? ("ok" as const) : ("warning" as const));
  // "Need attention" adds up exactly the warning tiles shown below.
  const attention = [lessons === null ? null : missingRegisters, unexplained, overdueMarking?.n ?? null, outstandingCount, isSafeguardingLead ? flaggedCount : 0, showReviews ? (reviewCounts?.open ?? null) : 0];
  const attentionTotal = attention.some((n) => n === null) ? "…" : attention.reduce<number>((a, n) => a + (n || 0), 0);

  if (!isHead) {
    return (
      <div className="space-y-6">
        <DashboardHero subtitle={myRoles} />
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: "/admin/admissions", title: "Admissions", help: "Applications, calls and bookings." },
            { href: "/admin/people", title: "People", help: "Add families and pupils once they are accepted." },
          ].map((c) => (
            <a key={c.href} href={c.href} className="rounded-2xl border border-gold-light bg-white p-5 transition hover:border-teal-500/40 hover:shadow-sm">
              <h2 className="font-semibold text-ink">{c.title} &rarr;</h2>
              <p className="mt-1 text-sm text-ink/65">{c.help}</p>
            </a>
          ))}
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-8">
      <DashboardHero
        subtitle={myRoles}
        chips={[
          { label: "Lessons today", value: lessons === null ? "…" : lessons.length, tone: "yellow" },
          { label: "Need attention", value: attentionTotal, tone: "pink" },
        ]}
      />

      <ActionCentreWidget role="admin" />

      <section aria-labelledby="glance-heading">
        <h2 id="glance-heading" className="text-sm font-semibold text-ink">
          Needs attention
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatTile
            label="Registers missing today"
            value={lessons === null ? "…" : startedLessons.length === 0 ? "None due" : `${missingRegisters} of ${startedLessons.length}`}
            status={lessons === null || startedLessons.length === 0 ? undefined : statusOf(missingRegisters)}
            href="/admin/attendance"
          />
          <StatTile label="Absences to follow up (7 days)" value={unexplained ?? "…"} status={statusOf(unexplained)} href="/admin/absences" />
          <StatTile
            label="Marking overdue (7+ days)"
            value={overdueMarking ? `${overdueMarking.n}${overdueMarking.capped ? "+" : ""}` : "…"}
            status={statusOf(overdueMarking?.n)}
            href="/admin/homework"
          />
          <StatTile label="Outstanding signatures" value={outstandingCount ?? "…"} status={statusOf(outstandingCount)} href="/admin/compliance" />
          {isSafeguardingLead && <StatTile label="Flagged messages" value={flaggedCount ?? "…"} status={statusOf(flaggedCount)} href="/admin/compliance" />}
          {showReviews && (
            <StatTile
              label={reviewCounts && reviewCounts.overdue > 0 ? `Safeguarding reviews (${reviewCounts.overdue} overdue)` : "Safeguarding reviews open"}
              value={reviewCounts ? reviewCounts.open : "…"}
              status={reviewCounts ? (reviewCounts.open === 0 ? "ok" : "warning") : undefined}
              href="/admin/compliance"
            />
          )}
          <StatTile label="New pupils (7 days)" value={newEnrolments ?? "…"} href="/admin/pupils" />
        </div>
      </section>

      <TodayLessons lessons={lessons} />

      <WithdrawalNoticesAdmin compact />

      <AdminLeaderboard />

      <ActivityFeed />
    </div>
  );

  return <DashboardWithPanel viewer={{ kind: "staff" }}>{content}</DashboardWithPanel>;
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
