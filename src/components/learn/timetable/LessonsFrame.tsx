"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { normalisePortalPath } from "@/lib/learn/nav";

export const LESSON_TABS: { href: string; label: string }[] = [
  { href: "/admin/lessons", label: "Overview" },
  { href: "/admin/lessons/timetable", label: "Timetable" },
  { href: "/admin/lessons/generate", label: "Generate" },
  { href: "/admin/lessons/availability", label: "Availability" },
  { href: "/admin/lessons/day", label: "School day" },
  { href: "/admin/lessons/list", label: "Lessons" },
];

function Tabs() {
  const path = normalisePortalPath(usePathname() || "").replace(/\/$/, "");
  return (
    <nav aria-label="Timetable and lessons" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-gold-light/50 bg-white p-1">
      {LESSON_TABS.map((t) => {
        const active = t.href === "/admin/lessons" ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-teal-100 text-teal-900" : "text-ink/70 hover:bg-cream"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header, breadcrumb and sub-page tab strip. Render inside LessonsFrame. */
export function LessonsHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const isHub = title === "Timetable & lessons";
  return (
    <>
      <PageHeader
        crumbs={isHub ? [{ label: "Home", href: "/admin/dashboard" }, { label: "Timetable & lessons" }] : [{ label: "Home", href: "/admin/dashboard" }, { label: "Timetable & lessons", href: "/admin/lessons" }, { label: title }]}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <Tabs />
    </>
  );
}

/** Gate and shell for every Timetable & lessons page. Put data hooks in a
 * child component so they run only after sign-in. */
export function LessonsFrame({ children }: { children: ReactNode }) {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>{children}</AdminShell>
      </LearnGate>
    </section>
  );
}
