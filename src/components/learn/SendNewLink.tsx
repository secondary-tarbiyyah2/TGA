"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPasswordError } from "@/lib/learn/passwordRules";

/**
 * Shown when a setup/reset link is expired or already used: one tap emails a
 * fresh link. Asks for the email only when it isn't known. Always confirms
 * the same way, so it can't be used to discover which addresses have accounts.
 */
export function SendNewLink({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return setError("That doesn't look like an email address. Check it for typos (it should look like name@example.com).");
    const supabase = getSupabaseClient();
    if (!supabase) return setError("The sign-in service isn't available right now. Reload the page and try again.");
    setBusy(true);
    let err: unknown = null;
    try {
      const res = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${window.location.origin}/login/invite` });
      err = res.error;
    } catch (ex) {
      err = ex;
    }
    setBusy(false);
    if (err) return setError(friendlyPasswordError(err, "request"));
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
        If an account exists for <strong>{email.trim()}</strong>, a new email is on its way with a link and a 6-digit code. Check your inbox and spam folder; use the newest email.{" "}
        <a href={`/login/forgot?code=1&email=${encodeURIComponent(email.trim())}`} className="font-semibold underline">Enter the code</a>
      </p>
    );
  }
  return (
    <form onSubmit={send} noValidate className="mt-3 space-y-2">
      <label className="block text-sm font-medium text-ink">
        Your email address
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {busy ? "Sending…" : "Send me a new link"}
      </button>
    </form>
  );
}
