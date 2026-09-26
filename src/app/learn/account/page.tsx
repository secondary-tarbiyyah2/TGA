"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLearnSession, learnRoleLabel, STAFF_ROLES } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getOrCreateDeviceToken, getDeviceToken, getStoredDeviceRowId, setStoredDeviceRowId, clearDeviceTokenLocally, deviceLabel } from "@/lib/learn/trustedDevice";

/**
 * The signed-in user's OWN account settings — password, MFA, and trusted
 * devices — deliberately separate from `/learn/admin/settings` (site-wide
 * LMS settings such as recording retention), and open to every /learn role,
 * not just admin. Before this page existed there was no personal-account
 * entry point at all: an admin could edit SITE settings but not their own
 * password/MFA. Reached from the account menu in every /learn area's top
 * bar (see src/app/learn/layout.tsx + LearnAccountMenu.tsx).
 */
function ChangePassword() {
  const supabase = getSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setMessage("Choose a password at least 8 characters long.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords don't match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(`Could not change your password: ${error.message}`);
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage("Password changed.");
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Password</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm text-ink">
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2"
          />
        </label>
        <label className="text-sm text-ink">
          Confirm
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="mt-1 block rounded-lg border border-gold-light/60 px-3 py-2"
          />
        </label>
        <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60">
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </div>
  );
}

function MfaManagement() {
  const supabase = getSupabaseClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    setFactorId(verified?.id || null);
    setLoaded(true);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const startEnroll = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error || !data) {
      setMessage("Couldn't start enrollment. Try again.");
      return;
    }
    setPendingFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !pendingFactorId) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactorId, code });
    setBusy(false);
    if (error) {
      setMessage("That code didn't work — check your authenticator app and try again.");
      return;
    }
    setQrCode(null);
    setSecret(null);
    setPendingFactorId(null);
    setCode("");
    setMessage("Authenticator app enrolled.");
    await load();
  };

  const remove = async () => {
    if (!supabase || !factorId) return;
    if (!window.confirm("Remove your authenticator app? You'll be asked to set up a new one next time an admin action needs MFA.")) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      setMessage(`Could not remove: ${error.message}`);
      return;
    }
    setMessage("Authenticator app removed.");
    await load();
  };

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Two-factor authentication (MFA)</h2>
      <p className="mt-1 text-sm text-ink/60">
        {factorId
          ? "An authenticator app is set up on your account. You'll still be asked to confirm a code occasionally — see \"Trusted devices\" below for how often."
          : "Admin actions require an authenticator app (Google Authenticator, Authy, 1Password, etc.)."}
      </p>

      {!factorId && !qrCode && (
        <button type="button" onClick={startEnroll} disabled={busy} className="mt-4 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60">
          {busy ? "Starting…" : "Set up authenticator app"}
        </button>
      )}

      {factorId && (
        <button type="button" onClick={remove} disabled={busy} className="mt-4 rounded-full border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
          Remove authenticator app
        </button>
      )}

      {qrCode && (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns this as a raw SVG data URI, not a static asset */}
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-40 w-40 rounded-lg border border-gold-light/50 bg-white p-2" />
          {secret && <p className="mt-2 text-xs text-ink/60">Or enter this key manually: <code className="font-mono">{secret}</code></p>}
          <form onSubmit={verify} className="mt-4 flex items-end gap-2">
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
            <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60">
              Verify &amp; enable
            </button>
          </form>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-ink/70">{message}</p>}
    </div>
  );
}

type DeviceRow = { id: string; label: string | null; created_at: string; last_used_at: string | null; expires_at: string };

function TrustedDevices() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const thisDeviceRowId = getStoredDeviceRowId();

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("trusted_devices")
      .select("id, label, created_at, last_used_at, expires_at")
      .order("last_used_at", { ascending: false, nullsFirst: false });
    setRows((data as DeviceRow[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const revoke = async (id: string) => {
    if (!supabase) return;
    await supabase.rpc("revoke_trusted_device", { p_id: id });
    if (id === thisDeviceRowId) clearDeviceTokenLocally();
    setMessage("Device forgotten — it will need to confirm MFA again next time.");
    await load();
  };

  const forgetThisDevice = async () => {
    if (!supabase) return;
    const token = getDeviceToken();
    if (token) await supabase.rpc("revoke_device_by_token", { p_token: token });
    clearDeviceTokenLocally();
    setMessage("This device has been forgotten — you'll be asked for an authenticator code again next time.");
    await load();
  };

  const signOutOtherDevices = async () => {
    if (!supabase) return;
    await supabase.rpc("revoke_all_trusted_devices");
    // Re-trust THIS device, since it's the one making the request right
    // now and shouldn't have to immediately re-challenge itself.
    const token = getOrCreateDeviceToken();
    if (token) {
      const { data: rowId } = await supabase.rpc("trust_this_device", { p_token: token, p_label: deviceLabel(), p_days: 30 });
      if (typeof rowId === "string") setStoredDeviceRowId(rowId);
    }
    setMessage("Every other device has been signed out of remembered MFA — they'll need to confirm a code next time.");
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Trusted devices</h2>
      <p className="mt-1 text-sm text-ink/60">
        A device you confirm MFA on is remembered for 30 days, so you&apos;re not asked for a code on every sign-in from it. It
        still expires automatically, and you can forget any device early here.
      </p>

      {rows === null && <p className="mt-3 text-sm text-ink/60">Loading…</p>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-ink/60">No devices are currently remembered — you&apos;ll be asked for a code at your next sign-in.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-light/40 px-3 py-2 text-sm">
              <span>
                {r.label || "Unlabelled device"} {r.id === thisDeviceRowId && <span className="text-xs text-gold-700">(this device)</span>}
                <span className="block text-xs text-ink/50">
                  Last used {r.last_used_at ? new Date(r.last_used_at).toLocaleString("en-GB") : "never"} · expires {new Date(r.expires_at).toLocaleDateString("en-GB")}
                </span>
              </span>
              <button type="button" onClick={() => revoke(r.id)} className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={forgetThisDevice} className="rounded-full border border-gold-light/60 px-4 py-2 text-xs text-ink/70 hover:bg-cream">
          Forget this device
        </button>
        <button type="button" onClick={signOutOtherDevices} className="rounded-full border border-gold-light/60 px-4 py-2 text-xs text-ink/70 hover:bg-cream">
          Sign out other devices
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-ink/70">{message}</p>}
    </div>
  );
}

function AccountContent() {
  const { session, roles } = useLearnSession();
  const hasStaffMfa = roles.some((r) => STAFF_ROLES.includes(r.role));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Your account</h1>
        <p className="mt-1 text-sm text-ink/60">
          {session && session !== "loading" ? session.user.email : ""} — {roles.map((r) => learnRoleLabel(r.role)).join(", ") || "no /learn role yet"}
        </p>
        <p className="mt-2 text-xs text-ink/50">
          <Link href={roles[0] ? "/learn" : "/learn/login"} className="text-gold-700 underline">
            Back to your dashboard
          </Link>
        </p>
      </div>
      <ChangePassword />
      {hasStaffMfa && <MfaManagement />}
      {hasStaffMfa && <TrustedDevices />}
    </div>
  );
}

export default function LearnAccountPage() {
  const { session } = useLearnSession();

  return (
    <section className="section-pad">
      {session === "loading" && <p className="text-ink/60">Loading…</p>}
      {session === null && (
        <p className="text-ink/60">
          Please <Link href="/learn/login" className="text-gold-700 underline">sign in</Link> to manage your account.
        </p>
      )}
      {session && session !== "loading" && <AccountContent />}
    </section>
  );
}
