"use client";

import { passwordChecks, passwordStrength } from "@/lib/learn/passwordRules";

const BAR = ["bg-ink/15", "bg-red-500", "bg-amber-500", "bg-teal-500", "bg-teal-700"];

/** Live strength meter plus requirements list. Pass `confirm` to also show the "both boxes match" row. */
export function PasswordChecklist({ password, confirm }: { password: string; confirm?: string }) {
  const checks = passwordChecks(password, confirm);
  const touched = password.length > 0 || (confirm?.length ?? 0) > 0;
  const strength = passwordStrength(password);
  return (
    <div className="space-y-2">
      {password.length > 0 && (
        <div>
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${strength.score >= i ? BAR[strength.score] : "bg-ink/10"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs text-ink/70" role="status">
            Strength: <span className="font-semibold">{strength.label}</span>
          </p>
        </div>
      )}
      <ul aria-label="Password requirements" className="space-y-1 text-sm">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? "text-teal-700" : touched ? "text-red-700" : "text-ink/60"}>
            <span aria-hidden="true">{c.ok ? "✓" : touched ? "✗" : "•"}</span> {c.label}
            <span className="sr-only">{c.ok ? " (done)" : " (not yet)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
