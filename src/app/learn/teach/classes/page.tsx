"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "teacher" };

function TeachClassesContent() {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <PageHeader title="My classes" subtitle="Every class you teach or cover." />
      <ClassGrid viewer={VIEWER} classes={classes} hrefFor={(c) => `/teach/class?id=${c.id}`} emptyLabel="You haven't been assigned to any classes yet." />
    </>
  );
}

export default function TeachClassesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["teacher", "teaching_assistant_cover"]}>
        <TeachClassesContent />
      </LearnGate>
    </section>
  );
}
