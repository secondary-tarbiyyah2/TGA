"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPinError, pinProblem } from "@/lib/learn/passwordRules";
import { rememberHasPin, useHasPin } from "./pinState";

export function ParentPinSettings({ userId }: { userId: string }) {
  const supabase = getSupabaseClient();
  const { has, status, error: loadErr, reload } = useHasPin(userId, true);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const turnOff = async () => {
    if (!supabase) return;
    if (!/^[0-9]{4,6}$/.test(current)) return setMessage("Type your current PIN above to turn it off.");
    setRemoving(true);
    setMessage(null);
    const { error } = await supabase.rpc("remove_my_pin", { p_current: current });
    setRemoving(false);
    if (error) return setMessage(error.message.includes("isn't right") ? "That PIN isn't right." : "Couldn't turn the PIN off just now. Please try again.");
    rememberHasPin(userId, false);
    setCurrent("");
    setMessage("Parent PIN turned off.");
    void reload();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const problem = pinProblem(pin, confirm);
    if (problem) return setMessage(problem);
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("set_my_pin", { p_pin: pin, p_current: has ? current : null });
    setBusy(false);
    if (error) return setMessage(friendlyPinError(error));
    rememberHasPin(userId, true);
    setCurrent("");
    setPin("");
    setConfirm("");
    setMessage(has ? "PIN changed." : "PIN set.");
    void reload();
  };

  const field = "mt-1 block w-28 rounded-lg border border-gold-light/60 px-3 py-2 tracking-widest";
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Parent PIN</h2>
      <p className="mt-1 text-sm text-ink/65">
        Optional. Your children have their own logins, so you only need a PIN if they also use a device you are signed in on: it stops them opening your family area.
        {has ? " Your PIN is on." : " It's off."}
        {status === "reset" ? " Your current PIN is an older, shorter one: please change it to 6 digits below." : ""} If you forget it, the Headteacher can reset it.
      </p>
      {loadErr && <p className="mt-2 text-sm text-red-700">Couldn&apos;t check PIN status. Try reloading.</p>}
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        {has && (
          <label className="text-sm text-ink">
            Current PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} autoComplete="off" className={field} />
          </label>
        )}
        <label className="text-sm text-ink">
          New PIN
          <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoComplete="off" className={field} />
        </label>
        <label className="text-sm text-ink">
          Confirm
          <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} autoComplete="off" className={field} />
        </label>
        <button type="submit" disabled={busy || has === null} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-900 disabled:opacity-60">
          {busy ? "Saving…" : has ? "Change PIN" : "Turn on a PIN"}
        </button>
        {has && (
          <button type="button" disabled={removing} onClick={turnOff} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-60">
            {removing ? "Turning off…" : "Turn PIN off"}
          </button>
        )}
      </form>
      {message && <p className="mt-2 text-sm text-ink/70">{message}</p>}
    </div>
  );
}
