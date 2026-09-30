"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";

// Horizontal top nav (Moodle/Classroom-style: Dashboard / My Modules /
// Utilities ⌄ / City Links ⌄ across the top, not a left sidebar) —
// replaces the previous left-sidebar-of-six-collapsible-sections layout,
// reported as not matching how a "proper LMS" positions its navigation:
// options living down the side, one screen-width away from the content
// they act on, rather than along the top the way Moodle/Classroom/SIMS
// all do it. A single-item group (Overview) renders as a plain link; a
// multi-item group renders as a dropdown button, so "Admissions & people"
// etc. still exist as a labelled group, just opening downward instead of
// living permanently expanded down a sidebar.
const NAV_GROUPS = [
  { label: "Dashboard", items: [{ href: "/admin/dashboard", label: "Dashboard" }] },
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

function NavGroup({ group, pathname }: { group: (typeof NAV_GROUPS)[number]; pathname: string }) {
  const groupIsActive = group.items.some((i) => i.href === pathname);

  if (group.items.length === 1) {
    const item = group.items[0];
    return (
      <Link
        href={item.href}
        aria-current={pathname === item.href ? "page" : undefined}
        className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
          pathname === item.href ? "bg-teal-100/60 text-teal-800" : "text-ink/70 hover:bg-cream"
        }`}
      >
        {group.label}
      </Link>
    );
  }

  // Native <details>/<summary> — same "no extra JS state, no click-outside
  // handler needed" reasoning as the old sidebar's collapsible sections,
  // just positioned as a dropdown (absolute panel) instead of an
  // always-expanded block.
  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden ${
          groupIsActive ? "bg-teal-100/60 text-teal-800" : "text-ink/70 hover:bg-cream"
        }`}
      >
        {group.label}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180">
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-gold-light/50 bg-white p-1.5 shadow-lg">
        {group.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              pathname === item.href ? "bg-teal-100/60 text-teal-800" : "text-ink/70 hover:bg-cream"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div>
      {/* Below md, a full horizontal nav wraps into a mess of pill buttons,
          so it collapses to the same single "go to" dropdown as before —
          one control, page content starts immediately after it. */}
      <nav className="md:hidden">
        <label className="sr-only" htmlFor="admin-nav-select">
          Go to
        </label>
        <select
          id="admin-nav-select"
          value={pathname}
          onChange={(e) => router.push(e.target.value)}
          className="w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2.5 text-sm font-medium text-ink"
        >
          {NAV_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="mt-3">
          <ReportConcernLink />
        </div>
      </nav>

      <nav className="hidden flex-wrap items-center gap-1 border-b border-gold-light/40 pb-3 md:flex">
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} group={group} pathname={pathname} />
        ))}
        <span className="ml-auto">
          <ReportConcernLink />
        </span>
        {/* Account settings and sign out live in the top bar's account menu
            (src/app/learn/layout.tsx + LearnAccountMenu.tsx) — one
            consistent place across every /learn role area. */}
      </nav>

      <div className="mt-6">{children}</div>
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
