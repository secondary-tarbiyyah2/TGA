"use client";

import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { YearGroupsSection, SubjectsSection, YearsSection } from "@/components/learn/academic/BasicSections";
import { ClassesSection } from "@/components/learn/academic/ClassesSection";
import { useAcademicData } from "@/components/learn/academic/useAcademicData";

function AcademicContent() {
  const { data, reload } = useAcademicData();
  const ready = data.years.length > 0 && data.yearGroups.length > 0 && data.subjects.length > 0;
  const next = !data.loaded
    ? null
    : data.years.length === 0
      ? { text: "Next: add an academic year (step 1).", href: "#years" }
      : data.yearGroups.length === 0
        ? { text: "Next: add your year groups (step 2).", href: "#year-groups" }
        : data.subjects.length === 0
          ? { text: "Next: add your subjects (step 3).", href: "#subjects" }
          : data.classes.length === 0
            ? { text: "Next: add your classes (step 4).", href: "#classes" }
            : null;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Academic setup" }]}
        title="Academic setup"
        subtitle="Set the school up once, in order: year, year groups, subjects, classes. Then build the timetable."
      />
      <div className="space-y-5">
        {data.loaded && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-500/30 bg-teal-100/60 px-4 py-3 text-sm text-teal-900">
            {next ? (
              <a href={next.href} className="font-medium underline">{next.text}</a>
            ) : (
              <span className="font-medium">Setup complete.</span>
            )}
            {!next && <Link href="/admin/lessons" className="font-semibold underline">Next: build the timetable &rarr;</Link>}
          </div>
        )}
        {!data.loaded && <p className="text-sm text-ink/60">Loading…</p>}
        {data.loaded && (
          <>
            <YearsSection years={data.years} terms={data.terms} reload={reload} />
            <YearGroupsSection yearGroups={data.yearGroups} classes={data.classes} enrolments={data.enrolments} reload={reload} />
            <SubjectsSection subjects={data.subjects} reload={reload} />
            <ClassesSection
              classes={data.classes}
              yearGroups={data.yearGroups}
              subjects={data.subjects}
              years={data.years}
              kids={data.children}
              enrolments={data.enrolments}
              teachers={data.teachers}
              classTeachers={data.classTeachers}
              reload={reload}
              ready={ready}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminAcademicPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <AcademicContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
