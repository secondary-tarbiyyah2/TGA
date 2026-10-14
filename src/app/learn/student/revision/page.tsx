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
            crumbs={[{ label: "Home", href: "/student/dashboard" }, { label: "Unit revision" }]}
            title="Unit revision"
            subtitle="Revise a unit from its summary, take the quiz, then let the practice coach work on the topics you found hardest. Your teachers see your results so they can help."
          />
          <PupilRevision />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
