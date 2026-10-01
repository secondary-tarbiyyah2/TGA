"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { MeetYourTeachers } from "@/components/learn/staff/MeetYourTeachers";

export default function FamilyTeachersPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <LearnShell role="family">
          <PageHeader title="Meet your teachers" subtitle="Who teaches your children, in their own words." />
          <MeetYourTeachers bare />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
