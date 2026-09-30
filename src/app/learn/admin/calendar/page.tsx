"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CalendarView } from "@/components/learn/CalendarView";
import type { CalendarScope } from "@/lib/learn/calendar";

const SCOPE: CalendarScope = { kind: "staff" };

export default function AdminCalendarPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader title="Calendar" subtitle="Every live lesson and homework deadline across the school." />
        <CalendarView scope={SCOPE} />
      </LearnGate>
    </section>
  );
}
