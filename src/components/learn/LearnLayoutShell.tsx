"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { HubTabs } from "@/components/learn/PageHeader";
import { ViewSettingsMenu } from "@/components/ViewSettings";
import { ConfirmProvider } from "@/components/learn/kit";
import { TourHost } from "@/components/learn/tour/TourHost";
import { GuideButton } from "@/components/learn/guide/GuideButton";
import { GuideHost } from "@/components/learn/guide/GuideHost";

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
 * destination for the area (admin: under headings that fold away), with
 * your name and sign-out at the bottom; a slim top bar has search, clock-in,
 * display options, report-a-concern and notifications. On phones the sidebar
 * becomes a drawer. On a hub's pages (nav.ts) the hub's tabs sit at the top
 * of the content.
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
  const roleNames = useMemo(() => roles.map((r) => r.role), [roles]);
  // The entry assessment is a full-screen, distraction-free page of its own (no portal chrome).
  if (/^\/(learn\/)?assessment(\/|$)/.test(pathname || "")) return <div className="portal">{children}</div>;
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
        <header className="portal-topbar sticky top-0 z-40 border-b border-gold-light bg-white">
          <div className="mx-auto flex h-[60px] max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
            <Link href={homeHref} aria-label="Tarbiyyah Global Academy" className="flex shrink-0 items-center">
              <Image src="/brand/ga-wordmark.png" alt="" width={124} height={37} priority className="h-[37px] w-[124px] max-w-none object-contain" />
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
    <ConfirmProvider>
    <div className="portal min-h-screen lg:flex">
      <ActivityRecorder />
      <InstallAppSetup />
      <PortalSidebar area={area} session={activeSession} roles={roles} collapsed={collapsed} onToggle={toggleSidebar} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="portal-topbar sticky top-0 z-20">
          <div className="flex h-[var(--portal-topbar-h)] items-center gap-2 px-4 sm:px-6 lg:px-8">
            <PortalSidebarDrawer area={area} session={activeSession} roles={roles} />
            <Link href={homeHref} className="flex shrink-0 items-center lg:hidden" aria-label="Tarbiyyah Global Academy, your dashboard">
              {/* Very narrow phones (360px) get the square mark, so every top-bar button still fits. */}
              <Image src="/brand/ga-wordmark.png" alt="" width={110} height={33} priority className="h-[32px] w-[106px] max-w-none object-contain max-[419px]:hidden" />
              <Image src="/brand/ga-logo-square.png" alt="" width={32} height={32} className="hidden h-8 w-8 max-w-none rounded-md object-contain max-[419px]:block" />
            </Link>

            {/* One search for the whole portal: a field on the left on desktop, an icon on phones. */}
            <div className="flex min-w-0 items-center max-lg:order-last lg:flex-1">
              <CommandPalette area={area} roles={roles.map((r) => r.role)} />
            </div>
            {/* Everyday tools, then safeguarding on its own (always visible, never in a menu), then alerts. */}
            <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
              <GuideButton />
              <ClockChip userId={activeSession.user.id} roles={roles} />
              <span aria-hidden="true" className="portal-topbar-sep hidden sm:block" />
              <ViewSettingsMenu variant="portal" />
              <FeedbackButton />
              <span aria-hidden="true" className="portal-topbar-sep hidden sm:block" />
              <Link href="/report-concern" title="Report a concern" aria-label="Report a concern" data-tour="concern" className="portal-topbar-btn portal-topbar-btn--concern whitespace-nowrap">
                <Icon name="shieldAlert" />
                <span className="hidden sm:inline">Report a concern</span>
              </Link>
              {roles.some((r) => ADMIN_ISH_ROLES.includes(r.role)) && (
                <span data-tour="notifications" className="inline-flex">
                  <NotificationBell userId={activeSession.user.id} />
                </span>
              )}
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 overflow-x-clip pb-24 lg:pb-0">
          <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <SignatureBanner />
            <HubTabs roles={roles.map((r) => r.role)} />
            <ClockInGate userId={activeSession.user.id} roles={roles}>
              {children}
            </ClockInGate>
          </div>
        </main>
      </div>
      <MobileTabBar area={area} roles={roles.map((r) => r.role)} />
      <TourHost area={area} roles={roleNames} userId={activeSession.user.id} />
      <GuideHost area={area} roles={roleNames} userId={activeSession.user.id} />
    </div>
    </ConfirmProvider>
  );
}
