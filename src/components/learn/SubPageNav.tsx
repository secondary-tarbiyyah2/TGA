"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalisePortalPath } from "@/lib/learn/nav";

/**
 * A compact row of links between the pages of one section (e.g. the steps of
 * Academic setup, or the Timetable pages). Looks like the "switch" style of
 * <Tabs>, but each item is a real page link with aria-current.
 *
 * `exact` items (usually the section's overview) are only active on their own
 * path, not on the pages below them.
 */
export function SubPageNav({ label, items, className = "" }: { label: string; items: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const path = normalisePortalPath(usePathname() || "").replace(/\/$/, "");
  return (
    <nav aria-label={label} className={`portal-tabs mb-6 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-gold-light bg-cream p-1 print:hidden ${className}`}>
      {items.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:min-h-8 ${
              active ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
