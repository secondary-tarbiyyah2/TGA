"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Stepper } from "@/components/learn/templates/parts";
import { normalisePortalPath } from "@/lib/learn/nav";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";

export const LESSON_TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin/lessons", label: "Overview", exact: true },
  { href: "/admin/lessons/timetable", label: "Timetable" },
  { href: "/admin/lessons/generate", label: "Make the timetable" },
  { href: "/admin/lessons/availability", label: "Staff availability" },
  { href: "/admin/lessons/day", label: "School day" },
  { href: "/admin/lessons/list", label: "Lessons" },
];

/**
 * Making the timetable as stages, in the order the office does them (owner, 11 Nov 2026:
 * timetabling shows its stages and the current step). Each stage opens its page.
 */
export const TIMETABLE_STAGES: { href: string; label: string; meta: string }[] = [
  { href: "/admin/lessons/day", label: "School day", meta: "Periods and breaks" },
  { href: "/admin/lessons/availability", label: "Staff availability", meta: "Who can teach when" },
  { href: "/admin/lessons/generate", label: "Make the timetable", meta: "Build and check" },
  { href: "/admin/lessons/timetable", label: "Timetable", meta: "Publish and adjust" },
  { href: "/admin/lessons/list", label: "Lessons", meta: "Each lesson as it runs" },
];

function TimetableStages() {
  const here = normalisePortalPath(usePathname() || "").replace(/\/$/, "");
  return (
    <div className="mb-6 border-y border-gold-light py-2 print:hidden">
      <Stepper label="Timetable stages" guide="timetable-stages" steps={TIMETABLE_STAGES.map((s) => ({ key: s.href, label: s.label, meta: s.meta, href: s.href, state: here === s.href ? "current" : "todo" }))} />
    </div>
  );
}

/** The overview page's title; the other pages sit under it in the breadcrumb. */
export const LESSONS_HUB_TITLE = "Timetable and lessons";

/** Header and breadcrumb (the sub-pages are listed under Timetable in the sidebar). Render inside LessonsFrame. */
export function LessonsHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const isHub = title === LESSONS_HUB_TITLE;
  return (
    <>
      <PageHeader
        crumbs={isHub ? [{ label: "Today", href: "/admin/dashboard" }, { label: LESSONS_HUB_TITLE }] : [{ label: "Today", href: "/admin/dashboard" }, { label: LESSONS_HUB_TITLE, href: "/admin/lessons" }, { label: title }]}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <TimetableStages />
    </>
  );
}

/** Gate and shell for every Timetable and lessons page. Put data hooks in a
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
