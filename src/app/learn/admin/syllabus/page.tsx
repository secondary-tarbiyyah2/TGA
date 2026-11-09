"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { SyllabusBrowser } from "@/components/learn/curriculum/SyllabusBrowser";

export default function AdminSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Syllabus and specifications" }]}
          title="Syllabus and specifications"
          subtitle="What each subject teaches from Year 1 to Year 11: the long-term plan half term by half term, every unit with its week-by-week plan, and the curriculum document to print or download."
        />
        <SyllabusBrowser area="admin" />
      </LearnGate>
    </section>
  );
}
