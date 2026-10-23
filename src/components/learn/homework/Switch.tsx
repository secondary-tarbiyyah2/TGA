"use client";

import { SwitchKnob } from "@/components/learn/ui";

/** A labelled on/off switch (use instead of a checkbox for yes/no options). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="text-xs text-ink/65">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="shrink-0 disabled:opacity-50">
        <SwitchKnob checked={checked} />
      </button>
    </div>
  );
}
