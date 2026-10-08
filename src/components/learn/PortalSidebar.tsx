"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { AREA_SUBTITLE, isSidebarItemActive, sidebarEntries, type PortalArea, type SidebarIcon } from "@/lib/learn/nav";

// Outline icons, 20×20, drawn with stroke so they read like the rest of
// the UI (Ihsan/Lucide style).
const ICONS: Record<SidebarIcon, string> = {
  overview: "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  today: "M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4M13.5 10a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z",
  calendar: "M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5",
  classes: "M3 4.5A1.5 1.5 0 014.5 3H9v13H4.5A1.5 1.5 0 013 14.5zM17 4.5A1.5 1.5 0 0015.5 3H11v13h4.5a1.5 1.5 0 001.5-1.5z",
  admissions: "M8 9a3 3 0 100-6 3 3 0 000 6zM2.5 17a5.5 5.5 0 0111 0M15.5 6v5M13 8.5h5",
  people: "M7.5 9a3 3 0 100-6 3 3 0 000 6zM2 17a5.5 5.5 0 0111 0M13 3.2a3 3 0 010 5.6M15 12.3a5.5 5.5 0 013 4.7",
  attendance: "M5 3.5h10v14H5zM8 2.5h4v2H8zM7.5 11l2 2 3.5-4",
  lessons: "M2.5 5.5h10v9h-10zM12.5 8.5l5-3v9l-5-3",
  academic: "M10 3l8 4-8 4-8-4zM5 8.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4",
  reports: "M5.5 2.5h6l3.5 3.5v11.5h-9.5zM11.5 2.5V6H15M8 10h5M8 13h5",
  messages: "M3 4.5h14v9H8l-4 3v-3H3z",
  fees: "M13.5 4.5a3.5 3.5 0 00-6 2.5v2.5M5.5 9.5h6M6 16h8.5M7.5 9.5v2.5a4 4 0 01-1.5 4",
  documents: "M4 14.5L13 5.5l1.5 1.5-9 9H4zM12 6.5l1.5 1.5M4 17.5h12",
  compliance: "M10 2.5l6.5 2.5v4.5c0 4-2.8 7-6.5 8.5-3.7-1.5-6.5-4.5-6.5-8.5V5zM7.5 10l1.8 1.8 3.2-3.3",
  website: "M10 17.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM2.5 10h15M10 2.5c2 2 3 4.5 3 7.5s-1 5.5-3 7.5c-2-2-3-4.5-3-7.5s1-5.5 3-7.5z",
  quiz: "M10 17.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM7.8 7.5a2.3 2.3 0 014.4.8c0 1.5-2.2 2-2.2 3.2M10 14h.01",
  settings: "M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM16 10l1.5-1-1.5-3-1.8.4-1.2-.9-.5-1.8H9.5L9 5.5l-1.2.9L6 6 4.5 9 6 10l-1.5 1L6 14l1.8-.4 1.2.9.5 1.8h3l.5-1.8 1.2-.9 1.8.4 1.5-3z",
  homework: "M4 3.5h9.5l2.5 2.5v11H4zM7 8h6M7 11h6M7 14h3.5",
  clock: "M10 17.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM10 5.5V10l3 2",
  grades: "M3 16.5h14M5.5 13.5V9M10 13.5V5M14.5 13.5v-6",
  announcements: "M3 8.5v3l9 3.5V5zM12 5l5-2v14l-5-2M5 12.5l1 4h2.5l-.8-3",
  behaviour: "M10 2.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.7l5-.7z",
  absences: "M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5M8 11.5l4 3.5M12 11.5L8 15",
  summary: "M3 17V8M8 17V4M13 17v-6M18 17v-9",
};

function NavIcon({ name, active }: { name: SidebarIcon; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-teal-700 text-white shadow-sm" : "bg-[#eef3f9] text-ink/60 group-hover:bg-white"}`}
    >
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICONS[name]} />
      </svg>
    </span>
  );
}

const AREA_NAMES: Record<string, string> = {
  "/admin/dashboard": "Admin",
  "/teach/dashboard": "Teaching",
  "/family/dashboard": "Parent",
  "/student/dashboard": "Student",
};

function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Everything inside the sidebar; shared by the desktop rail and the
 * mobile drawer. */
