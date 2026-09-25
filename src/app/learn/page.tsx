"use client";

import Link from "next/link";
import { useLearnSession, dashboardPathForRole, learnRoleLabel } from "@/lib/learn/session";

export default function LearnLandingPage() {
  const { session, roles, rolesLoaded } = useLearnSession();

  if (session === "loading" || (session && !rolesLoaded)) return <p className="text-ink/60">Loading…</p>;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <p className="text-ink/60">The /learn area isn&apos;t connected yet.</p>;
  if (!session) {
    return (
      <p className="text-ink/60">
        Please <Link href="/learn/login" className="text-gold-700 underline">sign in</Link> to continue.
      </p>
    );
  }

  const uniqueRoles = [...new Set(roles.map((r) => r.role))];

  if (uniqueRoles.length === 0) {
    return <p className="text-ink/60">Your account doesn&apos;t have any /learn access yet — ask an admin to set this up.</p>;
  }

  if (uniqueRoles.length === 1) {
    // A single role: go straight to their dashboard rather than making
    // them click through a switcher with only one option.
    if (typeof window !== "undefined") window.location.replace(dashboardPathForRole(uniqueRoles[0]));
    return <p className="text-ink/60">Redirecting…</p>;
  }

  return (
    <section className="section-pad">
      <div className="mx-auto max-w-md">
        <h1 className="font-serif text-h2 font-semibold text-ink">Choose how you&apos;d like to continue</h1>
        <p className="mt-1 text-sm text-ink/60">Your account holds more than one role.</p>
        <ul className="mt-6 space-y-3">
          {uniqueRoles.map((role) => (
            <li key={role}>
              <Link
                href={dashboardPathForRole(role)}
                className="block rounded-2xl border border-gold-light/50 bg-white p-4 font-medium text-ink hover:border-gold-500"
              >
                Continue as {learnRoleLabel(role)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
