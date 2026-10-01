"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PinPad } from "./PinPad";
import {
  PIN_IDLE_MS,
  PIN_LOCK_EVENT,
  dismissPrompt,
  knownHasPin,
  lockPin,
  promptDismissed,
  readUnlocked,
  touchUnlocked,
  useHasPin,
} from "./pinState";

/**
 * Full-screen Parent PIN gate in front of /family/*. UX protection against
 * children on a shared device, not a server security boundary (RLS still
 * guards the data). Fail-open on RPC errors unless a PIN is known to exist.
 */
export function FamilyPinGate({ children }: { children: React.ReactNode }) {
  const { session, roles, rolesLoaded } = useLearnSession();
  const user = session && session !== "loading" ? session.user : null;
  const uid = user?.id ?? null;
  const isParent = roles.some((r) => r.role === "parent");
  const { has, error: hasErr, loaded, reload } = useHasPin(uid, !!uid && rolesLoaded && isParent);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);

  const known = uid ? knownHasPin(uid) : false;
  const pinExists = has === true || (has === null && hasErr && known);

  useEffect(() => {
    if (!uid) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading sessionStorage after mount
    setUnlocked(readUnlocked(uid) !== null);
    setDismissed(promptDismissed(uid));
  }, [uid]);

  // Idle expiry + activity refresh + explicit Lock from the account menu.
  useEffect(() => {
    if (!uid || !unlocked) return;
    let last = 0;
    const bump = () => {
      const now = Date.now();
      if (now - last > 10_000) {
        last = now;
        touchUnlocked(uid);
      }
    };
    const check = () => {
      if (readUnlocked(uid) === null) setUnlocked(false);
    };
    const onLock = () => setUnlocked(false);
    const evs = ["pointerdown", "keydown", "scroll"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    window.addEventListener(PIN_LOCK_EVENT, onLock);
    const t = window.setInterval(check, 15_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener(PIN_LOCK_EVENT, onLock);
      window.clearInterval(t);
    };
  }, [uid, unlocked]);

  const submit = useCallback(
    async (pin: string) => {
      const supabase = getSupabaseClient();
      if (!supabase || !uid) return;
      setBusy(true);
      setErr(null);
      const { data, error } = await supabase.rpc("verify_my_pin", { p_pin: pin });
      setBusy(false);
      if (error) {
        setErr("We couldn't check your PIN just now. Please try again.");
        return;
      }
      if (data === true) {
        touchUnlocked(uid);
        setUnlocked(true);
        return;
      }
      const { data: rem } = await supabase.rpc("my_pin_lock_remaining");
      const secs = typeof rem === "number" ? rem : 0;
      setErr(secs > 0 ? `Too many wrong attempts. Try again in ${Math.ceil(secs / 60)} minute(s).` : "That PIN isn't right.");
    },
    [uid],
  );

  // Not a parent (or still working it out): never block. Parent roles load
  // before the RPC, so hold the page back only while we genuinely don't know.
  if (!user || !rolesLoaded || !isParent) return <>{children}</>;
  if (!loaded) return <p className="py-10 text-center text-sm text-ink/60">Loading…</p>;

  if (pinExists && !unlocked) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white px-4">
        <h1 className="font-serif text-h2 font-semibold text-ink">Parent PIN</h1>
        <p className="mb-6 mt-1 max-w-xs text-center text-sm text-ink/60">Enter your PIN to open the family area.</p>
        {hasErr && !has && <p className="mb-3 text-center text-sm text-red-700">We couldn&apos;t reach the server to check your PIN settings.</p>}
        <PinPad onSubmit={submit} busy={busy} error={err} />
        <div className="mt-6 flex gap-4 text-xs text-ink/55">
          {hasErr && (
            <button type="button" onClick={() => void reload()} className="underline">
              Retry
            </button>
          )}
          <Link href="/" className="underline">
            Back
          </Link>
        </div>
        <p className="mt-3 max-w-xs text-center text-xs text-ink/45">Forgotten your PIN? Ask the Headteacher to reset it.</p>
      </div>
    );
  }

  return (
    <>
      {has === false && !dismissed && uid && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold-light bg-cream px-4 py-3 text-sm text-ink">
          <span className="flex-1">Sharing this device with your children? Set a Parent PIN so they can&apos;t open your family area.</span>
          <Link href="/account" className="font-semibold text-gold-700 underline">
            Set a PIN
          </Link>
          <button
            type="button"
            onClick={() => {
              dismissPrompt(uid);
              setDismissed(true);
            }}
            className="text-ink/60 underline"
          >
            Not now
          </button>
        </div>
      )}
      {children}
    </>
  );
}

export { lockPin };
