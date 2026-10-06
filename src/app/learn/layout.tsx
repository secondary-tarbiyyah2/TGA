"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLearnSession, dashboardPathForRole } from "@/lib/learn/session";
import { LearnAccountMenu } from "@/components/learn/LearnAccountMenu";
import { NotificationBell } from "@/components/learn/NotificationBell";
import { PortalSidebar, PortalSidebarDrawer } from "@/components/learn/PortalSidebar";
import { portalAreaFor } from "@/lib/learn/nav";
import { SignatureBanner } from "@/components/learn/SignatureBanner";
import { CommandPalette } from "@/components/learn/CommandPalette";
import { ClockChip, ClockInGate } from "@/components/learn/ClockInGate";

const ADMIN_ISH_ROLES = ["head_teacher", "admin", "admissions"];

/**
 * The shared shell for every /learn route (it replaces the public site's
 * Header/Footer, see src/app/(marketing)/layout.tsx).
 *
 * Signed in: an Ihsan-style app shell. A fixed sidebar down the left with
 * every destination for the area as one flat list of icon links, your
 * name and sign-out at the bottom; a slim top bar with report-a-concern,
 * messages and notifications. On phones the sidebar becomes a drawer.
 * The pages inside use Moodle's patterns (class cards, weekly course
 * pages, timeline and calendar blocks).
 *
 * Signed out (login, invite, forgot password): just the logo bar.
 */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, roles, rolesLoaded } = useLearnSession();
  const activeSession = session && session !== "loading" ? session : null;
  const signedIn = !!(activeSession && rolesLoaded && roles.length > 0);
  const homeHref = signedIn ? dashboardPathForRole(roles[0].role) : "/";
  // Pages outside an area (/account, /report-concern) keep the sidebar of
  // the user's main area, so there's always a way back.
  const area = signedIn ? portalAreaFor(pathname) || portalAreaFor(homeHref) : null;

  if (!signedIn || !activeSession || !area) {
    return (
      <div className="portal flex min-h-screen flex-col">
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
      <PortalSidebar area={area} session={activeSession} roles={roles} />

      <div className="flex min-h-screen flex-col lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-gold-light bg-white">
          <div className="flex h-[60px] items-center gap-2 px-4 sm:px-6 lg:px-8">
            <PortalSidebarDrawer area={area} session={activeSession} roles={roles} />
            <Link href={homeHref} className="lg:hidden" aria-label="Tarbiyyah Global Academy — your dashboard">
              <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={110} height={34} priority />
            </Link>

            <div className="ml-auto flex items-center gap-1">
              <CommandPalette area={area} roles={roles.map((r) => r.role)} />
              <ClockChip userId={activeSession.user.id} roles={roles} />
              <Link
                href="/report-concern"
                title="Report a concern"
                aria-label="Report a concern"
                className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[18px] w-[18px]">
                  <path d="M10 1.5l7 3v5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5v-5l7-3zm0 5a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1zm0 7.25a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" />
                </svg>
                <span className="hidden sm:inline">Report a concern</span>
              </Link>
              {roles.some((r) => ADMIN_ISH_ROLES.includes(r.role)) && <NotificationBell userId={activeSession.user.id} />}
            </div>
          </div>
        </header>

        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <SignatureBanner />
            <ClockInGate userId={activeSession.user.id} roles={roles}>
              {children}
            </ClockInGate>
          </div>
        </main>
      </div>
    </div>
  );
}
