"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";
import { friendlyPasswordError, passwordProblem } from "@/lib/learn/passwordRules";
import { PasswordChecklist } from "@/components/learn/PasswordChecklist";
import { PasswordInput } from "@/components/learn/PasswordInput";
import { SendNewLink } from "@/components/learn/SendNewLink";

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
  const [verifying, setVerifying] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Branded links look like /login/invite?token_hash=…&type=recovery. The token is
  // only redeemed here in the browser (so email scanners that merely fetch the
  // URL can't use it up), and the address never shows the backend host.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Supabase reports a bad link in the URL hash (#error_code=otp_expired&...).
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashCode = hash.get("error_code") || hash.get("error");
    if (hashCode) {
      setLinkError(friendlyPasswordError({ code: hash.get("error_code") || undefined, message: hash.get("error_description") || "" }, "set"));
      return;
    }
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    const supabase = getSupabaseClient();
    if (!tokenHash || !supabase) return;
    setVerifying(true);
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type === "invite" ? "invite" : "recovery" })
      .then(({ error: otpErr }) => {
        if (otpErr) setLinkError(friendlyPasswordError(otpErr, "set"));
        else window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((err: unknown) => setLinkError(friendlyPasswordError(err, "set")))
      .finally(() => setVerifying(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("The sign-in service isn't available right now. Reload the page and try again.");
      return;
    }
    setBusy(true);
    let updateErr: unknown = null;
    try {
      const res = await supabase.auth.updateUser({ password });
      updateErr = res.error;
    } catch (err) {
      updateErr = err;
    }
    setBusy(false);
    if (updateErr) {
      setError(friendlyPasswordError(updateErr, "set"));
      return;
    }
    setPasswordSet(true);
  }

  if (session === "loading" || verifying) return <p className="text-ink/60">Loading…</p>;
  if (!session) {
    return (
      <section className="app-pad">
        <div className="mx-auto max-w-sm">
          <p role="alert" className="text-ink/70">
            {linkError || "This link has expired or has already been used (each link works once). Enter your email and we will send you a new one."}
          </p>
          <SendNewLink />
          <Link href="/login" className="mt-4 inline-block text-xs text-ink/50 underline">
            Back to sign in
          </Link>
        </div>
      </section>
    );
  }

  if (passwordSet) {
    return (
      <section className="app-pad">
        <div className="mx-auto max-w-sm">
          <h1 className="font-serif text-h2 font-semibold text-ink">You&apos;re all set</h1>
          <p className="mt-1 text-sm text-ink/60">Your password has been set.</p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-6 rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 transition-colors"
          >
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="app-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Set your password</h1>
        <p className="mt-1 text-sm text-ink/60">Choose a password for your account.</p>
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
          <PasswordInput label="Password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <PasswordInput label="Confirm password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <PasswordChecklist password={password} confirm={confirm} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
            {busy ? "Saving…" : "Continue"}
          </button>
        </form>
      </div>
    </section>
  );
}
