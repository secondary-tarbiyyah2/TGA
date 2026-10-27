"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPasswordError } from "@/lib/learn/passwordRules";

/**
 * Sends a password-reset email via Supabase Auth (resetPasswordForEmail). The
 * email carries BOTH a link and a 6-digit code (recovery template in
 * deploy-supabase.yml), so someone reading email on a different device (a
 * phone, say) can type the code here instead of opening the link. The code is
 * checked with verifyOtp({ type: "recovery" }), which signs them in exactly as
 * the link would, and they then choose a new password on /login/invite.
 *
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
  const router = useRouter();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // "?code=1&email=..." (from the "Enter a code instead" link) goes straight to the code step.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const e = q.get("email");
    if (q.get("code") === "1") {
      /* eslint-disable react-hooks/set-state-in-effect -- read the starting step from the URL after mount */
      if (e) setEmail(e);
      setSent(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    const token = code.replace(/\D/g, "");
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return setCodeError("Enter the email address the code was sent to.");
    if (token.length < 6) return setCodeError("Enter the 6-digit code from the email.");
    const supabase = getSupabaseClient();
    if (!supabase) return setCodeError("The sign-in service isn't available right now. Reload the page and try again.");
    setChecking(true);
    try {
      const { error: otpErr } = await supabase.auth.verifyOtp({ email: clean, token, type: "recovery" });
      if (otpErr) {
        setChecking(false);
        const msg = (otpErr.message || "").toLowerCase();
        return setCodeError(
          msg.includes("expired") || msg.includes("invalid")
            ? "That code is wrong or has expired. Check the newest email, or send a new code below."
            : friendlyPasswordError(otpErr, "reset"),
        );
      }
      router.replace("/login/invite");
    } catch (err) {
      setChecking(false);
      setCodeError(friendlyPasswordError(err, "reset"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("The sign-in service isn't available right now. Reload the page and try again.");
      return;
    }
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError("That doesn't look like an email address. Check it for typos (it should look like name@example.com).");
      return;
    }
    setBusy(true);
    let resetErr: unknown = null;
    try {
      const res = await supabase.auth.resetPasswordForEmail(clean, {
      // window.location.origin, not a hardcoded string: once this page is
      // served from the /learn subdomain, that origin already IS the right
      // one (see src/lib/learn/origin.ts) — and Supabase's redirect
      // allowlist (deploy-supabase.yml) must include it.
      redirectTo: `${window.location.origin}/login/invite`,
      });
      resetErr = res.error;
    } catch (err) {
      resetErr = err;
    }
    setBusy(false);
    if (resetErr) {
      // "No such account" is never reported by Supabase here, so anything that
      // lands here is a real problem (rate limit, network, service) the user can act on.
      setError(friendlyPasswordError(resetErr, "request"));
      return;
    }
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
            If an account exists for <strong>{email || "that address"}</strong>, we&apos;ve sent an email with a 6-digit code and a
            reset link. Use whichever is easier: open the link on this device, or type the code below (handy if the email is
            on your phone). Both expire after 24 hours and work once.
          </p>
          <form onSubmit={handleCode} noValidate className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-ink">
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-ink">
              6-digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2 text-center text-2xl tracking-[0.4em] tabular-nums"
              />
            </label>
            {codeError && <p role="alert" className="text-sm text-red-700">{codeError}</p>}
            <button type="submit" disabled={checking} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-60">
              {checking ? "Checking…" : "Continue"}
            </button>
          </form>
          <button type="button" onClick={() => { setSent(false); setCode(""); setCodeError(null); }} className="mt-4 text-sm font-semibold text-gold-700 underline">
            Send a new code
          </button>
          <Link href="/login" className="mt-4 block text-xs text-ink/65 underline">
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
        <p className="mt-1 text-sm text-ink/65">Enter the email address your account was set up with.</p>
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
            {busy ? "Sending…" : "Send reset code"}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink/70">
          Already have a code?{" "}
          <a href="/login/forgot?code=1" className="font-semibold text-gold-700 underline">Enter it here</a>
        </p>
        <p className="mt-3 text-xs text-ink/65">
          Forgotten which email you used?{" "}
          <Link href="/contact" className="font-semibold text-gold-700 underline">Contact the school office</Link> and
          we can look it up for you.
        </p>
        <Link href="/login" className="mt-2 inline-block text-xs text-ink/65 underline">
          Back to sign in
        </Link>
      </div>
    </section>
  );
}
