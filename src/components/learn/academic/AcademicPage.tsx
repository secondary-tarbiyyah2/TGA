"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { useAcademicData, type AcademicData } from "./useAcademicData";

function Inner({ title, subtitle, children }: { title: string; subtitle: string; children: (data: AcademicData, reload: () => Promise<void>) => ReactNode }) {
  const { data, reload } = useAcademicData();
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Academic setup", href: "/admin/academic" }, { label: title }]}
        title={title}
        subtitle={subtitle}
        actions={
          <Link href="/admin/academic" className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            &larr; Academic setup
          </Link>
        }
      />
      {!data.loaded ? <p className="text-sm text-ink/65">Loading…</p> : <div className="space-y-5">{children(data, reload)}</div>}
    </div>
  );
}

/** Shared frame for each academic-setup subpage: gate, shell, breadcrumb,
 * back link and one load of the setup data. */
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
