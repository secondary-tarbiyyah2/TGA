"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
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
        actions={
          <a href="/admin/academic" className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-900">
            + Add a class
          </a>
        }
      />
      <ClassGrid viewer={VIEWER} classes={classes} hrefFor={(c) => `/admin/class?id=${c.id}`} emptyLabel="No classes yet. Add one from Academic." />
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
