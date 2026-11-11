"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { ActionsMenu } from "@/components/learn/kit";
import { PageHeader } from "@/components/learn/PageHeader";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "teacher" };

function TeachClassesContent() {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <PageHeader
        title="My classes"
        subtitle="Every class you teach or cover."
        figures={classes ? [{ value: classes.length, label: classes.length === 1 ? "class" : "classes" }] : undefined}
        actions={
          <ActionsMenu
            items={[
              { label: "Gradebook", icon: "award", href: "/teach/assessment" },
              { label: "Classwork to action", icon: "notebookPen", href: "/teach/homework" },
            ]}
          />
        }
      />
      <ClassGrid viewer={VIEWER} classes={classes} defaultView="list" hrefFor={(c) => `/teach/class?id=${c.id}`} emptyLabel="You haven't been assigned to any classes yet." />
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
