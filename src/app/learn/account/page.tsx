"use client";

import { useState } from "react";
import Link from "next/link";
import { useLearnSession, learnRoleLabel } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPasswordError, passwordProblem } from "@/lib/learn/passwordRules";
import { PasswordChecklist } from "@/components/learn/PasswordChecklist";
import { PasswordInput } from "@/components/learn/PasswordInput";
import { ParentPinSettings } from "@/components/learn/pin/ParentPinSettings";
import { DigestPreference } from "@/components/learn/rewards/DigestPreference";
import { MessageSettings } from "@/components/learn/messages/MessageSettings";
import { PageHeader } from "@/components/learn/PageHeader";

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
  const [failed, setFailed] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setMessage("The sign-in service isn't available right now. Reload the page and try again.");
      setFailed(true);
      return;
    }
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setMessage(problem);
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage(null);
    let error: unknown = null;
    try {
      const res = await supabase.auth.updateUser({ password });
      error = res.error;
    } catch (err) {
      error = err;
    }
    setBusy(false);
    if (error) {
      setMessage(friendlyPasswordError(error, "change"));
      setFailed(true);
      return;
    }
    setPassword("");
    setConfirm("");
    setFailed(false);
    setMessage("Your password has been changed.");
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Password</h2>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-2">
        <PasswordInput label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <PasswordInput label="Confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
      <div className="mt-3">
        <PasswordChecklist password={password} confirm={confirm} />
      </div>
      {message && (
        <p role={failed ? "alert" : "status"} className={`mt-2 text-sm ${failed ? "text-red-700" : "text-teal-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function AccountContent() {
  const { session, roles } = useLearnSession();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        crumbs={[{ label: "Home", href: roles[0] ? "/" : "/login" }, { label: "Your account" }]}
        title="Your account"
        subtitle={`${session && session !== "loading" ? session.user.email : ""} · ${roles.map((r) => learnRoleLabel(r.role)).join(", ") || "no portal role yet"}`}
      />
      <ChangePassword />
      {session && session !== "loading" && !roles.every((r) => r.role === "student") && <MessageSettings userId={session.user.id} />}
      {session && session !== "loading" && roles.some((r) => r.role === "parent") && <ParentPinSettings userId={session.user.id} />}
      {roles.some((r) => r.role === "parent") && <DigestPreference />}
      <Link href="/feedback" className="flex items-center justify-between gap-3 rounded-2xl border border-gold-light bg-white p-6 hover:bg-cream">
        <span>
          <span className="block text-h3 font-semibold text-ink">Your feedback</span>
          <span className="mt-1 block text-sm text-ink/70">Problems you&apos;ve reported and ideas you&apos;ve shared, with our replies.</span>
        </span>
        <span aria-hidden="true" className="text-teal-700">
          &rarr;
        </span>
      </Link>
    </div>
  );
}

export default function LearnAccountPage() {
  const { session } = useLearnSession();

  return (
    <section className="app-pad">
      {session === "loading" && <p className="text-ink/65">Loading…</p>}
      {session === null && (
        <p className="text-ink/65">
          Please <Link href="/login" className="text-gold-700 underline">sign in</Link> to manage your account.
        </p>
      )}
      {session && session !== "loading" && <AccountContent />}
    </section>
  );
}
