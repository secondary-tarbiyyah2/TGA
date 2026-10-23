"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { AREA_SUBTITLE, MOBILE_TABS, isSidebarItemActive, sidebarLayout, tileFor, withoutPages, type PortalArea, type SidebarGroup, type SidebarItem } from "@/lib/learn/nav";
import { Icon } from "@/components/learn/Icon";
import { NavBadge, useNavBadges, type NavBadges } from "@/lib/learn/navBadges";

const AREA_NAMES: Record<string, string> = {
  "/admin/dashboard": "School administration",
  "/teach/dashboard": "Teacher portal",
  "/family/dashboard": "Parent portal",
  "/student/dashboard": "Student portal",
};

function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const OPEN_KEY = (area: PortalArea) => `tga-nav-open:${area}`;

/** Which sections are open. Remembered per browser and per area; the
 * section holding the current page always opens when you arrive on it. */
function useOpenSections(area: PortalArea, sections: SidebarGroup[], pathname: string) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const activeLabel = sections.find((s) => s.items.some((i) => isSidebarItemActive(pathname, i)))?.label;

  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(window.localStorage.getItem(OPEN_KEY(area)) || "[]");
    } catch {
      /* storage unavailable or corrupt: start closed */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved preference after mount
    setOpen(new Set(Array.isArray(saved) ? saved : []));
  }, [area]);

  useEffect(() => {
    if (!activeLabel) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the current page's section on navigation
    setOpen((prev) => (prev.has(activeLabel) ? prev : new Set(prev).add(activeLabel)));
  }, [activeLabel]);

  const persist = (next: Set<string>) => {
    try {
      window.localStorage.setItem(OPEN_KEY(area), JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
    return next;
  };
  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return persist(next);
    });
  const ensureOpen = (label: string) => setOpen((prev) => (prev.has(label) ? prev : persist(new Set(prev).add(label))));

  return { open, toggle, ensureOpen, activeLabel };
}

function NavLink({ item, active, collapsed, onNavigate, count }: { item: SidebarItem; active: boolean; collapsed: boolean; onNavigate?: () => void; count?: number }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? (count ? `${item.label} (${count} waiting)` : item.label) : undefined}
      className={`portal-nav-row relative ${collapsed ? "justify-center" : ""} ${active ? "portal-nav-row--active" : ""}`}
    >
      <span className={`portal-tile ${tileFor(item.icon)}`} aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && <NavBadge count={count} alert={item.badge !== "messages"} />}
      {collapsed && !!count && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-700" />}
    </Link>
  );
}

