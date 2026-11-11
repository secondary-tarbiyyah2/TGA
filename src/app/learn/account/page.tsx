"use client";

import { Loading } from "@/components/learn/kit";
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
import { PushOptIn } from "@/components/learn/PushOptIn";
import { MySignatureSettings } from "@/components/learn/documents/MySignatureSettings";
import { SettingsGroup } from "@/components/learn/templates/parts";
import { ui } from "@/components/learn/ui";

/**
 * The signed-in user's OWN account settings, password only, since MFA was
 * removed app-wide (see supabase/migrations/0020_remove_mfa.sql), 
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
    <div data-guide="account-password">
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
        <PasswordInput label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <PasswordInput label="Confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        <button type="submit" disabled={busy} className={ui.btnPrimary}>
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
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[{ label: "Home", href: roles[0] ? "/" : "/login" }, { label: "Your account" }]}
        title="Your account"
        subtitle={`${session && session !== "loading" ? session.user.email : ""} · ${roles.map((r) => learnRoleLabel(r.role)).join(", ") || "no portal role yet"}`}
      />
      <div className="rounded-2xl border border-gold-light bg-white px-4 py-5 sm:px-6">
        <SettingsGroup title="Password" description="The password you sign in with.">
          <ChangePassword />
        </SettingsGroup>
        {session && session !== "loading" && !roles.every((r) => r.role === "student") && (
          <SettingsGroup title="Messages" description="Read receipts, and when you are emailed about new messages.">
            <MessageSettings userId={session.user.id} />
          </SettingsGroup>
        )}
        {session && session !== "loading" && !roles.every((r) => r.role === "student") && (
          <SettingsGroup title="Notifications" description="A notification on this device when a message arrives. Set on each device you use.">
            <PushOptIn variant="setting" />
          </SettingsGroup>
        )}
        {session && session !== "loading" && roles.some((r) => ["head_teacher", "admin", "teacher", "teaching_assistant_cover"].includes(r.role)) && (
          <SettingsGroup title="Your signature" description="Added to Star of the Week certificates you sign, and offered when you sign documents in the portal.">
            <MySignatureSettings userId={session.user.id} />
          </SettingsGroup>
        )}
        {session && session !== "loading" && roles.some((r) => r.role === "parent") && (
          <SettingsGroup title="Parent PIN" description="Stops children opening your family area on a device you share.">
            <ParentPinSettings userId={session.user.id} />
          </SettingsGroup>
        )}
        {roles.some((r) => r.role === "parent") && (
          <SettingsGroup title="Weekly email" description="A summary of your children's week.">
            <DigestPreference />
          </SettingsGroup>
        )}
        <SettingsGroup title="Your feedback" description="Problems you've reported and ideas you've shared, with our replies.">
          <Link href="/feedback" className={ui.btnSecondary}>
            Open your feedback
          </Link>
        </SettingsGroup>
      </div>
    </div>
  );
}

export default function LearnAccountPage() {
  const { session } = useLearnSession();

  return (
    <section className="app-pad">
      {session === "loading" && <Loading label="Loading…" bare />}
      {session === null && (
        <p className="text-ink/65">
          Please <Link href="/login" className="text-gold-700 underline">sign in</Link> to manage your account.
        </p>
      )}
      {session && session !== "loading" && <AccountContent />}
    </section>
  );
}
