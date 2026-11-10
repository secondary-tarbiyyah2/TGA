"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isSidebarItemActive, mobileTabsFor, tileFor, type PortalArea } from "@/lib/learn/nav";
import { useNavBadges } from "@/lib/learn/navBadges";
import { Icon } from "@/components/learn/Icon";

// The four places each kind of user goes most, one tap away at the bottom
// of the screen on phones and small tablets (MOBILE_TABS in nav.ts, cut to
// what this user can open), then "Menu", which opens the full menu with the
// same categories as the desktop sidebar. Labels are one short word
// (each page's `short` name in nav.ts) so they never wrap.

export const OPEN_MENU_EVENT = "tga-open-menu";

const cell = "flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2 text-[11px] font-medium leading-none";

export function MobileTabBar({ area, roles }: { area: PortalArea; roles: string[] }) {
  const pathname = usePathname() || "";
  const badges = useNavBadges(area);
  const items = mobileTabsFor(area, roles);
  if (!items.length) return null;
  return (
    <nav aria-label="Quick links" data-tour="tabbar" className="portal-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-gold-light bg-white/95 backdrop-blur lg:hidden print:hidden">
      <ul className="mx-auto flex max-w-xl">
        {items.map((i) => {
          const active = isSidebarItemActive(pathname, i);
          const count = i.badge ? badges[i.badge] : undefined;
          return (
            <li key={i.id || i.href} className="min-w-0 flex-1">
              <Link href={i.href} aria-current={active ? "page" : undefined} aria-label={count ? `${i.label} (${count} waiting)` : undefined} className={`${cell} ${active ? "text-teal-900" : "text-ink/65"}`}>
                <span className={`portal-tabbar-pill relative ${active ? `portal-tabbar-pill--on ${tileFor(i.icon)}` : ""}`}>
                  <Icon name={i.icon} />
                  {!!count && <span aria-hidden="true" className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-red-700 ring-2 ring-white" />}
                </span>
                <span className="max-w-full truncate">{i.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button type="button" data-tour="menu-button" onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))} aria-haspopup="dialog" className={`${cell} text-ink/65`}>
            <span className="portal-tabbar-pill">
              <Icon name="menu" />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
