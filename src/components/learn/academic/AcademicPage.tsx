"use client";

import type { ReactNode } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { SubPageNav } from "@/components/learn/SubPageNav";
import { useAcademicData, type AcademicData } from "./useAcademicData";

/** The setup steps, in order, shown as a strip on each step's page. */
export const ACADEMIC_STEPS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin/academic", label: "Overview", exact: true },
  { href: "/admin/academic/years", label: "1. Years and terms" },
  { href: "/admin/academic/year-groups", label: "2. Year groups" },
  { href: "/admin/academic/subjects", label: "3. Subjects" },
  { href: "/admin/academic/classes", label: "4. Classes and teachers" },
  { href: "/admin/academic/meeting-links", label: "5. Meeting links" },
];

function Inner({ title, subtitle, children }: { title: string; subtitle: string; children: (data: AcademicData, reload: () => Promise<void>) => ReactNode }) {
  const { data, reload } = useAcademicData();
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Academic setup", href: "/admin/academic" }, { label: title }]}
        title={title}
        subtitle={subtitle}
      />
      <SubPageNav label="Academic setup steps" items={ACADEMIC_STEPS} />
      {!data.loaded ? <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" /> : <div className="space-y-5">{children(data, reload)}</div>}
    </div>
  );
}

/** Shared frame for each academic-setup subpage: gate, shell, breadcrumb,
 * step strip and one load of the setup data. */
export function AcademicPage(props: { title: string; subtitle: string; children: (data: AcademicData, reload: () => Promise<void>) => ReactNode }) {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <Inner {...props} />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
