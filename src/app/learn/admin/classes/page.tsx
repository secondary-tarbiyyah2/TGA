"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { WorkspaceHeader } from "@/components/learn/kit";
import { ButtonLink } from "@/components/learn/ui";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "staff" };

function AdminClassesContent() {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <div className="mb-6">
        <WorkspaceHeader
          eyebrow={[{ label: "Home", href: "/admin/dashboard" }, { label: "Teaching" }]}
          title="Classes"
          description="Every class in the school. Open one to see its week-by-week course page."
          stats={classes ? [{ value: classes.length, label: classes.length === 1 ? "class" : "classes" }, { value: new Set(classes.map((c) => c.yearGroup).filter(Boolean)).size, label: "year groups" }] : undefined}
          primary={
            <ButtonLink href="/admin/academic/classes" variant="primary" icon="plus">
              Add a class
            </ButtonLink>
          }
          menu={[
            { label: "Timetable", icon: "calendarDays", href: "/admin/lessons" },
            { label: "Classwork to action", icon: "notebookPen", href: "/admin/homework" },
          ]}
        />
      </div>
      <ClassGrid viewer={VIEWER} classes={classes} hrefFor={(c) => `/admin/class?id=${c.id}`} emptyLabel="No classes yet. Use Add a class to create one." />
    </>
  );
}

export default function AdminClassesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminClassesContent />
      </LearnGate>
    </section>
  );
}
