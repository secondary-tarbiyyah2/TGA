"use client";

import { useMemo } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CalendarView } from "@/components/learn/CalendarView";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { useStudentChildId } from "@/lib/learn/classes";
import type { CalendarScope } from "@/lib/learn/calendar";

function StudentCalendarContent() {
  const childId = useStudentChildId();
  const scope = useMemo<CalendarScope | null>(() => (childId ? { kind: "student", childId } : null), [childId]);
  return (
    <>
      <PageHeader title="Calendar" subtitle="Your lessons and when homework is due." />
      {childId === null ? <p className="text-sm text-ink/65">Your account isn&apos;t linked to a student record yet.</p> : <CalendarView scope={scope} />}
      <IcsFeedLink />
    </>
  );
}

export default function StudentCalendarPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <StudentCalendarContent />
      </LearnGate>
    </section>
  );
}
