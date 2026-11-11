"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { RegisterList } from "@/components/learn/attendance/RegisterList";

/**
 * Lessons and registers, SIMS-style (owner feedback 11 Nov 2026, item 9): your lessons as a
 * list of sessions (date, class, period, register state) with filters. Opening one goes to
 * that register's own page; nothing expands here. Join for a live lesson stays on Today and
 * the lesson page.
 */
export default function TeachTodayPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <PageHeader title="Lessons and registers" subtitle="Your lessons and where each register stands. Open one to take or correct it." />
        <RegisterList scope="mine" base="/teach" />
      </LearnGate>
    </section>
  );
}
