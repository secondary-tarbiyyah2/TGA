"use client";

import Link from "next/link";
import { useLearnSession, STAFF_ROLES, type LearnRole } from "@/lib/learn/session";
import { MfaGate } from "@/components/staff/MfaGate";

/**
 * Client-side route gate — decides what to RENDER, not what's ALLOWED. If
 * this component were skipped entirely (broken build, a bug, someone
 * disabling JS), the pages underneath still return no data to anyone
 * without the matching RLS-backed role grant, because every read on those
 * pages goes through Postgres RLS. This component exists purely so a
 * signed-in user without the right role sees a clear message instead of an
 * empty/broken page — that's UX, and it is NOT where this system's actual
 * security decision is made.
 *
 * MFA: any of `allowedRoles` that's a staff role makes MFA mandatory before
 * children render, by wrapping them in the same MfaGate the old /staff area
 * uses (real Supabase Auth TOTP, not a UI mock).
 */
export function LearnGate({ allowedRoles, children }: { allowedRoles: LearnRole[]; children: React.ReactNode }) {
  const { session, roles, rolesLoaded } = useLearnSession();

  if (session === "loading" || (session && !rolesLoaded)) {
    return <p className="text-ink/60">Loading…</p>;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <p className="text-ink/60">The /learn area isn&apos;t connected yet.</p>;
  }
  if (!session) {
    return (
      <p className="text-ink/60">
        Please <Link href="/learn/login" className="text-gold-700 underline">sign in</Link> to continue.
      </p>
    );
  }

  const matched = roles.find((r) => allowedRoles.includes(r.role));
  if (!matched) {
    return <p className="text-ink/60">Your account doesn&apos;t have access to this page.</p>;
  }

  const requiresMfa = allowedRoles.some((r) => STAFF_ROLES.includes(r));
  if (requiresMfa) {
    return <MfaGate>{children}</MfaGate>;
  }
  return <>{children}</>;
}
