"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
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

  // Already signed in with a known role — send them straight to their
  // dashboard rather than showing the login form again.
  if (session && session !== "loading" && rolesLoaded && roles.length > 0) {
    router.replace(dashboardPathForRole(roles[0].role));
    return <p className="text-ink/60">Redirecting…</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const lockCheck = await callLearnLogin("check", { email });
    if (lockCheck?.ok && lockCheck.locked) {
      const minutes = Math.ceil((lockCheck.retryAfterSeconds || 0) / 60);
      setError(`Too many failed attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      return;
    }

    setBusy(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    // Fire-and-forget: this is a supplementary lockout/audit layer, not the
    // security boundary (see learn-login's own comments) — a slow or failed
    // record call should never block the user's actual sign-in result.
    callLearnLogin("record", { email, success: !signInErr });

    if (signInErr) {
      setError(
        signInErr.code === "invalid_credentials"
          ? "Incorrect email or password."
          : `Couldn't sign in: ${signInErr.message}`,
      );
      return;
    }
    router.replace("/");
  }

  return (
    <section className="app-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink/60">Staff, parents and students all sign in here.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Password
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <Link href="/login/forgot" className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
          Forgotten your password?
        </Link>
        <p className="mt-4 text-xs text-ink/50">Accounts are created by the school — this only works for emails already on file.</p>
      </div>
    </section>
  );
}
