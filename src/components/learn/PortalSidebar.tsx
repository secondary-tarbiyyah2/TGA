"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dashboardPathForRole, learnRoleLabel, useLearnSignOut, type RoleGrant } from "@/lib/learn/session";
import { AREA_SUBTITLE, isActivePath, visibleSidebarGroups, type PortalArea, type SidebarIcon } from "@/lib/learn/nav";

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

function NavIcon({ name }: { name: SidebarIcon }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
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
function SidebarBody({ area, session, roles, onNavigate }: { area: PortalArea; session: Session; roles: RoleGrant[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const signOut = useLearnSignOut();
  const [fullName, setFullName] = useState<string | null>(null);
  const groups = visibleSidebarGroups(
    area,
    roles.map((r) => r.role),
  );
  const activeGroup = groups.find((g) => g.items.some((i) => isActivePath(pathname, i.href)))?.label;
  // Open state is remembered per area; the group holding the current page
  // is always opened. Default: just the first group.
  const storeKey = `learn.sidebar.open.${area}`;
  const [openGroups, setOpenGroups] = useState<string[]>(() => groups.slice(0, 1).map((g) => g.label));
  useEffect(() => {
    let saved: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      /* storage unavailable: keep defaults */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore remembered state after mount
    setOpenGroups((cur) => {
      const base = Array.isArray(saved) ? saved : cur;
      return activeGroup && !base.includes(activeGroup) ? [...base, activeGroup] : base;
    });
  }, [storeKey, activeGroup]);
  const toggleGroup = (label: string) =>
    setOpenGroups((cur) => {
      const next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
      try {
        window.localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
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
      <Link href={areas.find((a) => a.startsWith(`/${area}/`)) || areas[0] || "/"} onClick={onNavigate} className="flex items-center gap-3 border-b border-gold-light px-5 py-4">
        <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={132} height={40} priority />
      </Link>
      <p className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink/45">{AREA_SUBTITLE[area]}</p>

      <nav aria-label="Portal" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => {
          const grouped = g.label !== "";
          const isOpen = !grouped || openGroups.includes(g.label) || g.label === activeGroup;
          const listId = `sb-${area}-${g.label.replace(/\W+/g, "-")}`;
          return (
            <div key={g.label || "all"} className={grouped ? "mt-1" : ""}>
              {grouped && (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.label)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink/50 hover:bg-cream hover:text-ink/70"
                >
                  <span className={g.label === activeGroup ? "text-teal-800" : ""}>{g.label}</span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                    <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {isOpen && (
                <ul id={listId} className="space-y-0.5">
                  {g.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                            active ? "bg-teal-100 text-teal-900" : "text-ink/75 hover:bg-cream hover:text-ink"
                          }`}
                        >
                          <NavIcon name={item.icon} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {active && (
                            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-teal-700">
                              <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {areas.length > 1 && (
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

      <div className="flex items-center gap-3 border-t border-gold-light px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-900" aria-hidden="true">
          {initialsOf(displayName)}
        </span>
        <Link href="/account" onClick={onNavigate} className="min-w-0 flex-1" title="Account settings">
          <span className="block truncate text-sm font-semibold text-ink">{displayName}</span>
          <span className="block truncate text-xs text-ink/55">{roleLabel}</span>
        </Link>
        <button
          type="button"
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink/55 hover:bg-cream hover:text-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3.5H4.5v13H8M12.5 6.5L16 10l-3.5 3.5M16 10H8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Desktop: a fixed rail down the left. */
export function PortalSidebar(props: { area: PortalArea; session: Session; roles: RoleGrant[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-gold-light bg-white lg:block">
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
        className="flex h-10 w-10 items-center justify-center rounded-lg text-ink/70 hover:bg-cream"
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
