"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";
import Link from "next/link";

export default function AdminCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <PageHeader
          crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Lesson library" }]}
          title="Lesson library"
          subtitle="Pick a year, then a unit. Each unit has its lessons (slides and plans, with version history), its revision pack for pupils, and pupil results."
        />
        <CurriculumLibrary area="admin" />
          <p className="mt-4 text-sm text-ink/75">
            Looking for the official specifications and syllabuses? <Link href="/admin/syllabus" className="font-semibold text-teal-800 underline">Open Syllabus and specifications</Link>.
          </p>
      </LearnGate>
    </section>
  );
}
