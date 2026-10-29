"use client";

import { AcademicPage } from "@/components/learn/academic/AcademicPage";
import { YearsSection } from "@/components/learn/academic/BasicSections";

export default function Page() {
  return (
    <AcademicPage title="Years and terms" subtitle="The academic years the school runs, with their terms.">
      {(data, reload) => (
        <YearsSection years={data.years} terms={data.terms} reload={reload} />
      )}
    </AcademicPage>
  );
}
