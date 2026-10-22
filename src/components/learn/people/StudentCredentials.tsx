"use client";

import { useState } from "react";
import type { IssuedCredentials } from "./studentAccounts";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-lg border border-gold-light bg-white px-2.5 py-1 text-xs font-semibold text-ink/80 hover:bg-cream"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Shows a student's username and temporary password once. The password lives
 * only in this component's props: it is not saved anywhere and cannot be shown
 * again after it is dismissed (a new one can be generated instead).
 */
export function CredentialsCard({ creds, onDismiss }: { creds: IssuedCredentials; onDismiss: () => void }) {
  return (
    <div role="status" className="rounded-xl border border-gold-500/60 bg-cream p-4 text-sm text-ink">
      <p className="font-semibold">
        {creds.kind === "new" ? `Login created for ${creds.childName}` : `New temporary password for ${creds.childName}`}
      </p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <dt className="text-ink/65">Username</dt>
        <dd className="break-all font-mono text-base font-semibold">{creds.username}</dd>
        <dd><CopyButton text={creds.username} label="username" /></dd>
        <dt className="text-ink/65">Temporary password</dt>
        <dd className="break-all font-mono text-base font-semibold">{creds.password}</dd>
        <dd><CopyButton text={creds.password} label="password" /></dd>
      </dl>
      <p className="mt-3 text-xs text-ink/70">
        {creds.emailSent
          ? `Also emailed to ${creds.parentEmail || "the parent"}.`
          : `The email${creds.parentEmail ? ` to ${creds.parentEmail}` : ""} could not be sent${creds.emailError ? ` (${creds.emailError})` : ""}. Pass these details on yourself.`}{" "}
        This is the only time the password is shown. {creds.kind === "new" ? "The pupil" : "They"} will be asked to choose their own the first time they sign in.
      </p>
      <button type="button" onClick={onDismiss} className="mt-3 rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream">
        I have noted these. Dismiss
      </button>
    </div>
  );
}
