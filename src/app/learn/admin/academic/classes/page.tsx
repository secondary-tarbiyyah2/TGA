"use client";

import { AcademicPage } from "@/components/learn/academic/AcademicPage";
import { ClassesSection } from "@/components/learn/academic/ClassesSection";
import { TeacherMatrix } from "@/components/learn/academic/TeacherMatrix";

export default function Page() {
  return (
    <AcademicPage title="Classes and teachers" subtitle="Create classes, enrol pupils and choose the teacher for each class subject.">
      {(data, reload) => (
        <>
        <ClassesSection
          classes={data.classes}
          yearGroups={data.yearGroups}
          subjects={data.subjects}
          years={data.years}
          kids={data.children}
          enrolments={data.enrolments}
          teachers={data.teachers}
          classTeachers={data.classTeachers}
          subjectTeachers={data.subjectTeachers}
          reload={reload}
          ready={data.years.length > 0 && data.yearGroups.length > 0 && data.subjects.length > 0}
        />
        <TeacherMatrix
          classes={data.classes}
          yearGroups={data.yearGroups}
          subjects={data.subjects}
          teachers={data.teachers}
          classTeachers={data.classTeachers}
          subjectTeachers={data.subjectTeachers}
          reload={reload}
        />
        </>
      )}
    </AcademicPage>
  );
}
