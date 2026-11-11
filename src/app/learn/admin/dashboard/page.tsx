"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Status, ui } from "@/components/learn/ui";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { DashboardWithPanel } from "@/components/learn/DashboardSidePanel";
import { ukDateTime, ukNowHm, ukToday } from "@/lib/learn/ukTime";
import { AdminLeaderboard } from "@/components/learn/behaviour/LeaderboardCards";
import { WithdrawalNoticesAdmin } from "@/components/learn/fees/WithdrawalNoticesAdmin";
import { DashboardHero } from "@/components/learn/DashboardHero";
import { CurriculumHealth, useCurriculumFigures } from "@/components/learn/curriculum/CurriculumHealth";
import { RecentLessons } from "@/components/learn/curriculum/RecentLessons";
import { ActionCentreWidget } from "@/components/learn/ActionCentreWidget";
import { useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PushOptIn } from "@/components/learn/PushOptIn";
import { RegisterPanel } from "@/components/learn/attendance/RegisterPanel";
import { CoverToday } from "@/components/learn/dashboard/CoverToday";
import { QuickActions, type QuickAction } from "@/components/learn/dashboard/QuickActions";
import { BehaviourDialog } from "@/components/learn/dashboard/BehaviourDialog";
import type { ActionItem } from "@/lib/learn/actionCentre";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  BOOKING_CALL_JOIN: "started a call for a booking",
  LESSON_JOIN: "joined a lesson call",
  ABSENCE_ALERT_SENT: "sent an absence alert",
};

function humanizeAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] || `made a change (${action.toLowerCase().replace(/_/g, " ")})`;
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
        <Link href="/admin/audit-log" className={`${ui.btnLink} !text-xs`}>
          Full audit log
        </Link>
      </div>
      {rows === null ? (
        <div className="m-5 h-24 motion-safe:animate-pulse rounded-xl bg-cream" aria-label="Loading" />
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

/**
 * The brief's admin "today" view: today's live lessons across the school,
 * which registers are taken and which are missing, plus overdue marking
 * and new enrolments. Every figure is a live query (RLS: manage_academic);
 * fees and inactive-student figures are left out until that data exists.
 */
function useSchoolToday() {
  const [lessons, setLessons] = useState<TodayLessonRow[] | null>(null);

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
  }, []);

  return { lessons };
}

