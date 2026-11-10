"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { TermResources } from "@/components/learn/curriculum/TermResources";

/** Curriculum > Resources: each term's resource list (docs/agent-briefs/BRIEF-RESOURCES.md). Staff only. */
export default function TeachResourcesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader title="Term resources" subtitle="Every resource the lessons use, term by term: printables made by TGA to download or share, and what comes from the school's files or the pupil's own kit." />
          <TermResources area="teach" />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
