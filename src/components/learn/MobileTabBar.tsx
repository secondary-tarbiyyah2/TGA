"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_NAV, isSidebarItemActive, type PortalArea, type SidebarItem } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";

// The four places each kind of user goes most, one tap away at the bottom
// of the screen on phones and small tablets. Everything else is under
// "Menu", which opens the full sidebar.
const TABS: Record<PortalArea, string[]> = {
  student: ["/student/dashboard", "/student/classes", "/student/todo", "/student/calendar"],
  family: ["/family/dashboard", "/family/classes", "/family/todo", "/family/messages"],
  teach: ["/teach/today", "/teach/classes", "/teach/review", "/teach/messages"],
  admin: ["/admin/dashboard", "/admin/attendance", "/admin/messages", "/admin/calendar"],
};
const SHORT: Record<string, string> = {
  Home: "Home",
  "My classes": "Classes",
  Classes: "Classes",
  "To do": "To do",
  "To review": "To review",
  Calendar: "Calendar",
  Messages: "Messages",
  Today: "Today",
  Attendance: "Attendance",
};

export const OPEN_MENU_EVENT = "tga-open-menu";

export function MobileTabBar({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname();
  const isHead = roles.some((r) => r === "head_teacher" || r === "admin");
  const items = TABS[area]
    .map((href) => SIDEBAR_NAV[area].find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i && (isHead || !i.headOnly))
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <nav aria-label="Quick links" className="portal-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-gold-light bg-white/95 backdrop-blur lg:hidden print:hidden">
      <ul className="mx-auto flex max-w-xl">
        {items.map((i) => {
          const active = isSidebarItemActive(pathname, i);
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium ${active ? "text-teal-700" : "text-ink/65"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-teal-100" : ""}`}>
                  <Icon name={i.icon} className="h-5 w-5" />
                </span>
                {SHORT[i.label] || i.label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))} className="flex w-full flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium text-ink/65">
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Icon name="menu" className="h-5 w-5" />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
