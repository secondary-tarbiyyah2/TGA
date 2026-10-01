"use client";

import { AcademicPage } from "@/components/learn/academic/AcademicPage";
import { MeetingLinksSection } from "@/components/learn/academic/MeetingLinksSection";

export default function Page() {
  return (
    <AcademicPage title="Meeting links" subtitle="A recurring lesson link for each class.">
      {(data, reload) => (
        <MeetingLinksSection classes={data.classes} reload={reload} />
      )}
    </AcademicPage>
  );
}
