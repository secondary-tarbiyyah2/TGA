"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { ADMIN_INDEX_HREF, AREA_SUBTITLE, isSidebarItemActive, mobileTabsFor, normalisePortalPath, sidebarLayout, tileFor, withoutPages, type PortalArea, type SidebarGroup, type SidebarItem } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";
import { InstallAppLink } from "@/components/learn/InstallApp";
import { NavBadge, useNavBadges, type NavBadges } from "@/lib/learn/navBadges";

const AREA_NAMES: Record<string, string> = {
  "/admin/dashboard": "School administration",
  "/teach/dashboard": "Teacher portal",
  "/family/dashboard": "Parent portal",
  "/student/dashboard": "Student portal",
};

const TITLE_RE = /^(ustadh|ustadha|ustaadh|ustaadha|shaykh|sheikh|shaykha|mr|mrs|ms|miss|dr|br|sr|brother|sister|imam|hafiz|hafidh|hafiza|maulana|mufti|qari|qariah|sayyid|sayyida)\.?$/i;
function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  while (parts.length > 1 && TITLE_RE.test(parts[0])) parts.shift();
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Unread messages and work to mark are blue counts; things overdue are red. */
const isAlertBadge = (i: SidebarItem) => i.badge !== "messages" && i.badge !== "review";

const CLOSED_KEY = (area: PortalArea) => `tga-nav-closed:${area}`;

/** Which groups are folded away. Every group starts open (a dozen links fit
 * on any laptop); folding one is remembered per browser and per area, and the
 * group holding the current page is always shown open. */
function useClosedSections(area: PortalArea, sections: SidebarGroup[], pathname: string) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const activeLabel = sections.find((s) => s.items.some((i) => isSidebarItemActive(pathname, i)))?.label;

  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(window.localStorage.getItem(CLOSED_KEY(area)) || "[]");
    } catch {
      /* storage unavailable or corrupt: everything open */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved preference after mount
    setClosed(new Set(Array.isArray(saved) ? saved : []));
  }, [area]);

  const toggle = (label: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        window.localStorage.setItem(CLOSED_KEY(area), JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const isOpen = (label: string) => label === activeLabel || !closed.has(label);
  return { isOpen, toggle, activeLabel };
}

function NavLink({ item, active, collapsed, onNavigate, count }: { item: SidebarItem; active: boolean; collapsed: boolean; onNavigate?: () => void; count?: number }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? (count ? `${item.label} (${count} waiting)` : item.label) : undefined}
      className={`portal-nav-row relative ${collapsed ? "justify-center !px-0" : ""} ${active ? "portal-nav-row--active" : ""}`}
    >
      <span className={`portal-tile ${tileFor(item.icon)}`} aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && <NavBadge count={count} alert={isAlertBadge(item)} />}
      {collapsed && !!count && <span aria-hidden="true" className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red-700 ring-2 ring-white" />}
    </Link>
  );
}

/** A headed group of links. The heading folds the group away; a folded group
 * still shows a dot when something inside it is waiting. */
