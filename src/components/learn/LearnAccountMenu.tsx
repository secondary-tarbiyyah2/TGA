"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLearnSignOut, learnRoleLabel, dashboardPathForRole, type RoleGrant } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalisePortalPath } from "@/lib/learn/nav";
import { lockPin, useHasPin } from "@/components/learn/pin/pinState";

const ADMIN_ISH_ROLES = ["head_teacher", "admin", "admissions"];

const AREA_NAMES: Record<string, string> = {
  "/admin/dashboard": "Admin",
  "/teach/dashboard": "Teaching",
  "/family/dashboard": "Family",
  "/student/dashboard": "Student",
};

function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink/80 hover:bg-cream hover:text-ink">
      {children}
    </Link>
  );
}

/**
 * Who am I, my account, sign out: one place, top-right of every /learn
 * page. Laid out like Moodle's user menu. Anyone holding more than one
 * role (e.g. a teacher who is also a parent) can switch area from here.
 */
export function LearnAccountMenu({ session, roles }: { session: Session; roles: RoleGrant[] }) {
  const supabase = getSupabaseClient();
  const signOut = useLearnSignOut();
  const pathname = normalisePortalPath(usePathname());
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isParent = roles.some((r) => r.role === "parent");
  const { has: hasPin } = useHasPin(session.user.id, isParent);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setFullName((data as { full_name?: string } | null)?.full_name || null));
  }, [supabase, session.user.id]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const roleSummary = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(" · ");
  const displayName = fullName || session.user.email || "Your account";
  const close = () => setOpen(false);

  // One entry per distinct area the user can reach, in a stable order.
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))].sort(
    (a, b) => Object.keys(AREA_NAMES).indexOf(a) - Object.keys(AREA_NAMES).indexOf(b),
  );
  const currentArea = "/" + (pathname.split("/")[1] || "") + "/dashboard";
  const isAdminIsh = roles.some((r) => ADMIN_ISH_ROLES.includes(r.role));

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-ink hover:bg-cream"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold tracking-wide text-white" aria-hidden="true">
          {initialsOf(displayName)}
        </span>
        <span className="hidden max-w-[9rem] truncate lg:inline">{fullName?.split(" ")[0] || displayName}</span>
        <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden="true" className={`text-ink/50 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gold-light bg-white shadow-warm">
          <div className="flex items-center gap-3 border-b border-gold-light/70 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white" aria-hidden="true">
              {initialsOf(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
              <p className="truncate text-xs text-ink/55">{session.user.email}</p>
              {roleSummary && <p className="mt-0.5 truncate text-xs font-medium text-teal-700">{roleSummary}</p>}
            </div>
          </div>

          {areas.length > 1 && (
            <div className="border-b border-gold-light/70 p-1.5">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/45">Switch area</p>
              {areas.map((href) => (
                <MenuLink key={href} href={href} onClick={close}>
                  <span className="flex-1">{AREA_NAMES[href]}</span>
                  {href === currentArea && <span className="text-xs font-medium text-teal-700">Current</span>}
                </MenuLink>
              ))}
            </div>
          )}

          <div className="p-1.5">
            <MenuLink href={areas.includes(currentArea) ? currentArea : areas[0] || "/"} onClick={close}>
              Dashboard
            </MenuLink>
            <MenuLink href="/account" onClick={close}>
              Account settings
            </MenuLink>
            {isAdminIsh && (
              <MenuLink href="/admin/settings" onClick={close}>
                School settings
              </MenuLink>
            )}
            <MenuLink href="/report-concern" onClick={close}>
              <span className="text-red-700">Report a concern</span>
            </MenuLink>
          </div>

          <div className="border-t border-gold-light/70 p-1.5">
            {isParent && hasPin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  lockPin(session.user.id);
                }}
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream hover:text-ink"
              >
                Lock family area
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                signOut();
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink/80 hover:bg-cream hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