function TodayLessons({ lessons }: { lessons: TodayLessonRow[] | null }) {
  const now = ukNowHm();
  // A lesson's register opens over Today (owner, 11 Nov 2026: actions open in place).
  const [register, setRegister] = useState<TodayLessonRow | null>(null);
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const isTaken = (l: TodayLessonRow) => l.registered > 0 || !!marked[l.id];
  const started = (lessons || []).filter((l) => now >= l.start_time.slice(0, 5));
  const takenCount = started.filter(isTaken).length;
  // A whole school's day can be long: lessons with a register taken fold into the summary
  // line, so what is left is what still needs someone (owner: no long expanded lists).
  const shown = showAll ? lessons || [] : (lessons || []).filter((l) => !(now >= l.start_time.slice(0, 5) && isTaken(l)));
  return (
    <div data-guide="admin-lessons-today" className="rounded-2xl border border-gold-light bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold-light px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">
          Today&apos;s lessons
          {started.length > 0 && (
            <span className={`ml-1.5 font-normal ${takenCount < started.length ? "text-amber-900" : "text-ink/60"}`}>
              · {takenCount} of {started.length} registers taken
            </span>
          )}
        </h2>
        <span className="flex gap-3">
          <Link href="/admin/attendance" className={`${ui.btnLink} !text-xs`}>
            Take registers
          </Link>
          <Link href="/admin/calendar" className={`${ui.btnLink} !text-xs`}>
            Calendar
          </Link>
        </span>
      </div>
      {lessons === null ? (
        <div className="m-5 h-24 motion-safe:animate-pulse rounded-xl bg-cream" aria-label="Loading" />
      ) : lessons.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink/65">No lessons on the published timetable today.</p>
      ) : (
        <ul className="divide-y divide-gold-light/70">
          {shown.map((l) => {
            const started = now >= l.start_time.slice(0, 5);
            return (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-12 shrink-0 font-medium tabular-nums text-ink/70" title={`${l.start_time.slice(0, 5)} to ${l.end_time.slice(0, 5)}`}>
                  {l.start_time.slice(0, 5)}
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/class?id=${l.class_id}`} className="block truncate font-medium text-ink hover:text-teal-700" title={l.className}>
                    {l.className}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3">
                    {l.bbb_status === "live" && <span className="text-xs font-semibold text-red-700">Live now</span>}
                    {started ? l.registered > 0 || marked[l.id] ? <Status kind="completed">Register taken</Status> : <Status kind="overdue">Register missing</Status> : <Status kind="pending">Later</Status>}
                  </span>
                </span>
                {started && (
                  <button type="button" onClick={() => setRegister(l)} className={`${ui.btnSecondary} ${ui.sm}`}>
                    {l.registered > 0 || marked[l.id] ? "Register" : "Take register"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lessons && lessons.length > 0 && takenCount > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="flex min-h-11 w-full items-center border-t border-gold-light/70 px-5 text-left text-sm font-medium text-forest-700 hover:bg-[var(--portal-hover)]">
          {showAll ? "Hide lessons with a register taken" : `Show ${takenCount} lesson${takenCount === 1 ? "" : "s"} with a register taken`}
        </button>
      )}
      {lessons && lessons.length > 0 && shown.length === 0 && <p className="px-5 py-4 text-sm text-ink/65">Every register so far is taken. No more lessons today.</p>}
      {register && (
        <RegisterPanel
          lessonId={register.id}
          classId={register.class_id}
          className={register.className}
          when={`${register.start_time.slice(0, 5)} to ${register.end_time.slice(0, 5)}`}
          lessonHref={`/admin/lessons/view?id=${register.id}`}
          onClose={() => setRegister(null)}
          onProgress={(taken, total) => {
            if (total > 0 && taken > 0) setMarked((m) => ({ ...m, [register.id]: true }));
          }}
        />
      )}
    </div>
  );
}

/**
 * At-a-glance counts for whoever lands here after signing in. Every number
 * is a live query that matches the page it links to, never an invented
 * figure. Admissions-only staff can't read the school-wide tables (RLS:
 * manage_academic), so they get a short pointer to their pages instead of
 * a dashboard full of misleading zeros.
 */
function DashboardContent() {
  const curriculum = useCurriculumFigures();
  const { roles } = useLearnSession();
  // roles can hold one row per scope (e.g. several classes) that all
  // resolve to the same label, dedupe before display.
  const isHead = roles.some((r) => r.role === "head_teacher" || r.role === "admin");
  const myRoles = Array.from(new Set(roles.map((r) => learnRoleLabel(r.role)))).join(", ");
  const { lessons } = useSchoolToday();
  const [panel, setPanel] = useState<"behaviour" | null>(null);
  // Lessons waiting for the head's review join the Curriculum box in Waiting for you, so
  // approvals sit with every other job instead of in a separate row of figures.
  const lessonsToApprove: ActionItem[] = curriculum && curriculum.waiting > 0
    ? [{ id: "adm-lessons-review", area: "Curriculum", urgency: "soon", title: `${curriculum.waiting} lesson${curriculum.waiting === 1 ? "" : "s"} waiting for your review`, detail: "Written lessons to approve or send back with changes.", href: "/admin/curriculum/review", cta: "Review lessons" }]
    : [];
  const now = ukNowHm();
  const started = (lessons || []).filter((l) => now >= l.start_time.slice(0, 5));
  const missing = started.filter((l) => l.registered === 0).length;
  const quick: QuickAction[] = [
    { label: "Registers", hint: lessons === null ? "…" : missing ? `${missing} not taken` : started.length ? "All taken so far" : "None started yet", alert: missing > 0, icon: "userCheck", href: "/admin/attendance" },
    { label: "Log behaviour", hint: "Praise, concern or incident", icon: "heartHandshake", onSelect: () => setPanel("behaviour") },
    { label: "Message", hint: "A family or colleague", icon: "messageSquare", href: "/admin/messages?compose=1" },
    { label: "Announcement", hint: "To families or staff", icon: "megaphone", href: "/admin/announcements" },
    { label: "Absences and cover", hint: "Follow up, arrange cover", icon: "calendarX", href: "/admin/absences" },
    { label: "Pupils", hint: "Find a pupil's record", icon: "backpack", href: "/admin/pupils" },
    { label: "Lesson review", hint: curriculum ? (curriculum.waiting ? `${curriculum.waiting} waiting` : "Nothing waiting") : "…", icon: "clipboardCheck", href: "/admin/curriculum/review" },
    { label: "Applications", hint: "Admissions queue", icon: "userRoundPlus", href: "/admin/admissions" },
  ];

  if (!isHead) {
    return (
      <div className="space-y-6">
        <DashboardHero area="admin" subtitle={myRoles} />
        <div data-guide="admissions-shortcuts" className="grid gap-3 sm:grid-cols-2">
          {[
            { href: "/admin/admissions", title: "Applications", help: "Applications, calls and bookings." },
            { href: "/admin/assessments", title: "Entry assessments", help: "Set and mark each applicant's entry assessment." },
            { href: "/admin/open-evening", title: "Open evenings", help: "Sessions, bookings and attendee lists." },
            { href: "/admin/people", title: "Accounts", help: "Add families and pupils once they are accepted." },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="rounded-2xl border border-gold-light bg-white p-5 transition hover:border-gold-500 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
              <h2 className="font-semibold text-ink">{c.title} &rarr;</h2>
              <p className="mt-1 text-sm text-ink/65">{c.help}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // The head's Today (owner, 11 Nov 2026): quick actions at the very top, then today's lessons
  // and cover side by side, then Waiting for you in category boxes. The old figures strip and
  // "Today at a glance" row repeated these three, so they are gone.
  const content = (
    <div className="space-y-6">
      <DashboardHero area="admin" subtitle={myRoles || undefined} />

      <QuickActions actions={quick} guide="admin-quick-actions" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TodayLessons lessons={lessons} />
        <CoverToday />
      </div>

      {/* Registers are in Today's lessons beside it, so they are not repeated here. */}
      <ActionCentreWidget role="admin" extra={lessonsToApprove} skipAreas={["Registers"]} />

      <CurriculumHealth figures={curriculum} />

      <WithdrawalNoticesAdmin compact />

      <AdminLeaderboard />

      <ActivityFeed />

      <RecentLessons area="admin" compact />
      <PushOptIn />
      {panel === "behaviour" && <BehaviourDialog allowIncident onClose={() => setPanel(null)} />}
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
