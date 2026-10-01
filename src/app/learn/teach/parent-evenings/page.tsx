"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { TeacherParentEvenings } from "@/components/learn/parentEvenings/TeacherParentEvenings";

export default function TeachParentEveningsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Overview", href: "/teach/dashboard" }, { label: "Parent evenings" }]}
            title="Parent evenings"
            subtitle="Your booked meetings, with the link parents use to join you."
          />
          <TeacherParentEvenings />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
