"use client";

import Image from "next/image";
import Link from "next/link";
import { useLearnSession, dashboardPathForRole } from "@/lib/learn/session";
import { LearnAccountMenu } from "@/components/learn/LearnAccountMenu";

/**
 * The authenticated /learn area's own shell — applies to EVERY /learn route
 * (admin/teach/family/student/login), replacing the public site's
 * Header/Footer entirely (see src/app/(marketing)/layout.tsx, which now
 * carries those instead of the root layout). Before this file existed,
 * every /learn page rendered the public marketing Header (About/Learning/
 * Admissions/Parents/Contact, "Log in", "Book a free call") stacked on top
 * of AdminShell's own 14-item sidebar — reported as "crowded... and it
 * shows Log in even when I'm signed in".
 *
 * Deliberately minimal: a slim top bar with the wordmark (linking to the
 * signed-in user's OWN dashboard, never the public homepage), and — once
 * signed in — the account menu (name/role, account settings, sign out;
 * see LearnAccountMenu.tsx). Individual areas (AdminShell's sidebar, etc.)
 * keep their own in-page navigation below this bar; this layout only owns
 * the one thing every /learn page needs in common.
 */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const { session, roles, rolesLoaded } = useLearnSession();
  const activeSession = session && session !== "loading" ? session : null;
  const signedIn = !!(activeSession && rolesLoaded && roles.length > 0);
  const homeHref = signedIn ? dashboardPathForRole(roles[0].role) : "/";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gold-light/50 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={homeHref} className="flex items-center gap-2" aria-label="Tarbiyyah Global Academy — your dashboard">
            <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={150} height={46} priority />
            <span className="hidden rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/50 sm:inline">
              Learn
            </span>
          </Link>
          {signedIn && activeSession && <LearnAccountMenu session={activeSession} roles={roles} />}
        </div>
      </header>
      <main id="main" className="flex-1 bg-cream/30">
        {children}
      </main>
    </>
  );
}
