"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { SyllabusPack } from "@/components/learn/curriculum/SyllabusPack";

export default function AdminSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Lesson library", href: "/admin/curriculum" }, { label: "Syllabus and specifications" }]}
          title="Syllabus and specifications"
          subtitle="Our specification for each subject, built from the official exam board documents, with the syllabus for Reception to Year 9 and the cross-curricular links. Pick a subject."
        />
        <SyllabusPack />
      </LearnGate>
    </section>
  );
}
