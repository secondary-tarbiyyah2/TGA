"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLearnSignOut, learnRoleLabel, dashboardPathForRole, type RoleGrant } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalisePortalPath } from "@/lib/learn/nav";
import { ViewSettingsPanel, useRestoreView } from "@/components/ViewSettings";
import { lockPin, useHasPin } from "@/components/learn/pin/pinState";
import { ActionsMenu, type MenuAction } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";

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

/**
 * Who am I, my account, sign out: one place, top-right of every /learn
 * page. Laid out like Moodle's user menu. Anyone holding more than one
 * role (e.g. a teacher who is also a parent) can switch area from here.
 */
export function LearnAccountMenu({ session, roles }: { session: Session; roles: RoleGrant[] }) {
  useRestoreView();
  const supabase = getSupabaseClient();
  const signOut = useLearnSignOut();
  const pathname = normalisePortalPath(usePathname());
  const [fullName, setFullName] = useState<string | null>(null);
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

  const roleSummary = [...new Set(roles.map((r) => learnRoleLabel(r.role)))].join(" · ");
  const displayName = fullName || session.user.email || "Your account";

  // One entry per distinct area the user can reach, in a stable order.
  const areas = [...new Set(roles.map((r) => dashboardPathForRole(r.role)))].sort(
    (a, b) => Object.keys(AREA_NAMES).indexOf(a) - Object.keys(AREA_NAMES).indexOf(b),
  );
  const currentArea = "/" + (pathname.split("/")[1] || "") + "/dashboard";
  const isAdminIsh = roles.some((r) => ADMIN_ISH_ROLES.includes(r.role));

  const items: MenuAction[] = [
    ...(areas.length > 1
      ? [{ section: "Switch area", label: "" }, ...areas.map((href) => ({ label: AREA_NAMES[href], href, aside: href === currentArea ? "Current" : undefined }))]
      : []),
    { section: areas.length > 1 ? "Your account" : undefined, label: "" },
    { label: "Dashboard", icon: "house", href: areas.includes(currentArea) ? currentArea : areas[0] || "/" },
    { label: "Account settings", icon: "userRound", href: "/account" },
    { label: "Portal guide", icon: "bookOpenCheck", href: "/guide", hint: "Quick tour, a day in the life, every page A to Z" },
    ...(isAdminIsh ? [{ label: "School settings", icon: "settings", href: "/admin/settings" } as MenuAction] : []),
    { label: "Report a concern", icon: "shieldAlert", href: "/report-concern" },
    {
      label: "View",
      content: (
        <div className="px-0">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/65">View</p>
          <ViewSettingsPanel portal />
        </div>
      ),
    },
    ...(isParent && hasPin ? [{ label: "Lock family area", onSelect: () => lockPin(session.user.id) } as MenuAction] : []),
    { label: "Sign out", icon: "logOut", onSelect: () => signOut() },
  ];

  return (
    <ActionsMenu
      items={items}
      label="Account menu"
      menuClassName="w-72"
      triggerClassName="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-ink hover:bg-cream"
      triggerContent={
        <>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold tracking-wide text-white" aria-hidden="true">
            {initialsOf(displayName)}
          </span>
          <span className="hidden max-w-[9rem] truncate lg:inline">{fullName?.split(" ")[0] || displayName}</span>
          <Icon name="chevronDown" size="sm" className="h-3.5 w-3.5 text-ink/65" />
        </>
      }
      header={
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white" aria-hidden="true">
            {initialsOf(displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="truncate text-xs text-ink/65">{session.user.email}</p>
            {roleSummary && <p className="mt-0.5 truncate text-xs font-medium text-teal-700">{roleSummary}</p>}
          </div>
        </div>
      }
    />
  );
}
