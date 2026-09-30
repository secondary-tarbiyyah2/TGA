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
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/admin/dashboard", label: "Dashboard" }],
  },
  {
    label: "Admissions & people",
    items: [
      { href: "/admin/admissions", label: "Admissions" },
      { href: "/admin/people", label: "People" },
    ],
  },
  {
    label: "Teaching",
    items: [
      { href: "/admin/academic", label: "Academic" },
      { href: "/admin/lessons", label: "Lessons" },
      { href: "/admin/attendance", label: "Attendance" },
    ],
  },
  {
    label: "Communication & reports",
    items: [
      { href: "/admin/messages", label: "Messages" },
      { href: "/admin/reports", label: "Reports" },
    ],
  },
  {
    label: "Finance & content",
    items: [
      { href: "/admin/fees", label: "Fees" },
      { href: "/admin/content", label: "Website content" },
      { href: "/admin/quiz", label: "Quiz & sample weeks" },
      { href: "/admin/documents", label: "Documents" },
    ],
  },
  {
    label: "Compliance & settings",
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
                {group.label}
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
