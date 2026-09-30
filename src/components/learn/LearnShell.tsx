"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };
type Role = "teach" | "family" | "student";

// Every teach/family/student page previously stood completely alone
// (<LearnGate><PageContent/></LearnGate>, no shell) — land on /teach/reports
// directly (bookmark, refresh, a link from an email) and there was no way
// to reach a sibling page or back to the dashboard except the browser back
// button. AdminShell solved exactly this for /admin; this is the same fix
// for the other three roles. A horizontal tab bar rather than AdminShell's
// sidebar deliberately — each role has at most 5 destinations, not enough
// to need grouping or a collapsible sidebar, and a tab bar costs far less
// vertical space on what are otherwise content-dense pages.
const NAV: Record<Role, NavItem[]> = {
  teach: [
    { href: "/teach/dashboard", label: "Dashboard" },
    { href: "/teach/homework", label: "Homework" },
    { href: "/teach/messages", label: "Messages" },
    { href: "/teach/reports", label: "Reports" },
    { href: "/teach/assessment", label: "Assessment" },
  ],
  family: [
    { href: "/family/dashboard", label: "Dashboard" },
    { href: "/family/homework", label: "Homework" },
    { href: "/family/messages", label: "Messages" },
    { href: "/family/reports", label: "Reports" },
  ],
  student: [
    { href: "/student/dashboard", label: "Dashboard" },
    { href: "/student/homework", label: "Homework" },
    { href: "/student/reports", label: "Reports" },
  ],
};

export function LearnShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const pathname = usePathname();
  const items = NAV[role];

  return (
    <div>
      <nav className="-mx-1 mb-6 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