function NavSection({ section, isOpen, onToggle, pathname, onNavigate, badges }: { section: SidebarGroup; isOpen: boolean; onToggle: () => void; pathname: string; onNavigate?: () => void; badges: NavBadges }) {
  const panelId = useId();
  const waiting = section.items.reduce((n, i) => n + ((i.badge && badges[i.badge]) || 0), 0);
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} aria-controls={panelId} className="portal-nav-group">
        <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
        {!isOpen && !!waiting && <span aria-label={`${waiting} waiting`} className="h-2 w-2 shrink-0 rounded-full bg-red-700" />}
        <Icon name="chevronDown" className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
      </button>
      <div id={panelId} className="portal-nav-panel" data-open={isOpen || undefined} inert={!isOpen || undefined}>
        <ul className="min-h-0 space-y-0.5 overflow-hidden">
          {section.items.map((i) => (
            <li key={i.id || i.href}>
              <NavLink item={i} active={isSidebarItemActive(pathname, i)} collapsed={false} onNavigate={onNavigate} count={i.badge ? badges[i.badge] : undefined} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Everything inside the sidebar; shared by the desktop rail and the
 * mobile drawer. */
function SidebarBody({
  area,
  session,
  roles,
  onNavigate,
  collapsed = false,
  onToggle,
  onClose,
  hidePages = [],
}: {
  area: PortalArea;
  session: Session;
  roles: RoleGrant[];
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  /** The phone drawer's close button. */
  onClose?: () => void;
  /** Pages to leave out: the phone menu hides the ones already in the tab bar. */
  hidePages?: string[];
}) {
  const pathname = usePathname();
  const signOut = useLearnSignOut();
  const [fullName, setFullName] = useState<string | null>(null);
  const entries = withoutPages(
    sidebarLayout(
      area,
      roles.map((r) => r.role),
    ),
    hidePages,
  );
  const sections = entries.flatMap((e) => (e.kind === "section" ? [e.section] : []));
  const { isOpen, toggle } = useClosedSections(area, sections, pathname);
  const badges = useNavBadges(area);
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))];
  const roleLabel = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(", ");
  const displayName = fullName || session.user.email || "Your account";
  const homeHref = areas.find((a) => a.startsWith(`/${area}/`)) || areas[0] || "/";

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

  // Collapsed rail: every destination as an icon, with a hairline between groups.
  const railItems = entries.flatMap((e, idx) => (e.kind === "link" ? [{ item: e.item, divider: false }] : e.section.items.map((item, j) => ({ item, divider: j === 0 && idx > 0 }))));

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

      <nav aria-label={AREA_SUBTITLE[area]} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pt-2 ${collapsed ? "px-2" : "px-3"}`}>
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
          <ul className="space-y-0.5">
            {entries.map((e) => (
              <li key={e.kind === "link" ? e.item.id || e.item.href : e.section.label} className={e.kind === "section" ? "pt-3" : undefined}>
                {e.kind === "link" ? (
                  <NavLink item={e.item} active={isSidebarItemActive(pathname, e.item)} collapsed={false} onNavigate={onNavigate} count={e.item.badge ? badges[e.item.badge] : undefined} />
                ) : (
                  <NavSection section={e.section} isOpen={isOpen(e.section.label)} onToggle={() => toggle(e.section.label)} pathname={pathname} onNavigate={onNavigate} badges={badges} />
                )}
              </li>
            ))}
          </ul>
        )}

        {!collapsed && (
          <div className="mt-4 space-y-0.5 border-t border-gold-light pt-3">
            {area === "admin" && (
              <Link href={ADMIN_INDEX_HREF} onClick={onNavigate} aria-current={pathname && normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "page" : undefined} className={`portal-nav-row ${pathname && normalisePortalPath(pathname) === ADMIN_INDEX_HREF ? "portal-nav-row--active" : ""}`}>
                <span className="portal-tile tile-slate" aria-hidden="true">
                  <Icon name="layoutGrid" />
                </span>
                <span className="min-w-0 flex-1 truncate">All admin pages</span>
              </Link>
            )}
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
    <aside className={`portal-sidebar fixed inset-y-0 left-0 z-30 hidden bg-white transition-[width] duration-200 ease-out lg:block ${props.collapsed ? "w-[76px]" : "w-[264px]"}`}>
      <SidebarBody {...props} />
    </aside>
  );
}

/** Mobile/tablet: the same sidebar in a slide-over drawer. */
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
    window.addEventListener("tga-open-menu", openMenu);
    return () => window.removeEventListener("tga-open-menu", openMenu);
  }, []);

  // Focus management for the drawer dialog: focus moves into it on open,
  // Tab cycles inside it, and focus returns to whatever opened it on close.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])') || []).filter(
        (el) => !el.closest("[inert]"),
      );
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusable();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind the drawer scrolling with it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const el = returnFocus.current;
      if (el && document.contains(el)) window.setTimeout(() => el.focus(), 0);
    };
  }, [open]);

  // No menu button of its own: on phones the tab bar is the navigation, and
  // its "Menu" button opens this drawer with the tab-bar pages left out.
  return (
    <div className="lg:hidden">
      {open &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <div ref={drawerRef} className="portal-drawer absolute inset-y-0 left-0 w-[86%] max-w-[320px] bg-white shadow-xl">
              <SidebarBody {...props} hidePages={mobileTabsFor(props.area, props.roles.map((r) => r.role)).map((i) => i.href)} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
