"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Sends a password-reset link via Supabase Auth (resetPasswordForEmail).
 * The link it emails is the same "recovery" type used by staff invites, so
 * it lands on the existing /learn/login/invite page, which already knows
 * how to accept a recovery session and let someone set a new password —
 * no second "set password" page needed.
 *
 * Deliberately never reveals whether an email address has an account:
 * the same confirmation message is shown whether or not the address
 * matches a real user, so this can't be used to enumerate accounts.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      // window.location.origin, not a hardcoded string: once this page is
      // served from the /learn subdomain, that origin already IS the right
      // one (see src/lib/learn/origin.ts) — and Supabase's redirect
      // allowlist (deploy-supabase.yml) must include it.
      redirectTo: `${window.location.origin}/login/invite`,
    });
    setBusy(false);
    // Always show the same confirmation, whether or not the address
    // matched an account — never let this page reveal that.
    setSent(true);
  }

  if (sent) {
    return (
      <section className="app-pad">
        <div className="mx-auto max-w-sm">
          <h1 className="font-serif text-h2 font-semibold text-ink">Check your email</h1>
          <p className="mt-2 text-sm text-ink/70">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It expires
            after a short time and can only be used once.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-gold-700 underline">
            Back to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="app-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink/60">Enter the email address your account was set up with.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="mt-4 text-xs text-ink/50">
          Forgotten which email you used?{" "}
          <Link href="/contact" className="font-semibold text-gold-700 underline">Contact the school office</Link> and
          we can look it up for you.
        </p>
        <Link href="/login" className="mt-2 inline-block text-xs text-ink/50 underline">
          Back to sign in
        </Link>
      </div>
    </section>
  );
}
