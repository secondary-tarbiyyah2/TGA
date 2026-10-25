"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_TABS, isSidebarItemActive, itemHasHref, tileFor, visibleSidebar, type PortalArea, type SidebarItem } from "@/lib/learn/nav";
import { useNavBadges } from "@/lib/learn/navBadges";
import { Icon } from "@/components/learn/Icon";

// The four places each kind of user goes most, one tap away at the bottom
// of the screen on phones and small tablets (MOBILE_TABS in nav.ts).
// Everything else is under "More", which leaves these four out.
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
  "Action centre": "Actions",
};

export const OPEN_MENU_EVENT = "tga-open-menu";

export function MobileTabBar({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname();
  const badges = useNavBadges(area);
  const visible = visibleSidebar(area, roles);
  const items = MOBILE_TABS[area]
    .map((href) => visible.find((i) => itemHasHref(i, href)))
    .filter((i): i is SidebarItem => !!i)
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <nav aria-label="Quick links" className="portal-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-gold-light bg-white/95 backdrop-blur lg:hidden print:hidden">
      <ul className="mx-auto flex max-w-xl">
        {items.map((i) => {
          const active = isSidebarItemActive(pathname, i);
          return (
            <li key={i.id || i.href} className="flex-1">
              <Link href={i.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] font-medium ${active ? "text-teal-700" : "text-ink/65"}`}>
                <span className={`portal-tile relative !h-7 !w-12 !rounded-full ${active ? tileFor(i.icon) : ""}`} style={active ? undefined : { background: "transparent", color: "inherit" }}>
                  <Icon name={i.icon} className="h-5 w-5" />
                  {!!(i.badge && badges[i.badge]) && <span aria-hidden="true" className="absolute right-2 top-0 h-2 w-2 rounded-full bg-red-700" />}
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
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
