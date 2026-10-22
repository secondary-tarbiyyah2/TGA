"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: string };

/** A password box with a Show/Hide button. The label wraps the input so screen readers announce it. */
export function PasswordInput({ label, hint, className, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className="block text-sm font-medium text-ink">
      <label htmlFor={id}>{label}</label>
      <div className="relative mt-1">
        <input
          {...rest}
          id={id}
          type={shown ? "text" : "password"}
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full rounded-lg border border-gold-light/60 py-2 pl-3 pr-16 ${className || ""}`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-xs font-semibold text-ink/65 hover:text-ink"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs font-normal text-ink/65">
          {hint}
        </p>
      )}
    </div>
  );
}
