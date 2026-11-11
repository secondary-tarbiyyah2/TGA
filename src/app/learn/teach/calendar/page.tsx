"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CalendarView } from "@/components/learn/CalendarView";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import type { CalendarScope } from "@/lib/learn/calendar";

const SCOPE: CalendarScope = { kind: "teacher" };

export default function TeachCalendarPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <PageHeader title="Calendar" subtitle="Your lessons, homework and assessments, school events, meetings, term dates and Islamic dates." />
        <CalendarView scope={SCOPE} />
        <IcsFeedLink />
      </LearnGate>
    </section>
  );
}
