"use client";

import { useMemo } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CalendarView } from "@/components/learn/CalendarView";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { useFamilyChildren } from "@/lib/learn/classes";
import type { CalendarScope } from "@/lib/learn/calendar";

function FamilyCalendarContent() {
  const children = useFamilyChildren();
  const scope = useMemo<CalendarScope | null>(() => (children ? { kind: "parent", children: children.map((c) => ({ id: c.id, name: c.name })) } : null), [children]);
  return (
    <>
      <PageHeader title="Calendar" subtitle="Your children's lessons and homework deadlines." />
      <CalendarView scope={scope} />
      <IcsFeedLink />
    </>
  );
}

export default function FamilyCalendarPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilyCalendarContent />
      </LearnGate>
    </section>
  );
}
