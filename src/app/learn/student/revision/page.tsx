"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { PupilRevision } from "@/components/learn/revision/PupilRevision";

export default function StudentRevisionPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <LearnShell role="student">
          <PageHeader
            crumbs={[{ label: "Today", href: "/student/dashboard" }, { label: "Unit revision" }]}
            title="Unit revision"
            subtitle="Pick a unit, read the summary, try the quiz, then practise the bits you found tricky. Your teachers see how you get on so they can help."
          />
          <PupilRevision />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
