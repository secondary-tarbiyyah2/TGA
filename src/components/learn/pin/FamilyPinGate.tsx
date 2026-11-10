"use client";

import { Loading } from "@/components/learn/kit";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { friendlyPinError } from "@/lib/learn/passwordRules";
import { PinPad } from "./PinPad";
import { PinSetup } from "./PinSetup";
import { PIN_LOCK_EVENT, knownHasPin, lockPin, readUnlocked, rememberHasPin, touchUnlocked, useHasPin } from "./pinState";

// Leaving the family area (switching to the student/teacher/admin area, or
// signing out) locks it again. The lock is scheduled for the next tick and
// cancelled by a re-mount, so React strict-mode's mount/unmount/mount in
// development doesn't lock a gate that is merely being re-created.
let pendingLock: ReturnType<typeof setTimeout> | null = null;

/**
 * Full-screen Parent PIN gate in front of /family/*. UX protection against
 * children on a shared device, not a server security boundary (RLS still
 * guards the data).
 *
 *  - The PIN is optional: children have their own logins, so it is only for
 *    parents who share a device with them. Turned on/off in Account.
 *  - An older 4-5 digit PIN is accepted once, then must be replaced by a
 *    6-digit one before entry.
 *  - Every time the user switches into the family area the PIN is asked
 *    again (leaving the area locks it), and it also re-locks after 5 idle
 *    minutes.
 *  - Fails open only when the PIN service can't be reached AND no PIN is
 *    known to exist, so an outage never locks every parent out.
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
  // Set after a correct old-format PIN: it's the "current PIN" for the forced re-set.
  const [legacyPin, setLegacyPin] = useState<string | null>(null);

  const known = uid ? knownHasPin(uid) : false;
  const pinExists = has === true || (has === null && hasErr && known);

  useEffect(() => {
    if (!uid) return;
    if (pendingLock) {
      clearTimeout(pendingLock);
      pendingLock = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading sessionStorage after mount
    setUnlocked(readUnlocked(uid) !== null);
    return () => {
      pendingLock = setTimeout(() => {
        pendingLock = null;
        lockPin(uid);
      }, 0);
    };
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
      if (error) {
        setBusy(false);
        setErr("We couldn't check your PIN just now. Please try again.");
        return;
      }
      if (data === true) {
        // An old 4-5 digit PIN verifies once, then must be replaced.
        const st = await supabase.rpc("my_pin_status");
        setBusy(false);
        if (st.data === "reset" || !/^[0-9]{6}$/.test(pin)) {
          setLegacyPin(pin);
          return;
        }
        touchUnlocked(uid);
        setUnlocked(true);
        return;
      }
      const { data: rem } = await supabase.rpc("my_pin_lock_remaining");
      setBusy(false);
      const secs = typeof rem === "number" ? rem : 0;
      setErr(secs > 0 ? `Too many wrong attempts. Try again in ${Math.ceil(secs / 60)} minute(s).` : "That PIN isn't right.");
    },
    [uid],
  );

  const savePin = useCallback(
    async (pin: string, current: string | null): Promise<string | null> => {
      const supabase = getSupabaseClient();
      if (!supabase || !uid) return "We couldn't save your PIN just now. Please try again.";
      const { error } = await supabase.rpc("set_my_pin", { p_pin: pin, p_current: current });
      if (error) return friendlyPinError(error);
      rememberHasPin(uid, true);
      setLegacyPin(null);
      touchUnlocked(uid);
      setUnlocked(true);
      void reload();
      return null;
    },
    [uid, reload],
  );

  // Not a parent (or still working it out): never block. Parent roles load
  // before the RPC, so hold the page back only while we genuinely don't know.
  if (!user || !rolesLoaded || !isParent) return <>{children}</>;
  if (!loaded) return <Loading label="Loading…" bare />;

  // Optional (since Oct 2026): with no PIN the family area simply opens. Parents
  // who share a device with their children can turn one on in Account.

  if (legacyPin !== null) {
    return (
      <PinSetup
        title="Choose a new 6-digit PIN"
        intro="PINs are now exactly 6 digits. Please replace your old PIN to continue."
        save={(pin) => savePin(pin, legacyPin)}
      />
    );
  }

  if (pinExists && !unlocked) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white px-4">
        <h1 className="font-serif text-h2 font-semibold text-ink">Parent PIN</h1>
        <p className="mb-6 mt-1 max-w-xs text-center text-sm text-ink/65">Enter your 6-digit PIN to open the family area.</p>
        {hasErr && !has && <p className="mb-3 text-center text-sm text-red-700">We couldn&apos;t reach the server to check your PIN settings.</p>}
        <PinPad onSubmit={submit} busy={busy} error={err} />
        <div className="mt-6 flex gap-4 text-xs text-ink/65">
          {hasErr && (
            <button type="button" onClick={() => void reload()} className="underline">
              Retry
            </button>
          )}
          <Link href="/" className="underline">
            Back
          </Link>
        </div>
        <p className="mt-3 max-w-xs text-center text-xs text-ink/65">Forgotten your PIN? Ask the Headteacher to reset it.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export { lockPin };
