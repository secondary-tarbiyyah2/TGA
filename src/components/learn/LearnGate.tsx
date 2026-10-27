"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLearnSession, type LearnRole } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

// A pupil who still has the temporary password the office gave them must
// choose their own before seeing anything else. The login page already sends
// them to /login/change-password; this makes every portal page do the same,
// so navigating away from that screen does not skip it. Checked once per
// signed-in user per tab (sessionStorage), cleared when the flag is cleared.
const MUST_CHANGE_KEY = "tga-must-change-password";
function useMustChangePassword(userId: string | null, isStudent: boolean): boolean | null {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId || !isStudent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the session, not a render-cycle sync
      setState(false);
      return;
    }
    try {
      const cached = window.sessionStorage.getItem(MUST_CHANGE_KEY);
      if (cached === `${userId}:0`) {
        setState(false);
        return;
      }
    } catch {
      /* storage unavailable: check the server */
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setState(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("student_logins")
      .select("must_change_password")
      .eq("profile_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const must = !!(data as { must_change_password: boolean } | null)?.must_change_password;
        setState(must);
        if (!must) {
          try {
            window.sessionStorage.setItem(MUST_CHANGE_KEY, `${userId}:0`);
          } catch {
            /* fine */
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isStudent]);
  return state;
}

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
  const router = useRouter();
  const pathname = usePathname();
  const userId = session && session !== "loading" ? session.user.id : null;
  const isStudent = rolesLoaded && roles.some((r) => r.role === "student");
  const mustChange = useMustChangePassword(userId, isStudent);
  useEffect(() => {
    if (mustChange && pathname !== "/login/change-password") router.replace("/login/change-password");
  }, [mustChange, pathname, router]);

  if (session === "loading" || (session && !rolesLoaded) || (isStudent && mustChange === null)) {
    return <p className="text-ink/65">Loading…</p>;
  }
  if (mustChange && pathname !== "/login/change-password") {
    return <p className="text-ink/65">Redirecting…</p>;
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
