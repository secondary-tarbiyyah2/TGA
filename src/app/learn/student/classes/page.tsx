"use client";

import { useMemo } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useStudentChildId, useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

function StudentClassesContent() {
  const childId = useStudentChildId();
  const viewer = useMemo<ClassViewer | null>(() => (childId ? { kind: "student", childId } : null), [childId]);
  const classes = useViewerClasses(viewer);
  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/student/dashboard" }, { label: "My classes" }]} title="My classes" />
      {childId === null ? (
        <p className="text-sm text-ink/65">Your account isn&apos;t linked to a student record yet.</p>
      ) : viewer ? (
        <ClassGrid viewer={viewer} classes={classes} hrefFor={(c) => `/student/class?id=${c.id}`} emptyLabel="You're not in any classes yet." />
      ) : (
        <ClassGrid viewer={{ kind: "teacher" }} classes={null} hrefFor={() => ""} emptyLabel="" />
      )}
    </>
  );
}

export default function StudentClassesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student"]}>
        <StudentClassesContent />
      </LearnGate>
    </section>
  );
}