function SidebarBody({ area, session, roles, onNavigate, collapsed = false, onToggle }: { area: PortalArea; session: Session; roles: RoleGrant[]; onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const pathname = usePathname();
  const signOut = useLearnSignOut();
  const [fullName, setFullName] = useState<string | null>(null);
  const entries = sidebarEntries(
    area,
    roles.map((r) => r.role),
  );
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))];
  const roleLabel = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(" · ");
  const displayName = fullName || session.user.email || "Your account";

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setFullName((data as { full_name?: string } | null)?.full_name || null));
  }, [session.user.id]);

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center border-b border-gold-light py-4 ${collapsed ? "justify-center px-2" : "justify-between gap-2 px-5"}`}>
        {collapsed ? (
          <button type="button" onClick={onToggle} title="Open sidebar" aria-label="Open sidebar" className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-white shadow-sm hover:bg-teal-900">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5l5 5-5 5" />
            </svg>
          </button>
        ) : (
          <>
            <Link href={areas.find((a) => a.startsWith(`/${area}/`)) || areas[0] || "/"} onClick={onNavigate} className="min-w-0">
              <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={132} height={40} priority />
            </Link>
            {onToggle && (
              <button type="button" onClick={onToggle} title="Close sidebar" aria-label="Close sidebar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3f9] text-ink/60 hover:bg-[#e3ebf5] hover:text-ink">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5l-5 5 5 5" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
      {!collapsed && <p className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink/45">{AREA_SUBTITLE[area]}</p>}

      <nav aria-label="Portal" className={`min-h-0 flex-1 overflow-y-auto pb-4 pt-2 ${collapsed ? "px-2" : "px-3"}`}>
        <ul className="space-y-1">
          {entries.map((e) => {
            const active = e.items.some((i) => isSidebarItemActive(pathname, i));
            return (
              <li key={e.label + e.href}>
                <Link
                  href={e.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? e.label : undefined}
                  className={`group flex items-center rounded-xl py-1.5 text-[15px] font-medium transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-2"} ${
                    active ? "bg-teal-100/60 font-semibold text-teal-900" : "text-ink/75 hover:bg-cream hover:text-ink"
                  }`}
                >
                  <NavIcon name={e.icon} active={active} />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{e.label}</span>}
                  {!collapsed && e.section && (
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink/30">
                      <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {areas.length > 1 && !collapsed && (
          <div className="mt-5 border-t border-gold-light pt-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/45">Switch area</p>
            {areas.map((href) => (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={`block rounded-lg px-3 py-1.5 text-sm ${href.startsWith(`/${area}/`) ? "font-semibold text-teal-800" : "text-ink/70 hover:bg-cream"}`}
              >
                {AREA_NAMES[href]}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className={`border-t border-gold-light ${collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "p-3"}`}>
        {collapsed ? (
          <>
            <Link href="/account" onClick={onNavigate} title={`${displayName} · ${roleLabel}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-sm font-semibold text-teal-900 hover:bg-teal-200">
              {initialsOf(displayName)}
            </Link>
            <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="flex h-9 w-9 items-center justify-center rounded-xl text-ink/55 hover:bg-red-50 hover:text-red-700">
              <SignOutIcon />
            </button>
          </>
        ) : (
          <div className="rounded-2xl bg-[#eef3f9] p-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-xs font-bold text-white" aria-hidden="true">
                {initialsOf(displayName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{fullName || "Your account"}</p>
                <p className="truncate text-xs text-ink/55">{roleLabel}</p>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <Link href="/account" onClick={onNavigate} className="rounded-lg bg-white py-1.5 text-center text-xs font-semibold text-ink/75 shadow-sm hover:text-ink">
                Account
              </Link>
              <button type="button" onClick={signOut} className="flex items-center justify-center gap-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-ink/75 shadow-sm hover:bg-red-50 hover:text-red-700">
                <SignOutIcon small /> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignOutIcon({ small }: { small?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={small ? "h-3.5 w-3.5" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5H4.5v13H8M12.5 6.5L16 10l-3.5 3.5M16 10H8" />
    </svg>
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="portal-topbar-btn text-ink/70"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
          <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="portal fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[85%] max-w-[300px] bg-white shadow-xl">
              <SidebarBody {...props} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
