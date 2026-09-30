"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLearnSession, dashboardPathForRole } from "@/lib/learn/session";
import { LearnAccountMenu } from "@/components/learn/LearnAccountMenu";
import { NotificationBell } from "@/components/learn/NotificationBell";
import { PortalMobileMenu, PortalNav } from "@/components/learn/PortalNav";
import { AREA_LABEL, portalAreaFor } from "@/lib/learn/nav";

const ADMIN_ISH_ROLES = ["head_teacher", "admin", "admissions"];

/**
 * The shared shell for every /learn route. It replaces the public site's
 * Header/Footer (see src/app/(marketing)/layout.tsx).
 *
 * Laid out like a standard LMS (Moodle, Classroom): one sticky header with
 * the logo, notifications and account menu on the top row, and the
 * area's navigation as tabs on the row below. Before this, the header and
 * each area's own nav (AdminShell's bar, LearnShell's pills) were two
 * separate strips stacked on top of each other.
 *
 * The <main> container sets the page width and side gutters for every
 * portal page. Before, pages had no container and ran edge to edge.
 */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, roles, rolesLoaded } = useLearnSession();
  const activeSession = session && session !== "loading" ? session : null;
  const signedIn = !!(activeSession && rolesLoaded && roles.length > 0);
  const homeHref = signedIn ? dashboardPathForRole(roles[0].role) : "/";
  const area = signedIn ? portalAreaFor(pathname) : null;
  const roleNames = roles.map((r) => r.role as string);

  return (
    <div className="portal flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-gold-light bg-white">
        <div className="relative mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          {area && <PortalMobileMenu area={area} roles={roleNames} />}
          <Link href={homeHref} className="flex items-center gap-3" aria-label="Tarbiyyah Global Academy — your dashboard">
            <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={124} height={38} priority />
          </Link>
          {area && (
            <span className="hidden items-center gap-3 sm:flex">
              <span aria-hidden="true" className="h-6 w-px bg-gold-light" />
              <span className="text-sm font-semibold text-ink/70">{AREA_LABEL[area]}</span>
            </span>
          )}

          {signedIn && activeSession && (
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                href="/report-concern"
                className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 lg:flex"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path d="M10 1.5l7 3v5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5v-5l7-3zm0 5a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1zm0 7.25a1 1 0 100 2 1 1 0 000-2z" fill="currentColor" />
                </svg>
                Report a concern
              </Link>
              {roles.some((r) => ADMIN_ISH_ROLES.includes(r.role)) && <NotificationBell userId={activeSession.user.id} />}
              <LearnAccountMenu session={activeSession} roles={roles} />
            </div>
          )}
        </div>

        {area && (
          <div className="hidden border-t border-gold-light/70 md:block">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <PortalNav area={area} roles={roleNames} />
            </div>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
