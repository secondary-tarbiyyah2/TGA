"use client";

import { useState } from "react";
import { pinProblem } from "@/lib/learn/passwordRules";
import { PinPad } from "./PinPad";
import { PIN_LENGTH } from "./pinState";

/**
 * Two-step "choose a 6-digit PIN" screen: enter, then confirm. `save` returns
 * an error message (or null on success). Used when a parent has no PIN yet and
 * when an old 4-5 digit PIN must be replaced.
 */
export function PinSetup({
  title,
  intro,
  save,
}: {
  title: string;
  intro: string;
  save: (pin: string) => Promise<string | null>;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (pin: string) => {
    if (first === null) {
      const problem = pinProblem(pin);
      if (problem) {
        setErr(problem);
        return;
      }
      setErr(null);
      setFirst(pin);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setErr("The two PINs didn't match. Choose your PIN again and type the same 6 digits both times.");
      return;
    }
    setBusy(true);
    const message = await save(pin);
    setBusy(false);
    if (message) {
      setFirst(null);
      setErr(message);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-white px-4">
      <h1 className="font-serif text-h2 font-semibold text-ink">{title}</h1>
      <p className="mb-2 mt-1 max-w-xs text-center text-sm text-ink/60">{intro}</p>
      <p className="mb-5 text-sm font-medium text-ink">{first === null ? `Choose a ${PIN_LENGTH}-digit PIN` : "Enter it again to confirm"}</p>
      <PinPad key={first === null ? "enter" : "confirm"} onSubmit={onSubmit} busy={busy} error={err} submitLabel={first === null ? "Next" : "Save PIN"} />
      <p className="mt-6 max-w-xs text-center text-xs text-ink/45">Avoid obvious PINs such as 123456 or your child&apos;s birthday. You&apos;ll be asked for it each time you open the family area.</p>
    </div>
  );
}
