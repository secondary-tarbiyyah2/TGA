"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ButtonLink } from "@/components/learn/ui";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "staff" };

function AdminClassesContent() {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Classes" }]}
        title="Classes"
        subtitle="Every class in the school. Open one to see its week-by-week course page."
        action={
          <ButtonLink href="/admin/academic/classes" variant="primary" icon="plus">
            Add a class
          </ButtonLink>
        }
      />
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
