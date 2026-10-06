"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnSession } from "@/lib/learn/session";

/**
 * First sign-in for a pupil with a username login: the temporary password the
 * school generated has to be replaced with one only they know. The login page
 * sends them here while student_logins.must_change_password is true.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { session } = useLearnSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setBusy(false);
      setError("Couldn't change your password. Please try again.");
      return;
    }
    // Clears the "must change" flag. If this fails the pupil is only asked again next time.
    await supabase.rpc("student_login_password_changed");
    setBusy(false);
    router.replace("/");
  }

  if (session === "loading") return <p className="text-ink/60">Loading…</p>;
  if (!session) {
    return (
      <section className="app-pad">
        <div className="mx-auto max-w-sm">
          <p className="text-ink/60">Please sign in first.</p>
          <Link href="/login" className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
            Go to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="app-pad">
      <div className="mx-auto max-w-sm">
        <h1 className="font-serif text-h2 font-semibold text-ink">Choose your own password</h1>
        <p className="mt-1 text-sm text-ink/60">The password the school gave you was only temporary. Choose a new one that you will remember. Don&apos;t share it with anyone.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-ink">
            New password
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-ink">
            Type it again
            <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-gold-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-60">
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </section>
  );
}
