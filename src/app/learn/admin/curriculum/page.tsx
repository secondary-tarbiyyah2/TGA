"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";

export default function AdminCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Lesson library" }]}
          title="Lesson library"
          subtitle="Every lesson with slides (PowerPoint and PDF) and a teacher lesson plan (Word and PDF). Teachers can edit, re-upload and share slides; every change is kept in the version history."
        />
        <CurriculumLibrary area="admin" />
      </LearnGate>
    </section>
  );
}
