"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/learn/Icon";
import { normalisePortalPath } from "@/lib/learn/nav";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { useAcademicData, type AcademicData } from "./useAcademicData";

/** The setup steps, in order. Each step's page links to the one before and after it at its
 * foot (the sidebar lists them too; no strip across the top). */
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
  const here = normalisePortalPath(usePathname() || "").replace(/(.)\/$/, "$1");
  const steps = ACADEMIC_STEPS.slice(1);
  const at = steps.findIndex((s) => s.href === here);
  const prev = at > 0 ? steps[at - 1] : null;
  const next = at >= 0 && at < steps.length - 1 ? steps[at + 1] : null;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Academic setup", href: "/admin/academic" }, { label: title }]}
        title={title}
        subtitle={subtitle}
      />
      {!data.loaded ? <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" aria-label="Loading" /> : <div className="space-y-5">{children(data, reload)}</div>}
      {at >= 0 && (
        <nav aria-label="Setup steps" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gold-light pt-4 text-sm">
          {prev ? (
            <Link href={prev.href} className="inline-flex min-h-11 items-center gap-1 font-medium text-forest-700 hover:underline">
              <Icon name="chevronLeft" size="sm" /> {prev.label}
            </Link>
          ) : (
            <Link href="/admin/academic" className="inline-flex min-h-11 items-center gap-1 font-medium text-forest-700 hover:underline">
              <Icon name="chevronLeft" size="sm" /> All setup steps
            </Link>
          )}
          <span className="t-meta">Step {at + 1} of {steps.length}</span>
          {next && (
            <Link href={next.href} className="inline-flex min-h-11 items-center gap-1 font-medium text-forest-700 hover:underline">
              {next.label} <Icon name="chevronRight" size="sm" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** Shared frame for each academic-setup subpage: gate, shell, breadcrumb,
 * previous and next step, and one load of the setup data. */
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
