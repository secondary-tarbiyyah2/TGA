"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Gates its children behind Supabase Auth's native TOTP MFA (real
 * enroll/challenge/verify calls, not a UI mock). Used to require MFA for
 * admin-only actions (Prompt 2) without forcing it on every staff sign-in —
 * ordinary staff never see this, since it's only rendered around admin UI.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [aal, setAal] = useState<"aal1" | "aal2" | "loading">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshLevel() {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal((data?.currentLevel as "aal1" | "aal2") || "aal1");
  }

  useEffect(() => {
    if (!supabase) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial security-level check, not a render-cycle state sync
    refreshLevel();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) setFactorId(verified.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [supabase]);

  async function startEnroll() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (enrollErr || !data) {
      setError("Couldn't start MFA enrollment. Try again.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function startChallenge() {
    if (!supabase || !factorId) return;
    setBusy(true);
    setError(null);
    const { data, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    setBusy(false);
    if (challengeErr || !data) {
      setError("Couldn't start the MFA challenge. Try again.");
      return;
    }
    setChallengeId(data.id);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyErr } = challengeId
      ? await supabase.auth.mfa.verify({ factorId, challengeId, code })
      : await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyErr) {
      setError("That code didn't work — check your authenticator app and try again.");
      return;
    }
    setCode("");
    setQrCode(null);
    setChallengeId(null);
    await refreshLevel();
  }

  if (aal === "loading") return <p className="text-sm text-ink/60">Checking security requirements…</p>;
  if (aal === "aal2") return <>{children}</>;

  return (
    <div className="rounded-2xl border border-gold-500/40 bg-gold-50 p-6">
      <h3 className="font-serif text-lg font-semibold text-ink">Admin actions require MFA</h3>
      <p className="mt-1 text-sm text-ink/70">
        Set up an authenticator app (Google Authenticator, Authy, 1Password, etc.) to continue.
      </p>

      {!factorId && (
        <button type="button" onClick={startEnroll} disabled={busy} className="mt-4 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
          {busy ? "Starting…" : "Set up authenticator app"}
        </button>
      )}

      {factorId && !qrCode && !challengeId && (
        <button type="button" onClick={startChallenge} disabled={busy} className="mt-4 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
          {busy ? "Starting…" : "Enter your authenticator code"}
        </button>
      )}

      {qrCode && (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns this as a raw SVG data URI, not a static asset */}
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-40 w-40 rounded-lg border border-gold-light/50 bg-white p-2" />
          {secret && <p className="mt-2 text-xs text-ink/60">Or enter this key manually: <code className="font-mono">{secret}</code></p>}
        </div>
      )}

      {(qrCode || challengeId) && (
        <form onSubmit={verifyCode} className="mt-4 flex items-end gap-2">
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
            Verify
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
