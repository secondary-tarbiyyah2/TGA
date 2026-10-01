"use client";

import { AcademicPage } from "@/components/learn/academic/AcademicPage";
import { YearGroupsSection } from "@/components/learn/academic/BasicSections";

export default function Page() {
  return (
    <AcademicPage title="Year groups" subtitle="The year groups pupils are placed in.">
      {(data, reload) => (
        <YearGroupsSection yearGroups={data.yearGroups} classes={data.classes} enrolments={data.enrolments} reload={reload} />
      )}
    </AcademicPage>
  );
}
