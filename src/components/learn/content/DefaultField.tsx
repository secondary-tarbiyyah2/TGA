"use client";

import { PREFILLED_HELP } from "@/content/defaults";

/** Subtle "default" / "edited" badge. */
export function DefaultBadge({ isDefault }: { isDefault: boolean }) {
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${isDefault ? "bg-ink/5 text-ink/50" : "bg-gold-light/40 text-gold-900"}`}>
      {isDefault ? "default" : "edited"}
    </span>
  );
}

export function ResetLink({ show, onReset }: { show: boolean; onReset: () => void }) {
  if (!show) return null;
  return (
    <button type="button" onClick={onReset} className="ml-2 text-xs font-normal text-gold-700 underline">
      Reset to default
    </button>
  );
}

export function PrefilledHelp() {
  return <p className="mb-4 text-xs text-ink/55">{PREFILLED_HELP}</p>;
}

/** Text input/textarea pre-filled with the live default, with badge + reset. */
export function DefaultTextField({
  label, value, def, onChange, multiline, rows = 3, wide, type = "text", hint,
}: {
  label: React.ReactNode;
  value: string | null;
  def: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  wide?: boolean;
  type?: string;
  hint?: string;
}) {
  const v = value ?? "";
  const isDefault = v.trim() === def.trim();
  const cls = "mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2 text-sm";
  return (
    <label className={`text-sm text-ink ${wide || multiline ? "sm:col-span-2" : ""}`}>
      <span>
        {label}
        <DefaultBadge isDefault={isDefault} />
        <ResetLink show={!isDefault} onReset={() => onChange(def)} />
      </span>
      {multiline ? (
        <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={rows} className={cls} />
      ) : (
        <input type={type} value={v} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
      {hint && <span className="mt-0.5 block text-xs text-ink/50">{hint}</span>}
    </label>
  );
}
