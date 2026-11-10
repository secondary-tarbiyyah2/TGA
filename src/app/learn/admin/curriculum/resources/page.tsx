"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { TermResources } from "@/components/learn/curriculum/TermResources";

/** Curriculum > Resources: each term's resource list (docs/agent-briefs/BRIEF-RESOURCES.md). Staff only. */
export default function AdminResourcesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Term resources" }]}
          title="Term resources"
          subtitle="Every resource the lessons use, term by term: printables made by TGA to download or share, and what comes from the school's files or the pupil's own kit."
        />
        <TermResources area="admin" />
      </LearnGate>
    </section>
  );
}
