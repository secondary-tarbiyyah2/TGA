"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { MfaGate } from "@/components/staff/MfaGate";

/**
 * Where a one-time invite/recovery link (from learn-invite or
 * scripts/invite-first-head-teacher.mjs) lands. Supabase's client SDK
 * establishes a session automatically from the link's URL on page load
 * (detectSessionInUrl, on by default) — no password has ever existed for
 * this account until the form below sets one.
 */
export default function LearnInvitePage() {
  const router = useRouter();
  const { session } = useLearnSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateErr) {
      setError("Couldn't set your password — try again.");
      return;
    }
    setPasswordSet(true);
  }

  if (session === "loading") return <p className="text-ink/60">Loading…</p>;
  if (!session) {
    return (
      <section className="section-pad">
        <div className="mx-auto max-w-sm">
          <p className="text-ink/60">
            This setup link is invalid or has expired. Ask whoever set up your account to send you a new one.
          </p>
        </div>
      </section>
    );
  }

  if (passwordSet) {
    return (
      <section className="section-pad">
        <div className="mx-auto max-w-sm">
          <h1 className="font-serif text-h2 font-semibold text-ink">One more step</h1>
          <p className="mt-1 text-sm text-ink/60">Set up an authenticator app to finish securing your account.</p>
          <div className="mt-6">
            <MfaGate>
              <p className="text-sm text-ink">You&apos;re all set.</p>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="mt-4 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95"
              >
                Continue
              </button>
            </MfaGate>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Set your password</h1>
        <p className="mt-1 text-sm text-ink/60">Choose a password for your account.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Password
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Confirm password
            <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </section>
  );
}
