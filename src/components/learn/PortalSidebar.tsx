"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { ADMIN_INDEX_HREF, AREA_SUBTITLE, isGroupedArea, isSidebarItemActive, normalisePortalPath, sidebarLayout, visiblePages, visibleSidebar, type PortalArea, type SidebarGroup, type SidebarItem } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";
import { ActionsMenu, type MenuAction } from "@/components/learn/kit";
import { InstallAppLink } from "@/components/learn/InstallApp";
import { useNavBadges, type NavBadges } from "@/lib/learn/navBadges";
import { setCategoryOpen, togglePin, usePortalPrefs, type PortalPrefs } from "@/lib/learn/portalPrefs";
import { startTour } from "@/lib/learn/tours";

const AREA_NAMES: Record<string, string> = {
  "/admin/dashboard": "School administration",
  "/teach/dashboard": "Teacher portal",
  "/family/dashboard": "Parent portal",
  "/student/dashboard": "Student portal",
};

const TITLE_RE = /^(ustadh|ustadha|ustaadh|ustaadha|shaykh|sheikh|shaykha|mr|mrs|ms|miss|dr|br|sr|brother|sister|imam|hafiz|hafidh|hafiza|maulana|mufti|qari|qariah|sayyid|sayyida)\.?$/i;
function initialsOf(name: string): string {
  const parts = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  while (parts.length > 1 && TITLE_RE.test(parts[0])) parts.shift();
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Unread messages and work to mark are quiet counts; things missing or overdue are red. */
const isAlertBadge = (i: SidebarItem) => i.badge !== "messages" && i.badge !== "review";

function NavCount({ count, alert }: { count: number | undefined; alert: boolean }) {
  if (!count) return null;
  return (
    <span aria-label={`${count} waiting`} className={`portal-nav-count ${alert ? "portal-nav-count--alert" : ""}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

const catKey = (area: PortalArea, label: string) => `${area}:${label}`;

/** Which categories are open. Each starts closed, apart from the one holding
 * the page you are on; opening or closing one is remembered for this person
 * (portal_prefs, so it follows them to another device). */
function useOpenCategories(area: PortalArea, sections: SidebarGroup[], pathname: string, prefs: PortalPrefs) {
  const activeLabel = sections.find((s) => s.items.some((i) => isSidebarItemActive(pathname, i)))?.label;
  // The current page's category can still be folded away for this visit.
  const [foldedHere, setFoldedHere] = useState<string | null>(null);
  const isOpen = (label: string) => prefs.open.includes(catKey(area, label)) || (label === activeLabel && foldedHere !== label);
  const toggle = (label: string) => {
    const open = isOpen(label);
    if (label === activeLabel) setFoldedHere(open ? label : null);
    setCategoryOpen(catKey(area, label), !open);
  };
  return { isOpen, toggle };
}

/** A pin button beside a staff page: pins it to the top of the menu. Shows on
 * hover or keyboard focus (always on touch screens). */
function PinButton({ item, pinned }: { item: SidebarItem; pinned: boolean }) {
  return (
    <button
      type="button"
      onClick={() => togglePin(item.href)}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label} to the top of the menu`}
      title={pinned ? "Unpin" : "Pin to the top"}
      className={`portal-nav-pin ${pinned ? "portal-nav-pin--on" : ""}`}
    >
      <Icon name={pinned ? "pinOff" : "pin"} className="h-3.5 w-3.5" />
    </button>
  );
}

/** A top-level page: icon and name. */
function NavLink({ item, active, onNavigate, count, pin }: { item: SidebarItem; active: boolean; onNavigate?: () => void; count?: number; pin?: { pinned: boolean } }) {
  const link = (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={item.hint} className={`portal-nav-row ${active ? "portal-nav-row--active" : ""} ${pin ? "!pr-9" : ""}`}>
      <span className="portal-nav-icon" aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <NavCount count={count} alert={isAlertBadge(item)} />
    </Link>
  );
  if (!pin) return link;
  return (
    <div className="portal-nav-item relative">
      {link}
      <PinButton item={item} pinned={pin.pinned} />
    </div>
  );
}

/** The collapsed rail: one icon per page or category, its name in a tooltip. */
function RailLink({ item, active, onNavigate, count }: { item: SidebarItem; active: boolean; onNavigate?: () => void; count?: number }) {
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} data-tip={count ? `${item.label} (${count})` : item.label} aria-label={count ? `${item.label} (${count} waiting)` : item.label} className="portal-rail-btn">
      <Icon name={item.icon} />
      {!!count && <span aria-hidden="true" className="portal-rail-dot" />}
    </Link>
  );
}

