"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { WorkspaceHeader } from "@/components/learn/kit";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "teacher" };

function TeachClassesContent() {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <div className="mb-6">
        <WorkspaceHeader
          eyebrow={[{ label: "Today", href: "/teach/dashboard" }, { label: "Teaching" }]}
          title="My classes"
          description="Every class you teach or cover."
          stats={classes ? [{ value: classes.length, label: classes.length === 1 ? "class" : "classes" }] : undefined}
          menu={[
            { label: "Gradebook", icon: "award", href: "/teach/assessment" },
            { label: "Classwork to action", icon: "notebookPen", href: "/teach/homework" },
          ]}
        />
      </div>
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
