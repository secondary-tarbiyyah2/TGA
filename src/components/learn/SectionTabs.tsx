"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSection, isSidebarItemActive, type PortalArea } from "@/lib/learn/nav";

/**
 * The pages inside the current sidebar section, as a tab strip along the top
 * of the page (e.g. Classroom: My classes · Lesson library · Homework · …).
 * The sidebar stays short (one row per section); this is how you move
 * between neighbouring pages without going back to a menu. Nothing
 * collapses or hides.
 */
export function SectionTabs({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname();
  const section = activeSection(area, roles, pathname);
  if (!section) return null;
  return (
    <nav aria-label={section.label} className="print:hidden pt-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink/45">{section.label}</p>
      <ul className="flex gap-1.5 overflow-x-auto pb-1">
        {section.items.map((i) => {
          const active = isSidebarItemActive(pathname, i);
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-teal-700 text-white shadow-sm" : "bg-white text-ink/70 shadow-[0_1px_2px_rgba(30,60,110,0.08)] hover:text-ink"
                }`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
