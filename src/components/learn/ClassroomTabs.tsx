"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classroomTabsFor, normalisePortalPath } from "@/lib/learn/nav";

/** The shared "Classroom" tab strip (classes · homework · behaviour · …).
 * Rendered once per area from that area's layout; it shows itself only on
 * the classroom routes, so no page has to opt in. Routes are unchanged. */
export function ClassroomTabs() {
  const pathname = usePathname();
  const match = classroomTabsFor(pathname);
  if (!match) return null;
  const p = normalisePortalPath(pathname).replace(/\/$/, "");
  return (
    <nav aria-label="Classroom" className="print:hidden -mx-1 mt-5 overflow-x-auto border-b border-gold-light px-1">
      <ul className="flex min-w-max gap-1">
        {match.tabs.map((t) => {
          const active = p === t.href || p.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active ? "border-teal-700 text-teal-900" : "border-transparent text-ink/60 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
