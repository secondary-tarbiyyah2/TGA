"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";

// Grouped into labeled sections rather than one flat 14-item list — reported
// as "congested... too simplistic... want better navigation" once real
// admins started using it. Each group is a <details> (native, no extra
// state/JS) so it behaves like a real app's collapsible sidebar sections
// without risking hiding something an admin needs — every group defaults
// open (the `open` attribute below), so nothing is hidden on first visit;
// collapsing a section is purely an option for one someone visits rarely.
// One icon per GROUP heading (not per item) — enough to make the sidebar
// scannable at a glance the way an icon-led admin nav should be, without
// the maintenance overhead of an icon per individual page.
function GroupIcon({ path, viewBox = "0 0 20 20" }: { path: string; viewBox?: string }) {
  return (
    <svg aria-hidden="true" viewBox={viewBox} className="h-4 w-4 shrink-0 text-gold-700">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

const NAV_GROUPS = [
  {
    label: "Overview",
    icon: "M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm8 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
    items: [{ href: "/admin/dashboard", label: "Dashboard" }],
  },
  {
    label: "Admissions & people",
    icon: "M10 9a3 3 0 100-6 3 3 0 000 6zm-6 8a6 6 0 0112 0v1H4v-1z",
    items: [
      { href: "/admin/admissions", label: "Admissions" },
      { href: "/admin/people", label: "People" },
    ],
  },
  {
    label: "Teaching",
    icon: "M3 4a1 1 0 011-1h4a2 2 0 012 2 2 2 0 012-2h4a1 1 0 011 1v11a1 1 0 01-1 1h-5a1 1 0 00-1 1 1 1 0 00-1-1H4a1 1 0 01-1-1V4z",
    items: [
      { href: "/admin/academic", label: "Academic" },
      { href: "/admin/lessons", label: "Lessons" },
      { href: "/admin/attendance", label: "Attendance" },
    ],
  },
  {
    label: "Communication & reports",
    icon: "M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 3v-3H4a2 2 0 01-2-2V5z",
    items: [
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    label: "Finance & content",
    icon: "M10 2a1 1 0 011 1v1.06a5.5 5.5 0 014.09 4.49 1 1 0 11-1.98.27A3.5 3.5 0 0011 5.6V9c1.98.36 4 1.23 4 3.4 0 2.02-1.7 3.13-4 3.46V17a1 1 0 11-2 0v-1.06c-1.98-.28-3.5-1.4-4-3.03a1 1 0 111.9-.62c.3.98 1.09 1.62 2.1 1.83V9.86c-1.9-.38-3.7-1.25-3.7-3.3C5.3 4.6 6.9 3.5 9 3.16V2a1 1 0 011-1z",
    items: [
      { href: "/admin/fees", label: "Fees" },
      { href: "/admin/content", label: "Website content" },
      { href: "/admin/quiz", label: "Quiz & sample weeks" },
      { href: "/admin/documents", label: "Documents" },
    ],
  },
  {
    label: "Compliance & settings",
    icon: "M10 1l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V4l7-3z",
    items: [
      { href: "/admin/compliance", label: "Compliance" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-8 md:grid-cols-[240px_1fr]">
      <nav className="space-y-3">
        {NAV_GROUPS.map((group) => (
            <details key={group.label} open className="group rounded-xl border border-gold-light/40 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink/50 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <GroupIcon path={group.icon} />
                  {group.label}
                </span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-ink/40 transition-transform group-open:rotate-180">
                  <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="space-y-0.5 px-1.5 pb-1.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={`block rounded-lg border-l-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? "border-gold-500 bg-cream text-ink"
                        : "border-transparent text-ink/70 hover:border-gold-light hover:bg-cream/60"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
        ))}
        <div className="pt-2">
          <ReportConcernLink />
        </div>
        {/* Account settings and sign out live in the top bar's account menu
            now (src/app/learn/layout.tsx + LearnAccountMenu.tsx) — one
            consistent place across every /learn role area, not a
            sidebar-only, easy-to-miss text button. */}
      </nav>
      <div>{children}</div>
    </div>
  );
}

export function PhasePlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink/60">
        This section is being built in a later phase. The page is real and access-controlled today — there&apos;s
        just nothing to manage here yet.
      </p>
    </div>
  );
}
