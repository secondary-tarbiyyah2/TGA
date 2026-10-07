"use client";

import { passwordChecks } from "@/lib/learn/passwordRules";

/** Live requirements list. Pass `confirm` to also show the "both boxes match" row. */
export function PasswordChecklist({ password, confirm }: { password: string; confirm?: string }) {
  const checks = passwordChecks(password, confirm);
  const touched = password.length > 0 || (confirm?.length ?? 0) > 0;
  return (
    <ul aria-label="Password requirements" className="space-y-1 text-sm">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? "text-teal-700" : touched ? "text-red-700" : "text-ink/60"}>
          <span aria-hidden="true">{c.ok ? "✓" : touched ? "✗" : "•"}</span> {c.label}
          <span className="sr-only">{c.ok ? " (done)" : " (not yet)"}</span>
        </li>
      ))}
    </ul>
  );
}
