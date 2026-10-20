"use client";

import { useEffect, useRef, useState } from "react";

/** Arabic-Indic / Persian digits (e.g. from an Arabic keyboard) as 0-9. */
function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Exactly 6-digit entry. Type it on the keyboard (the field is focused as
 * soon as the screen opens, any keyboard layout works, and the 6th digit
 * submits by itself), or tap the on-screen keypad on a phone or tablet.
 */
export function PinPad({
  onSubmit,
  busy,
  error,
  submitLabel = "Unlock",
}: {
  onSubmit: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
  submitLabel?: string;
}) {
  const [pin, setPin] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Ready to type straight away.
  useEffect(() => {
    input.current?.focus();
  }, []);

  // Clear the entry after a failed attempt.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on error
    if (error) setPin("");
    input.current?.focus();
  }, [error]);

  const update = (next: string) => {
    const clean = westernDigits(next).replace(/\D/g, "").slice(0, 6);
    setPin(clean);
    input.current?.focus();
    if (clean.length === 6 && !busy) onSubmit(clean);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"];
  return (
    <form
      className="mx-auto w-full max-w-[16rem]"
      onSubmit={(e) => {
        e.preventDefault();
        if (pin.length === 6 && !busy) onSubmit(pin);
      }}
    >
      <label className="sr-only" htmlFor="pin-entry">
        6-digit PIN
      </label>
      <input
        id="pin-entry"
        ref={input}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={pin}
        onChange={(e) => update(e.target.value)}
        className="mb-3 block w-full rounded-xl border border-gold-light bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
      />
      <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`h-3 w-3 rounded-full border ${i < pin.length ? "border-teal-700 bg-teal-700" : "border-ink/40 bg-transparent"}`} />
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-center text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) =>
          k === "del" ? (
            <button key={k} type="button" aria-label="Delete" onClick={() => update(pin.slice(0, -1))} className="h-14 rounded-xl bg-cream text-lg text-ink hover:bg-gold-light/50">
              ⌫
            </button>
          ) : k === "go" ? (
            <button key={k} type="submit" disabled={busy || pin.length !== 6} className="h-14 rounded-xl bg-gold-700 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
              {busy ? "…" : submitLabel}
            </button>
          ) : (
            <button key={k} type="button" onClick={() => update(pin + k)} className="h-14 rounded-xl bg-cream text-xl font-semibold text-ink hover:bg-gold-light/50">
              {k}
            </button>
          ),
        )}
      </div>
    </form>
  );
}
