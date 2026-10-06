"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { loginEmailFor } from "@/lib/learn/studentLogin";
import { useLearnSession, dashboardPathForRole } from "@/lib/learn/session";

async function callLearnLogin(action: "check" | "record", body: Record<string, unknown>) {
  const url = getEdgeFunctionUrl("learn-login");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ action, ...body }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export default function LearnLoginPage() {
  const router = useRouter();
  const { session, roles, rolesLoaded } = useLearnSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Held while the post-sign-in "must change password" check runs, so the
  // already-signed-in redirect below cannot jump ahead of it.
  const [finishing, setFinishing] = useState(false);

  // Already signed in with a known role — send them straight to their
  // dashboard rather than showing the login form again.
  if (!finishing && session && session !== "loading" && rolesLoaded && roles.length > 0) {
    router.replace(dashboardPathForRole(roles[0].role));
    return <p className="text-ink/60">Redirecting…</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Students type a username; it maps to a synthetic email (see src/lib/learn/studentLogin.ts).
    const loginEmail = loginEmailFor(email);
    const lockCheck = await callLearnLogin("check", { email: loginEmail });
    if (lockCheck?.ok && lockCheck.locked) {
      const minutes = Math.ceil((lockCheck.retryAfterSeconds || 0) / 60);
      setError(`Too many failed attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      return;
    }

    setBusy(true);
    setFinishing(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setBusy(false);

    // Fire-and-forget: this is a supplementary lockout/audit layer, not the
    // security boundary (see learn-login's own comments) — a slow or failed
    // record call should never block the user's actual sign-in result.
    callLearnLogin("record", { email: loginEmail, success: !signInErr });

    if (signInErr) {
      setFinishing(false);
      setError(
        signInErr.code === "invalid_credentials"
          ? "Incorrect email, username or password."
          : `Couldn't sign in: ${signInErr.message}`,
      );
      return;
    }
    // A pupil with a temporary password has to choose their own before anything else.
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: row } = await supabase.from("student_logins").select("must_change_password").eq("profile_id", uid).maybeSingle();
        if ((row as { must_change_password: boolean } | null)?.must_change_password) {
          router.replace("/login/change-password");
          return;
        }
      }
    } catch {
      // Fall through: the change-password page is also reachable by hand and the check repeats at next sign-in.
    }
    setFinishing(false);
    router.replace("/");
  }

  return (
    <section className="app-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink/60">Staff, parents and students all sign in here.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Email or username
            <input type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <Link href="/login/forgot" className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
          Forgotten your password?
        </Link>
        <p className="mt-4 text-xs text-ink/50">Accounts are created by the school. Students sign in with the username the school gave them. If a student forgets their password, a parent or the school can reset it.</p>
      </div>
    </section>
  );
}
