"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReportConcernLink } from "@/components/learn/ReportConcernLink";

const NAV = [
  { href: "/learn/admin/dashboard", label: "Dashboard" },
  { href: "/learn/admin/admissions", label: "Admissions" },
  { href: "/learn/admin/people", label: "People" },
  { href: "/learn/admin/academic", label: "Academic" },
  { href: "/learn/admin/lessons", label: "Lessons" },
  { href: "/learn/admin/attendance", label: "Attendance" },
  { href: "/learn/admin/reports", label: "Reports" },
  { href: "/learn/admin/documents", label: "Documents" },
  { href: "/learn/admin/messages", label: "Messages" },
  { href: "/learn/admin/fees", label: "Fees" },
  { href: "/learn/admin/content", label: "Website content" },
  { href: "/learn/admin/quiz", label: "Quiz & sample weeks" },
  { href: "/learn/admin/compliance", label: "Compliance" },
  { href: "/learn/admin/settings", label: "Settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <nav className="space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-lg px-3 py-2 text-sm font-medium ${
              pathname === item.href ? "bg-gold-500 text-ink-900" : "text-ink/70 hover:bg-cream"
            }`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-4">
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
