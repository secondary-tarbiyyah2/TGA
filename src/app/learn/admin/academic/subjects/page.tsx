"use client";

import { AcademicPage } from "@/components/learn/academic/AcademicPage";
import { SubjectsSection } from "@/components/learn/academic/BasicSections";

export default function Page() {
  return (
    <AcademicPage title="Subjects" subtitle="Everything the school teaches.">
      {(data, reload) => (
        <SubjectsSection subjects={data.subjects} reload={reload} />
      )}
    </AcademicPage>
  );
}
