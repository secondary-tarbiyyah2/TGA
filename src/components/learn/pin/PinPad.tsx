"use client";

import { useEffect, useState } from "react";

/** Exactly 6-digit entry with an on-screen keypad (and physical keyboard support). */
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") setPin((p) => {
        if (p.length === 6 && !busy) onSubmit(p);
        return p;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSubmit, busy]);

  // Clear the entry after a failed attempt.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on error
    if (error) setPin("");
  }, [error]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "go"];
  return (
    <div className="mx-auto w-full max-w-[16rem]">
      <div className="mb-4 flex justify-center gap-2" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={`h-3 w-3 rounded-full border border-ink/40 ${i < pin.length ? "bg-teal-700 border-teal-700" : "bg-transparent"}`} />
        ))}
      </div>
      {error && <p role="alert" className="mb-3 text-center text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) =>
          k === "del" ? (
            <button key={k} type="button" aria-label="Delete" onClick={() => setPin((p) => p.slice(0, -1))} className="h-14 rounded-xl bg-cream text-lg text-ink hover:bg-gold-light/50">
              ⌫
            </button>
          ) : k === "go" ? (
            <button
              key={k}
              type="button"
              disabled={busy || pin.length !== 6}
              onClick={() => onSubmit(pin)}
              className="h-14 rounded-xl bg-gold-700 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50"
            >
              {busy ? "…" : submitLabel}
            </button>
          ) : (
            <button key={k} type="button" onClick={() => setPin((p) => (p.length < 6 ? p + k : p))} className="h-14 rounded-xl bg-cream text-xl font-semibold text-ink hover:bg-gold-light/50">
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
