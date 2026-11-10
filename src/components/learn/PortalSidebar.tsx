"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { ADMIN_INDEX_HREF, AREA_SUBTITLE, isGroupedArea, isSidebarItemActive, normalisePortalPath, sidebarLayout, tileFor, visiblePages, visibleSidebar, type PortalArea, type SidebarGroup, type SidebarItem } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";
import { InstallAppLink } from "@/components/learn/InstallApp";
import { NavBadge, useNavBadges, type NavBadges } from "@/lib/learn/navBadges";
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

/** Unread messages and work to mark are blue counts; things overdue are red. */
const isAlertBadge = (i: SidebarItem) => i.badge !== "messages" && i.badge !== "review";

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

function NavLink({ item, active, collapsed, onNavigate, count, pin }: { item: SidebarItem; active: boolean; collapsed: boolean; onNavigate?: () => void; count?: number; pin?: { pinned: boolean } }) {
  const showPin = !!pin && !collapsed;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? (count ? `${item.label} (${count} waiting)` : item.label) : undefined}
      className={`portal-nav-row relative ${collapsed ? "justify-center !px-0" : ""} ${active ? "portal-nav-row--active" : ""} ${showPin ? "!pr-9" : ""}`}
    >
      <span className={`portal-tile ${tileFor(item.icon)}`} aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && <NavBadge count={count} alert={isAlertBadge(item)} />}
      {collapsed && !!count && <span aria-hidden="true" className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red-700 ring-2 ring-white" />}
    </Link>
  );
  if (!showPin) return link;
  return (
    <div className="portal-nav-item relative">
      {link}
      <PinButton item={item} pinned={pin.pinned} />
    </div>
  );
}

