"use client";

import Link from "next/link";
import { useLearnSession, type LearnRole } from "@/lib/learn/session";

/**
 * Client-side route gate, decides what to RENDER, not what's ALLOWED. If
 * this component were skipped entirely (broken build, a bug, someone
 * disabling JS), the pages underneath still return no data to anyone
 * without the matching RLS-backed role grant, because every read on those
 * pages goes through Postgres RLS. This component exists purely so a
 * signed-in user without the right role sees a clear message instead of an
 * empty/broken page, that's UX, and it is NOT where this system's actual
 * security decision is made.
 *
 * MFA was removed app-wide (see supabase/migrations/0020_remove_mfa.sql), 
 * this used to also wrap children in MfaGate for any staff-role page.
 */
export function LearnGate({ allowedRoles, children }: { allowedRoles: LearnRole[]; children: React.ReactNode }) {
  const { session, roles, rolesLoaded } = useLearnSession();

  if (session === "loading" || (session && !rolesLoaded)) {
    return <p className="text-ink/65">Loading…</p>;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <p className="text-ink/65">The /learn area isn&apos;t connected yet.</p>;
  }
  if (!session) {
    return (
      <p className="text-ink/65">
        Please <Link href="/login" className="text-gold-700 underline">sign in</Link> to continue.
      </p>
    );
  }

  const matched = roles.find((r) => allowedRoles.includes(r.role));
  if (!matched) {
    return <p className="text-ink/65">Your account doesn&apos;t have access to this page.</p>;
  }

  return <>{children}</>;
}
