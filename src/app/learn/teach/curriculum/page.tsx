"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { LearnShell } from "@/components/learn/LearnShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";
import Link from "next/link";

export default function TeachCurriculumPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <LearnShell role="teach">
          <PageHeader
            crumbs={[{ label: "Dashboard", href: "/teach/dashboard" }, { label: "Lesson library" }]}
            title="Lesson library"
            subtitle="Pick a year, then a unit. Each unit has its lessons (slides and lesson plans to view, download, edit or share), its revision pack for pupils, and your pupils' revision results."
          />
          <CurriculumLibrary area="teach" />
          <p className="mt-4 text-sm text-ink/75">
            Looking for the official specifications and syllabuses? <Link href="/teach/syllabus" className="font-semibold text-teal-800 underline">Open Syllabus and specifications</Link>.
          </p>
        </LearnShell>
      </LearnGate>
    </section>
  );
}