/** A page inside a category: a text row under the category's heading. */
function NavLeaf({ item, active, onNavigate, count, pinned }: { item: SidebarItem; active: boolean; onNavigate?: () => void; count?: number; pinned: boolean }) {
  return (
    <div className="portal-nav-item relative">
      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={item.hint} className={`portal-nav-leaf !pr-9 ${active ? "portal-nav-leaf--active" : ""}`}>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <NavCount count={count} alert={isAlertBadge(item)} />
      </Link>
      <PinButton item={item} pinned={pinned} />
    </div>
  );
}

/** A category: a heading that opens and closes like a dropdown, with its pages
 * underneath. A closed category still shows a dot when something inside it is waiting. */
function NavSection({ section, isOpen, onToggle, pathname, onNavigate, badges, pinned }: { section: SidebarGroup; isOpen: boolean; onToggle: () => void; pathname: string; onNavigate?: () => void; badges: NavBadges; pinned: string[] }) {
  const panelId = useId();
  const waiting = section.items.reduce((n, i) => n + ((i.badge && badges[i.badge]) || 0), 0);
  const holdsActive = section.items.some((i) => isSidebarItemActive(pathname, i));
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} aria-controls={panelId} data-tour-cat={section.label} className={`portal-nav-cat ${holdsActive ? "portal-nav-cat--here" : ""}`}>
        <span className="portal-nav-icon" aria-hidden="true">
          <Icon name={section.icon} />
        </span>
        <span className="min-w-0 flex-1 text-left">{section.label}</span>
        {!isOpen && !!waiting && <span aria-label={`${waiting} waiting`} className="portal-nav-dot" />}
        <Icon name="chevronRight" className={`portal-nav-chevron ${isOpen ? "rotate-90" : ""}`} />
      </button>
      <div id={panelId} className="portal-nav-panel" data-open={isOpen || undefined} inert={!isOpen || undefined}>
        <ul className="portal-nav-tree min-h-0 overflow-hidden">
          {section.items.map((i) => (
            <li key={i.href}>
              <NavLeaf item={i} active={isSidebarItemActive(pathname, i)} onNavigate={onNavigate} count={i.badge ? badges[i.badge] : undefined} pinned={pinned.includes(i.href)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Tooltips for the collapsed rail: one floating label, placed beside whichever icon is
 * pointed at or focused (the rail scrolls, so a CSS tooltip inside it would be clipped). */
function RailTips({ root }: { root: React.RefObject<HTMLElement | null> }) {
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const show = (e: Event) => {
      const t = (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!t || !el.contains(t)) return setTip(null);
      const r = t.getBoundingClientRect();
      setTip({ text: t.dataset.tip || "", top: r.top + r.height / 2, left: r.right + 10 });
    };
    const hide = () => setTip(null);
    el.addEventListener("pointerover", show);
    el.addEventListener("focusin", show);
    el.addEventListener("pointerleave", hide);
    el.addEventListener("focusout", hide);
    el.addEventListener("scroll", hide, true);
    return () => {
      el.removeEventListener("pointerover", show);
      el.removeEventListener("focusin", show);
      el.removeEventListener("pointerleave", hide);
      el.removeEventListener("focusout", hide);
      el.removeEventListener("scroll", hide, true);
    };
  }, [root]);
  if (!tip || typeof document === "undefined") return null;
  return createPortal(
    <div role="presentation" aria-hidden="true" className="portal-tip" style={{ top: tip.top, left: tip.left, transform: "translateY(-50%)" }}>
      {tip.text}
    </div>,
    document.body,
  );
}

/** Everything inside the sidebar; shared by the desktop rail and the
 * phone drawer, which show the same categories. */
function SidebarBody({
  area,
  session,
  roles,
  onNavigate,
  collapsed = false,
  onToggle,
  onClose,
}: {
  area: PortalArea;
  session: Session;
  roles: RoleGrant[];
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  /** The phone drawer's close button. */
  onClose?: () => void;
}) {
  const pathname = usePathname() || "";
  const signOut = useLearnSignOut();
  const [fullName, setFullName] = useState<string | null>(null);
  const roleNames = roles.map((r) => r.role);
  const entries = sidebarLayout(area, roleNames);
  const sections = entries.flatMap((e) => (e.kind === "section" ? [e.section] : []));
  const grouped = isGroupedArea(area);
  const prefs = usePortalPrefs(session.user.id);
  const { isOpen, toggle } = useOpenCategories(area, sections, pathname, prefs);
  const badges = useNavBadges(area);
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))];
  const roleLabel = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(", ");
  const displayName = fullName || session.user.email || "Your account";
  const homeHref = areas.find((a) => a.startsWith(`/${area}/`)) || areas[0] || "/";
  const rootRef = useRef<HTMLDivElement>(null);

  // Pinned pages (staff): only pages this person can still open, in the order pinned.
  const pages = grouped ? visiblePages(area, roleNames) : [];
  const pinnedItems: SidebarItem[] = grouped
    ? prefs.pinned.flatMap((href) => {
        const p = pages.find((x) => x.href === href);
        return p ? [{ href: p.href, label: p.label, icon: p.icon, hint: p.hint, page: true }] : [];
      })
    : [];

  // Keep the page you are on in view in a long menu (after its category has opened).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = navRef.current?.querySelector<HTMLElement>('.portal-nav-panel[data-open] [aria-current="page"], :scope > ul [aria-current="page"]');
      el?.scrollIntoView({ block: "nearest" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFullName((data as { full_name?: string } | null)?.full_name || null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.user.id]);

  // Collapsed rail: one icon per Home page and per category (to its first page).
  const railItems = visibleSidebar(area, roleNames).map((item, idx, all) => ({ item, divider: grouped && idx > 0 && !item.page && !!all[idx - 1].page }));

  // The account menu at the foot of the sidebar: who is signed in, the account page, other
  // portals this person can open, and signing out.
  const accountItems: MenuAction[] = [
    { label: "Your account", icon: "userRound", href: "/account", hint: "Name, sign-in, notifications and display" },
    { label: "Portal guide", icon: "bookOpenCheck", href: `/guide?area=${area}`, hint: "Every page explained, A to Z" },
    ...(areas.length > 1
      ? [
          { label: "", section: "Switch portal" } as MenuAction,
          ...areas.map((href): MenuAction => ({ label: AREA_NAMES[href] || href, icon: "layoutDashboard", href, aside: href.startsWith(`/${area}/`) ? "Current" : undefined })),
        ]
      : []),
    { label: "Sign out", icon: "logOut", onSelect: () => void signOut(), danger: true },
  ];
  const accountHeader = (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
      <p className="truncate text-xs text-ink-500">{session.user.email}</p>
    </div>
  );

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <div className={`flex h-[var(--portal-topbar-h)] shrink-0 items-center ${collapsed ? "justify-center px-2" : "justify-between gap-2 pl-4 pr-2.5"}`}>
        {collapsed ? (
          <Link href={homeHref} className="flex shrink-0 items-center rounded-lg" aria-label="Tarbiyyah Global Academy: home" data-tip="Home">
            <Image src="/brand/ga-logo-square.png" alt="" width={32} height={32} priority className="h-8 w-8 max-w-none rounded-md" />
          </Link>
        ) : (
          <>
            <Link href={homeHref} onClick={onNavigate} className="flex shrink-0 items-center rounded-lg" aria-label="Tarbiyyah Global Academy: home">
              <Image src="/brand/ga-wordmark.png" alt="" width={118} height={36} priority className="h-[34px] w-[114px] max-w-none object-contain" />
            </Link>
            {onToggle && (
              <button type="button" onClick={onToggle} title="Collapse the menu" aria-label="Collapse the menu" className="portal-icon-btn">
                <Icon name="panelLeftClose" />
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close menu" className="portal-icon-btn">
                <Icon name="x" />
              </button>
            )}
          </>
        )}
      </div>

      <nav ref={navRef} aria-label={AREA_SUBTITLE[area]} data-tour="menu" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 ${collapsed ? "px-3 pt-1" : "px-3 pt-0.5"}`}>
        {collapsed ? (
          <ul className="space-y-1">
            <li>
              <button type="button" onClick={onToggle} data-tip="Expand the menu" aria-label="Expand the menu" className="portal-rail-btn">
                <Icon name="panelLeftOpen" />
              </button>
            </li>
            {railItems.map(({ item, divider }) => (
              <li key={item.id || item.href}>
                {divider && <div role="presentation" className="mx-auto my-2 w-6 border-t border-gold-light" />}
                <RailLink item={item} active={isSidebarItemActive(pathname, item)} onNavigate={onNavigate} count={item.badge ? badges[item.badge] : undefined} />
              </li>
            ))}
          </ul>
        ) : (
          <>
            {grouped && (
              <div data-tour="pinned">
                <p className="portal-nav-label !pt-2">Pinned</p>
                {pinnedItems.length > 0 ? (
                  <ul className="space-y-px">
                    {pinnedItems.map((i) => (
                      <li key={`pin:${i.href}`}>
                        <NavLink item={i} active={isSidebarItemActive(pathname, i)} onNavigate={onNavigate} pin={{ pinned: true }} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2.5 pb-1 text-xs leading-snug text-ink-500">
                    Point at a page and press <Icon name="pin" className="inline h-3 w-3 align-[-1px]" /> to keep it here.
                  </p>
                )}
              </div>
            )}
            <ul className="space-y-px">
              {grouped && (
                <li role="presentation">
                  <p className="portal-nav-label">Home</p>
                </li>
              )}
              {entries.flatMap((e) =>
                e.kind === "link"
                  ? [
                      <li key={e.item.id || e.item.href}>
                        <NavLink item={e.item} active={isSidebarItemActive(pathname, e.item)} onNavigate={onNavigate} count={e.item.badge ? badges[e.item.badge] : undefined} pin={grouped ? { pinned: prefs.pinned.includes(e.item.href) } : undefined} />
                      </li>,
                    ]
                  : [],
              )}
            </ul>
            {sections.length > 0 && (
              <div data-tour="categories">
                <p className="portal-nav-label">Categories</p>
                <ul className="space-y-px">
                  {sections.map((s) => (
                    <li key={s.label}>
                      <NavSection section={s} isOpen={isOpen(s.label)} onToggle={() => toggle(s.label)} pathname={pathname} onNavigate={onNavigate} badges={badges} pinned={prefs.pinned} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className={`mt-4 border-t border-gold-light pt-3 ${collapsed ? "space-y-1" : "space-y-px"}`}>
          {area === "admin" &&
            (collapsed ? (
              <Link href={ADMIN_INDEX_HREF} data-tip="All admin pages" aria-label="All admin pages" aria-current={normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "page" : undefined} className="portal-rail-btn">
                <Icon name="layoutGrid" />
              </Link>
            ) : (
              <Link href={ADMIN_INDEX_HREF} onClick={onNavigate} aria-current={normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "page" : undefined} className={`portal-nav-row ${normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "portal-nav-row--active" : ""}`}>
                <span className="portal-nav-icon" aria-hidden="true">
                  <Icon name="layoutGrid" />
                </span>
                <span className="min-w-0 flex-1 truncate">All admin pages</span>
              </Link>
            ))}
          {collapsed ? (
            <button type="button" data-tour="help" onClick={() => startTour()} data-tip="Take the tour" aria-label="Take the tour" className="portal-rail-btn">
              <Icon name="compass" />
            </button>
          ) : (
            <button type="button" data-tour="help" onClick={() => startTour()} className="portal-nav-row text-left">
              <span className="portal-nav-icon" aria-hidden="true">
                <Icon name="compass" />
              </span>
              <span className="min-w-0 flex-1 truncate">Take the tour</span>
            </button>
          )}
          {collapsed ? (
            <Link href={`/guide?area=${area}`} data-tip="Portal guide" aria-label="Portal guide" aria-current={normalisePortalPath(pathname) === "/guide" ? "page" : undefined} className="portal-rail-btn">
              <Icon name="bookOpenCheck" />
            </Link>
          ) : (
            <Link href={`/guide?area=${area}`} onClick={onNavigate} data-tour="guide-home" aria-current={normalisePortalPath(pathname) === "/guide" ? "page" : undefined} className={`portal-nav-row ${normalisePortalPath(pathname) === "/guide" ? "portal-nav-row--active" : ""}`}>
              <span className="portal-nav-icon" aria-hidden="true">
                <Icon name="bookOpenCheck" />
              </span>
              <span className="min-w-0 flex-1 truncate">Portal guide</span>
            </Link>
          )}
          <InstallAppLink onNavigate={onNavigate} compact={collapsed} />
        </div>
      </nav>

      <div className={`shrink-0 border-t border-gold-light ${collapsed ? "flex justify-center px-2 py-2.5" : "px-2.5 py-2"}`}>
        <ActionsMenu
          items={accountItems}
          label="Your account"
          placement="above"
          align="left"
          header={accountHeader}
          menuClassName="w-[15.5rem]"
          triggerClassName={collapsed ? "portal-profile !w-auto justify-center !p-1" : "portal-profile"}
          triggerContent={
            collapsed ? (
              <span className="portal-avatar" aria-hidden="true" data-tip={`${displayName}, ${roleLabel}`}>
                {initialsOf(displayName)}
              </span>
            ) : (
              <>
                <span className="portal-avatar" aria-hidden="true">
                  {initialsOf(displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-semibold leading-tight text-ink">{displayName}</span>
                  <span className="block truncate text-xs leading-tight text-ink-500">{roleLabel}</span>
                </span>
                <Icon name="chevronsUpDown" className="h-4 w-4 shrink-0 text-ink-500" />
              </>
            )
          }
        />
      </div>
      {collapsed && <RailTips root={rootRef} />}
    </div>
  );
}

/** Desktop: a rail down the left, full height, sticky, with its own scroll. */
export function PortalSidebar(props: { area: PortalArea; session: Session; roles: RoleGrant[]; collapsed: boolean; onToggle: () => void }) {
  return (
    // The aside runs the full height of the page (so its stone background never stops short);
    // the menu inside is sticky at the height of the window and scrolls on its own.
    <aside className={`portal-sidebar relative z-30 hidden shrink-0 transition-[width] duration-200 ease-[var(--portal-ease)] motion-reduce:transition-none lg:block ${props.collapsed ? "w-[var(--portal-rail-w)]" : "w-[var(--portal-sidebar-w)]"}`}>
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        <SidebarBody {...props} />
      </div>
    </aside>
  );
}

/** Mobile/tablet: the same sidebar, with the same categories, in a slide-over drawer. */
export function PortalSidebarDrawer(props: { area: PortalArea; session: Session; roles: RoleGrant[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close on navigation
    setOpen(false);
  }, [pathname]);

  // The phone tab bar's "Menu" button opens this drawer.
  useEffect(() => {
    const openMenu = () => setOpen(true);
    const closeMenu = () => setOpen(false);
    window.addEventListener("tga-open-menu", openMenu);
    window.addEventListener("tga-close-menu", closeMenu);
    return () => {
      window.removeEventListener("tga-open-menu", openMenu);
      window.removeEventListener("tga-close-menu", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    // Stop the page behind the drawer scrolling with it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // No menu button of its own: on phones the tab bar is the navigation, and
  // its "Menu" button opens this drawer.
  return (
    <div className="lg:hidden">
      {open &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close" className="portal-scrim absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <div className="portal-drawer portal-sidebar absolute inset-y-0 left-0 w-[86%] max-w-[320px] shadow-xl">
              <SidebarBody {...props} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
