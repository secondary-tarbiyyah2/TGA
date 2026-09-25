"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const FRESH_MINUTES = 15;

function decodeIat(accessToken: string): number | null {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

/**
 * Gates its children behind a FRESHLY re-entered MFA code — not just "MFA
 * verified at some point this session", which MfaGate alone gives you.
 * Mirrors what the safeguarding_concerns/safeguarding_chronology RLS
 * policies check server-side via current_token_fresh(15) (0015). Wrap this
 * INSIDE an MfaGate (so a never-enrolled user sees enrollment first), and
 * around ONLY the safeguarding-log UI specifically — this is deliberately
 * not applied to the rest of the compliance area, which only checks
 * role/permission. See the compliance page's top-level comment for the
 * full reasoning on why the safeguarding log alone gets this extra layer.
 */
export function FreshMfaGate({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [fresh, setFresh] = useState<boolean | "loading">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkFreshness() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const iat = token ? decodeIat(token) : null;
    setFresh(!!iat && Date.now() / 1000 - iat < FRESH_MINUTES * 60);
  }

  useEffect(() => {
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial freshness check, not a render-cycle sync
    checkFreshness();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) setFactorId(verified.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [supabase]);

  const reverify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyErr) {
      setError("That code didn't work — check your authenticator app and try again.");
      return;
    }
    setCode("");
    await checkFreshness();
  };

  if (fresh === "loading") return <p className="text-sm text-ink/60">Checking security requirements…</p>;
  if (fresh) return <>{children}</>;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h3 className="font-serif text-lg font-semibold text-ink">Re-enter your authenticator code to continue</h3>
      <p className="mt-1 text-sm text-ink/70">
        The safeguarding log requires a freshly re-verified authenticator code (every {FRESH_MINUTES} minutes), even though you&apos;re
        already signed in with MFA — this is a deliberately stricter check than the rest of the compliance area, given what this
        section holds.
      </p>
      {!factorId && <p className="mt-3 text-sm text-ink/70">Set up an authenticator app from any other admin page first, then return here.</p>}
      {factorId && (
        <form onSubmit={reverify} className="mt-4 flex items-end gap-2">
          <label className="text-sm text-ink">
            6-digit code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className="mt-1 block w-28 rounded-lg border border-gold-light/60 px-3 py-2"
            />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
