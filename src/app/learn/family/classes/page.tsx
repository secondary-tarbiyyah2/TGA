"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { useFamilyChildren, useViewerClasses, type ClassViewer, type FamilyChild } from "@/lib/learn/classes";

function ChildClasses({ child }: { child: FamilyChild }) {
  const viewer = useMemo<ClassViewer>(() => ({ kind: "parent", childId: child.id }), [child.id]);
  const classes = useViewerClasses(viewer);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-semibold text-ink">
        {child.name}
        {child.yearGroup && <span className="ml-2 text-sm font-normal text-ink/65">{child.yearGroup}</span>}
      </h2>
      <ClassGrid viewer={viewer} classes={classes} hrefFor={(c) => `/family/class?id=${c.id}&child=${child.id}`} emptyLabel={`${child.name} isn't enrolled in any classes yet.`} />
    </section>
  );
}

function FamilyClassesContent() {
  const children = useFamilyChildren();
  const only = useSearchParams().get("child");
  const shown = (children || []).filter((c) => !only || c.id === only);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/family/dashboard" }, { label: "Classes" }]}
        title="Classes"
        subtitle="Each of your children's classes: lessons, homework, grades and announcements."
      />
      {children && children.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/family/classes" className={`inline-flex min-h-10 items-center rounded-lg px-3 py-1.5 text-sm font-medium ${!only ? "bg-teal-700 text-white" : "border border-gold-light bg-white text-ink/80 hover:bg-cream"}`}>
            All children
          </Link>
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/family/classes?child=${c.id}`}
              className={`inline-flex min-h-10 items-center rounded-lg px-3 py-1.5 text-sm font-medium ${only === c.id ? "bg-teal-700 text-white" : "border border-gold-light bg-white text-ink/80 hover:bg-cream"}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
      {children === null ? (
        <div className="h-48 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : children.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/65">
          No children on your account yet. Add them from your <Link href="/family/dashboard" className="text-teal-700 underline">dashboard</Link>.
        </p>
      ) : (
        shown.map((c) => <ChildClasses key={c.id} child={c} />)
      )}
    </>
  );
}

export default function FamilyClassesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["parent"]}>
        <Suspense fallback={<p className="text-sm text-ink/65">Loading…</p>}>
          <FamilyClassesContent />
        </Suspense>
      </LearnGate>
    </section>
  );
}