/** A page inside a category: a text row under the category's heading. */
function NavLeaf({ item, active, onNavigate, count, pinned }: { item: SidebarItem; active: boolean; onNavigate?: () => void; count?: number; pinned: boolean }) {
  return (
    <div className="portal-nav-item relative">
      <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={item.hint} className={`portal-nav-leaf !pr-9 ${active ? "portal-nav-leaf--active" : ""}`}>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <NavBadge count={count} alert={isAlertBadge(item)} />
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
        <span className={`portal-tile ${tileFor(section.icon)}`} aria-hidden="true">
          <Icon name={section.icon} />
        </span>
        <span className="min-w-0 flex-1 text-left leading-snug">{section.label}</span>
        {!isOpen && !!waiting && <span aria-label={`${waiting} waiting`} className="h-2 w-2 shrink-0 rounded-full bg-red-700" />}
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
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
      el?.scrollIntoView({ block: "center" });
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

  return (
    <div className="flex h-full flex-col">
      <div className={`portal-sidebar-head flex h-[64px] shrink-0 items-center ${collapsed ? "justify-center px-2" : "justify-between gap-2 pl-5 pr-3"}`}>
        {collapsed ? (
          <Link href={homeHref} className="flex shrink-0 items-center rounded-lg" aria-label="Tarbiyyah Global Academy: home" title="Home">
            <Image src="/brand/ga-logo-square.png" alt="" width={36} height={36} priority className="h-9 w-9 max-w-none rounded-lg" />
          </Link>
        ) : (
          <>
            <Link href={homeHref} onClick={onNavigate} className="flex shrink-0 items-center rounded-lg" aria-label="Tarbiyyah Global Academy: home">
              <Image src="/brand/ga-wordmark.png" alt="" width={128} height={39} priority className="h-[38px] w-[128px] max-w-none object-contain" />
            </Link>
            {onToggle && (
              <button type="button" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar" className="portal-icon-btn">
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

      <nav ref={navRef} aria-label={AREA_SUBTITLE[area]} data-tour="menu" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-2 ${collapsed ? "px-2" : "px-3"}`}>
        {collapsed ? (
          <ul className="space-y-0.5">
            <li>
              <button type="button" onClick={onToggle} title="Expand sidebar" aria-label="Expand sidebar" className="portal-nav-row w-full justify-center !px-0 text-ink/65">
                <Icon name="panelLeftOpen" />
              </button>
            </li>
            {railItems.map(({ item, divider }) => (
              <li key={item.id || item.href}>
                {divider && <div role="presentation" className="mx-2 my-2 border-t border-gold-light" />}
                <NavLink item={item} active={isSidebarItemActive(pathname, item)} collapsed onNavigate={onNavigate} count={item.badge ? badges[item.badge] : undefined} />
              </li>
            ))}
          </ul>
        ) : (
          <>
            {grouped && (
              <div data-tour="pinned" className="mb-2">
                <p className="portal-nav-label !pt-1">Pinned</p>
                {pinnedItems.length > 0 ? (
                  <ul className="space-y-0.5">
                    {pinnedItems.map((i) => (
                      <li key={`pin:${i.href}`}>
                        <NavLink item={i} active={isSidebarItemActive(pathname, i)} collapsed={false} onNavigate={onNavigate} pin={{ pinned: true }} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 pb-1 text-xs leading-snug text-ink/60">
                    Pin the pages you use most: point at a page below and press <Icon name="pin" className="inline h-3 w-3 align-[-1px]" />.
                  </p>
                )}
              </div>
            )}
            <ul className="space-y-0.5">
              {grouped && (
                <li role="presentation">
                  <p className="portal-nav-label">Home</p>
                </li>
              )}
              {entries.flatMap((e) =>
                e.kind === "link"
                  ? [
                      <li key={e.item.id || e.item.href}>
                        <NavLink item={e.item} active={isSidebarItemActive(pathname, e.item)} collapsed={false} onNavigate={onNavigate} count={e.item.badge ? badges[e.item.badge] : undefined} pin={grouped ? { pinned: prefs.pinned.includes(e.item.href) } : undefined} />
                      </li>,
                    ]
                  : [],
              )}
            </ul>
            {sections.length > 0 && (
              <div data-tour="categories" className="mt-3">
                <p className="portal-nav-label !pt-0">Categories</p>
                <ul className="space-y-0.5">
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

        {!collapsed && (
          <div className="mt-4 space-y-0.5 border-t border-gold-light pt-3">
            {area === "admin" && (
              <Link href={ADMIN_INDEX_HREF} onClick={onNavigate} aria-current={normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "page" : undefined} className={`portal-nav-row ${normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "portal-nav-row--active" : ""}`}>
                <span className="portal-tile tile-slate" aria-hidden="true">
                  <Icon name="layoutGrid" />
                </span>
                <span className="min-w-0 flex-1 truncate">All admin pages</span>
              </Link>
            )}
            <button type="button" data-tour="help" onClick={() => startTour()} className="portal-nav-row w-full text-left">
              <span className="portal-tile tile-slate" aria-hidden="true">
                <Icon name="compass" />
              </span>
              <span className="min-w-0 flex-1 truncate">Take the tour</span>
            </button>
            <InstallAppLink onNavigate={onNavigate} />
          </div>
        )}
        {collapsed && (
          <div className="mt-4 flex flex-col items-center gap-0.5 border-t border-gold-light pt-3">
            {area === "admin" && (
              <Link href={ADMIN_INDEX_HREF} title="All admin pages" aria-label="All admin pages" className="portal-nav-row w-full justify-center !px-0">
                <span className="portal-tile tile-slate" aria-hidden="true">
                  <Icon name="layoutGrid" />
                </span>
              </Link>
            )}
            <button type="button" data-tour="help" onClick={() => startTour()} title="Take the tour" aria-label="Take the tour" className="portal-nav-row w-full justify-center !px-0">
              <span className="portal-tile tile-slate" aria-hidden="true">
                <Icon name="compass" />
              </span>
            </button>
            <InstallAppLink onNavigate={onNavigate} compact />
          </div>
        )}

        {areas.length > 1 && !collapsed && (
          <div className="mt-4 border-t border-gold-light pt-3">
            <p className="portal-nav-label">Switch portal</p>
            {areas.map((href) => {
              const here = href.startsWith(`/${area}/`);
              return (
                <Link key={href} href={href} onClick={onNavigate} aria-current={here ? "true" : undefined} className={`portal-nav-sub !ml-0 ${here ? "portal-nav-sub--active" : ""}`}>
                  {AREA_NAMES[href] || href}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className={`shrink-0 border-t border-gold-light ${collapsed ? "flex flex-col items-center gap-1.5 px-2 py-3" : "p-3"}`}>
        {collapsed ? (
          <>
            <Link href="/account" onClick={onNavigate} title={`${displayName}, ${roleLabel}`} aria-label="Your account" className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900 hover:bg-teal-700 hover:text-white">
              {initialsOf(displayName)}
            </Link>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="portal-icon-btn hover:!bg-red-50 hover:!text-red-700">
              <Icon name="logOut" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/account" onClick={onNavigate} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 hover:bg-cream">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white" aria-hidden="true">
                {initialsOf(displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{displayName}</span>
                <span className="block truncate text-xs text-ink/65">{roleLabel}</span>
              </span>
            </Link>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="portal-icon-btn shrink-0 hover:!bg-red-50 hover:!text-red-700">
              <Icon name="logOut" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Desktop: a fixed rail down the left. */
export function PortalSidebar(props: { area: PortalArea; session: Session; roles: RoleGrant[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`portal-sidebar fixed inset-y-0 left-0 z-30 hidden bg-white transition-[width] duration-200 ease-out lg:block ${props.collapsed ? "w-[76px]" : "w-[280px]"}`}>
      <SidebarBody {...props} />
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
            <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <div className="portal-drawer absolute inset-y-0 left-0 w-[86%] max-w-[320px] bg-white shadow-xl">
              <SidebarBody {...props} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
