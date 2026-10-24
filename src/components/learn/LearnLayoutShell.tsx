"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLearnSession, dashboardPathForRole } from "@/lib/learn/session";
import { LearnAccountMenu } from "@/components/learn/LearnAccountMenu";
import { NotificationBell } from "@/components/learn/NotificationBell";
import { PortalSidebar, PortalSidebarDrawer } from "@/components/learn/PortalSidebar";
import { portalAreaFor } from "@/lib/learn/nav";
import { SignatureBanner } from "@/components/learn/SignatureBanner";
import { CommandPalette } from "@/components/learn/CommandPalette";
import { ClockChip, ClockInGate } from "@/components/learn/ClockInGate";
import { Icon } from "@/components/learn/Icon";
import { ActivityRecorder } from "@/components/learn/feedback/ActivityRecorder";
import { FeedbackButton } from "@/components/learn/feedback/FeedbackButton";
import { MobileTabBar } from "@/components/learn/MobileTabBar";
import { InstallAppSetup } from "@/components/learn/InstallApp";

const ADMIN_ISH_ROLES = ["head_teacher", "admin", "admissions"];

/**
 * Number fields are plain text fields with a number keyboard (so the browser
 * never shows them in Arabic-Indic digits on an Arabic-language computer).
 * If someone types Arabic-Indic or Persian digits anyway, turn them into
 * 0-9 before the page reads the field, so marks and amounts still save.
 */
function useWesternDigits() {
  useEffect(() => {
    const fix = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      const mode = el.inputMode;
      if (mode !== "decimal" && mode !== "numeric" && el.type !== "tel") return;
      const v = el.value;
      const fixed = v.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/\u066b/g, ".");
      if (fixed !== v) el.value = fixed;
    };
    document.addEventListener("input", fix, true);
    return () => document.removeEventListener("input", fix, true);
  }, []);
}

/**
 * The shared shell for every /learn route (it replaces the public site's
 * Header/Footer, see src/app/(marketing)/layout.tsx).
 *
 * Signed in: an app shell. A fixed sidebar down the left holds every
 * destination for the area, in sections that open and close in place, with
 * your name and sign-out at the bottom; a slim top bar has search, clock-in,
 * report-a-concern and notifications. On phones the sidebar becomes a drawer.
 * The pages inside use Moodle's patterns (class cards, weekly course
 * pages, timeline and calendar blocks).
 *
 * Signed out (login, invite, forgot password): just the logo bar.
 */
export function LearnLayoutShell({ children }: { children: React.ReactNode }) {
  useWesternDigits();
  const pathname = usePathname();
  const { session, roles, rolesLoaded } = useLearnSession();
  // Desktop sidebar: open (full) or closed (icon rail). Remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved preference after mount
      if (window.localStorage.getItem("tga-sidebar") === "closed") setCollapsed(true);
    } catch {
      /* storage unavailable: stay open */
    }
  }, []);
  const toggleSidebar = () =>
    setCollapsed((c) => {
      try {
        window.localStorage.setItem("tga-sidebar", c ? "open" : "closed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  const activeSession = session && session !== "loading" ? session : null;
  const signedIn = !!(activeSession && rolesLoaded && roles.length > 0);
  const homeHref = signedIn ? dashboardPathForRole(roles[0].role) : "/";
  // Pages outside an area (/account, /report-concern) keep the sidebar of
  // the user's main area, so there's always a way back.
  const area = signedIn ? portalAreaFor(pathname) || portalAreaFor(homeHref) : null;

  if (!signedIn || !activeSession || !area) {
    return (
      <div className="portal flex min-h-screen flex-col">
        <ActivityRecorder />
        <InstallAppSetup />
        <header className="sticky top-0 z-40 border-b border-gold-light bg-white">
          <div className="mx-auto flex h-[60px] max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
            <Link href={homeHref} aria-label="Tarbiyyah Global Academy">
              <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={124} height={38} priority />
            </Link>
            {activeSession && rolesLoaded && roles.length > 0 && (
              <div className="ml-auto">
                <LearnAccountMenu session={activeSession} roles={roles} />
              </div>
            )}
          </div>
        </header>
        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="portal min-h-screen">
      <ActivityRecorder />
      <InstallAppSetup />
      <PortalSidebar area={area} session={activeSession} roles={roles} collapsed={collapsed} onToggle={toggleSidebar} />

      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[76px]" : "lg:pl-[272px]"}`}>
        <header className="portal-topbar sticky top-0 z-20">
          <div className="flex h-[60px] items-center gap-2 px-4 sm:px-6 lg:px-8">
            <PortalSidebarDrawer area={area} session={activeSession} roles={roles} />
            <Link href={homeHref} className="lg:hidden" aria-label="Tarbiyyah Global Academy — your dashboard">
              <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={110} height={34} priority />
            </Link>

            <div className="ml-auto flex items-center gap-1">
              <CommandPalette area={area} roles={roles.map((r) => r.role)} />
              <ClockChip userId={activeSession.user.id} roles={roles} />
              <FeedbackButton />
              <Link
                href="/report-concern"
                title="Report a concern"
                aria-label="Report a concern"
                className="portal-topbar-btn ml-1 whitespace-nowrap text-sm font-medium text-red-700 hover:!bg-red-50"
              >
                <Icon name="shieldAlert" className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Report a concern</span>
              </Link>
              {roles.some((r) => ADMIN_ISH_ROLES.includes(r.role)) && <NotificationBell userId={activeSession.user.id} />}
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 overflow-x-clip pb-20 lg:pb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <SignatureBanner />
            <ClockInGate userId={activeSession.user.id} roles={roles}>
              {children}
            </ClockInGate>
          </div>
        </main>
      </div>
      <MobileTabBar area={area} roles={roles.map((r) => r.role)} />
    </div>
  );
}
