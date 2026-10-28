"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CalendarView } from "@/components/learn/CalendarView";
import { useLearnSession } from "@/lib/learn/session";
import type { CalendarScope } from "@/lib/learn/calendar";

const SCOPE: CalendarScope = { kind: "staff" };

// Admissions staff reach this page from the sidebar too (the Calendar hub is
// not head-only), so they may look; only the Headteacher/Admin manage term
// dates and closures.
export default function AdminCalendarPage() {
  const { roles } = useLearnSession();
  const canManage = roles.some((r) => r.role === "head_teacher" || r.role === "admin");
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <PageHeader title="Calendar" subtitle="Pick a date to see every lesson, deadline and notice for any child, class or teacher." />
        <CalendarView scope={SCOPE} canManageTerms={canManage} />
      </LearnGate>
    </section>
  );
}
