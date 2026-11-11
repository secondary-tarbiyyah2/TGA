"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumViews } from "@/components/learn/curriculum/CurriculumHome";
import { SyllabusBrowser } from "@/components/learn/curriculum/SyllabusBrowser";

export default function AdminSyllabusPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader actions={<CurriculumViews area="admin" />}
          crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Curriculum", href: "/admin/curriculum" }, { label: "Syllabus" }]}
          title="Syllabus"
          subtitle="What each subject teaches from Year 1 to Year 11: the long-term plan, every unit week by week, progression and exams, all on this page."
        />
        <SyllabusBrowser area="admin" />
      </LearnGate>
    </section>
  );
}