function NavSection({
  section,
  isOpen,
  hasActive,
  collapsed,
  pathname,
  onToggle,
  onExpandTo,
  onNavigate,
  badges,
}: {
  section: SidebarGroup;
  isOpen: boolean;
  hasActive: boolean;
  collapsed: boolean;
  pathname: string;
  onToggle: () => void;
  onExpandTo?: () => void;
  onNavigate?: () => void;
  badges: NavBadges;
}) {
  const panelId = useId();
  if (collapsed) {
    // Icon rail: the section's icon opens the full sidebar with this section open.
    return (
      <button
        type="button"
        onClick={onExpandTo}
        title={section.label}
        aria-label={`${section.label} (open sidebar)`}
        className={`portal-nav-row justify-center ${hasActive ? "portal-nav-row--active" : ""}`}
      >
        <span className={`portal-tile ${tileFor(section.icon)}`} aria-hidden="true">
          <Icon name={section.icon} />
        </span>
      </button>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`portal-nav-row w-full ${hasActive && !isOpen ? "portal-nav-row--active" : ""} ${hasActive ? "text-teal-900" : ""}`}
      >
        <span className={`portal-tile ${tileFor(section.icon)}`} aria-hidden="true">
          <Icon name={section.icon} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-ink/65 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} className="portal-nav-panel" data-open={isOpen || undefined} inert={!isOpen || undefined}>
        <ul className="min-h-0 overflow-hidden">
          {section.items.map((i) => {
            const active = isSidebarItemActive(pathname, i);
            return (
              <li key={i.href}>
                <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`portal-nav-sub flex items-center gap-2 ${active ? "portal-nav-sub--active" : ""}`}>
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  <NavBadge count={i.badge ? badges[i.badge] : undefined} alert={i.badge !== "messages"} />
                </Link>
              </li>
            );
          })}
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
  hidePages = [],
}: {
  area: PortalArea;
  session: Session;
  roles: RoleGrant[];
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
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
  const firstSection = entries.findIndex((e) => e.kind === "section" || !!e.item.group);
  const sections = entries.flatMap((e) => (e.kind === "section" ? [e.section] : []));
  const { open, toggle, ensureOpen, activeLabel } = useOpenSections(area, sections, pathname);
  const badges = useNavBadges(area);
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))];
  const roleLabel = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(" · ");
  const displayName = fullName || session.user.email || "Your account";

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

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-[68px] shrink-0 items-center ${collapsed ? "justify-center px-2" : "justify-between gap-2 pl-5 pr-3"}`}>
        {collapsed ? (
          <button type="button" onClick={onToggle} title="Open sidebar" aria-label="Open sidebar" className="portal-icon-btn">
            <Icon name="panelLeftOpen" className="h-5 w-5" />
          </button>
        ) : (
          <>
            <Link href={areas.find((a) => a.startsWith(`/${area}/`)) || areas[0] || "/"} onClick={onNavigate} className="min-w-0">
              <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={128} height={39} priority />
            </Link>
            {onToggle && (
              <button type="button" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar" className="portal-icon-btn">
                <Icon name="panelLeftClose" className="h-5 w-5" />
              </button>
            )}
          </>
        )}
      </div>

      <div className={collapsed ? "px-2 pb-1" : "px-3 pb-1"}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("tga:open-search"))}
          title="Search pupils, pages and classes (Ctrl K)"
          aria-label="Search pupils, pages and classes"
          className={collapsed ? "portal-nav-row w-full justify-center" : "flex w-full items-center gap-2 rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink/60 hover:border-teal-700 hover:text-ink"}
        >
          <Icon name="search" className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Search…</span>}
          {!collapsed && <kbd className="rounded border border-gold-light bg-cream px-1.5 py-0.5 text-[10px] font-medium text-ink/60">Ctrl K</kbd>}
        </button>
      </div>
      <nav aria-label={AREA_SUBTITLE[area]} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 ${collapsed ? "px-2" : "px-3"}`}>
        {!collapsed && <p className="portal-nav-label">{AREA_SUBTITLE[area]}</p>}
        <ul className="space-y-0.5">
          {entries.map((e, idx) => (
            <li key={e.kind === "link" ? e.item.href : e.section.label}>
              {idx === firstSection && idx > 0 && <div role="presentation" className={`my-2 border-t border-gold-light ${collapsed ? "mx-1" : "mx-2"}`} />}
              {e.kind === "link" ? (
                <NavLink item={e.item} active={isSidebarItemActive(pathname, e.item)} collapsed={collapsed} onNavigate={onNavigate} count={e.item.badge ? badges[e.item.badge] : undefined} />
              ) : (
                <NavSection
                  badges={badges}
                  section={e.section}
                  isOpen={open.has(e.section.label)}
                  hasActive={e.section.label === activeLabel}
                  collapsed={collapsed}
                  pathname={pathname}
                  onToggle={() => toggle(e.section.label)}
                  onExpandTo={() => {
                    ensureOpen(e.section.label);
                    onToggle?.();
                  }}
                  onNavigate={onNavigate}
                />
              )}
            </li>
          ))}
        </ul>

        {areas.length > 1 && !collapsed && (
          <div className="mt-4 border-t border-gold-light pt-3">
            <p className="portal-nav-label">Switch portal</p>
            {areas.map((href) => (
              <Link key={href} href={href} onClick={onNavigate} aria-current={href.startsWith(`/${area}/`) ? "true" : undefined} className={`portal-nav-sub !ml-0 ${href.startsWith(`/${area}/`) ? "portal-nav-sub--active" : ""}`}>
                {AREA_NAMES[href] || href}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className={`shrink-0 border-t border-gold-light ${collapsed ? "flex flex-col items-center gap-1.5 px-2 py-3" : "p-3"}`}>
        {collapsed ? (
          <>
            <Link href="/account" onClick={onNavigate} title={`${displayName} · ${roleLabel}`} aria-label="Your account" className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900 hover:bg-teal-500 hover:text-white">
              {initialsOf(displayName)}
            </Link>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="portal-icon-btn hover:!bg-red-50 hover:!text-red-700">
              <Icon name="logOut" className="h-5 w-5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <Link href="/account" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 hover:bg-cream">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white" aria-hidden="true">
                {initialsOf(displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{fullName || session.user.email || "Your account"}</span>
                <span className="block truncate text-xs text-ink/65">{roleLabel}</span>
              </span>
            </Link>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="portal-icon-btn shrink-0 hover:!bg-red-50 hover:!text-red-700">
              <Icon name="logOut" className="h-5 w-5" />
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
    <aside className={`portal-sidebar fixed inset-y-0 left-0 z-30 hidden bg-white transition-[width] duration-200 ease-out lg:block ${props.collapsed ? "w-[76px]" : "w-[272px]"}`}>
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
  // its "More" button opens this drawer with the tab-bar pages left out.
  return (
    <div className="lg:hidden">
      {open &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="More">
            <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[85%] max-w-[300px] bg-white shadow-xl">
              <SidebarBody {...props} hidePages={MOBILE_TABS[props.area]} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
