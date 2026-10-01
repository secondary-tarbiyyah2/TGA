"use client";

import { useState } from "react";
import Link from "next/link";
import { useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ParentPinSettings } from "@/components/learn/pin/ParentPinSettings";
import { MessageSettings } from "@/components/learn/messages/MessageSettings";

/**
 * The signed-in user's OWN account settings — password only, since MFA was
 * removed app-wide (see supabase/migrations/0020_remove_mfa.sql) —
 * deliberately separate from `/admin/settings` (site-wide LMS settings such
 * as recording retention), and open to every /learn role, not just admin.
 * Before this page existed there was no personal-account entry point at
 * all: an admin could edit SITE settings but not their own password.
 * Reached from the account menu in every /learn area's top bar (see
 * src/app/learn/layout.tsx + LearnAccountMenu.tsx).
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
        <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </div>
  );
}

function AccountContent() {
  const { session, roles } = useLearnSession();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Your account</h1>
        <p className="mt-1 text-sm text-ink/60">
          {session && session !== "loading" ? session.user.email : ""} — {roles.map((r) => learnRoleLabel(r.role)).join(", ") || "no /learn role yet"}
        </p>
        <p className="mt-2 text-xs text-ink/50">
          <Link href={roles[0] ? "/" : "/login"} className="text-gold-700 underline">
            Back to your dashboard
          </Link>
        </p>
      </div>
      <ChangePassword />
      {session && session !== "loading" && !roles.every((r) => r.role === "student") && <MessageSettings userId={session.user.id} />}
      {session && session !== "loading" && roles.some((r) => r.role === "parent") && <ParentPinSettings userId={session.user.id} />}
    </div>
  );
}

export default function LearnAccountPage() {
  const { session } = useLearnSession();

  return (
    <section className="app-pad">
      {session === "loading" && <p className="text-ink/60">Loading…</p>}
      {session === null && (
        <p className="text-ink/60">
          Please <Link href="/login" className="text-gold-700 underline">sign in</Link> to manage your account.
        </p>
      )}
      {session && session !== "loading" && <AccountContent />}
    </section>
  );
}
