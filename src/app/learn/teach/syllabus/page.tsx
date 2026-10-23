"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { SyllabusPack } from "@/components/learn/curriculum/SyllabusPack";

export default function TeachSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Home", href: "/teach/dashboard" }, { label: "Lesson library", href: "/teach/curriculum" }, { label: "Syllabus and specifications" }]}
            title="Syllabus and specifications"
            subtitle="Our specification for each subject, built from the official exam board documents, with the syllabus for Reception to Year 9 and the cross-curricular links. Pick a subject."
          />
          <SyllabusPack />
        </LearnShell>
      </LearnGate>
    </section>
  );
}
