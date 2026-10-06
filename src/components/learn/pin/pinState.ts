"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** Exactly this many digits (enforced in the UI and by set_my_pin). */
export const PIN_LENGTH = 6;
/** Short idle limit: the family area locks again after 5 minutes without activity. */
export const PIN_IDLE_MS = 5 * 60 * 1000;
export const PIN_LOCK_EVENT = "learn-pin-lock";
const unlockKey = (uid: string) => `learn.pin.unlocked.${uid}`;
const knownKey = (uid: string) => `learn.pin.has.${uid}`;
const dismissKey = (uid: string) => `learn.pin.prompt-dismissed.${uid}`;

function ss(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
function ls(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Last-activity timestamp while unlocked, or null. */
export function readUnlocked(uid: string): number | null {
  try {
    const v = ss()?.getItem(unlockKey(uid));
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && Date.now() - n < PIN_IDLE_MS ? n : null;
  } catch {
    return null;
  }
}
export function touchUnlocked(uid: string) {
  try {
    ss()?.setItem(unlockKey(uid), String(Date.now()));
  } catch {}
}
export function lockPin(uid: string) {
  try {
    ss()?.removeItem(unlockKey(uid));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PIN_LOCK_EVENT));
}
export function knownHasPin(uid: string): boolean {
  try {
    return ss()?.getItem(knownKey(uid)) === "1";
  } catch {
    return false;
  }
}
export function rememberHasPin(uid: string, has: boolean) {
  try {
    if (has) ss()?.setItem(knownKey(uid), "1");
    else ss()?.removeItem(knownKey(uid));
  } catch {}
}
export function promptDismissed(uid: string): boolean {
  try {
    return ls()?.getItem(dismissKey(uid)) === "1";
  } catch {
    return false;
  }
}
export function dismissPrompt(uid: string) {
  try {
    ls()?.setItem(dismissKey(uid), "1");
  } catch {}
}

export type PinStatus = "none" | "ok" | "reset";

/**
 * my_pin_status(): 'none' (no PIN yet: must create one), 'reset' (old 4-5
 * digit PIN: must choose a 6-digit one at next unlock), 'ok'. Falls back to
 * has_my_pin() if the newer RPC isn't deployed yet. `has` is null while
 * loading / on error (unknown).
 */
export function useHasPin(userId: string | null, enabled: boolean) {
  const [state, setState] = useState<{ has: boolean | null; status: PinStatus | null; error: boolean; loaded: boolean }>({ has: null, status: null, error: false, loaded: false });
  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;
    let status: PinStatus | null = null;
    const st = await supabase.rpc("my_pin_status");
    if (!st.error && (st.data === "none" || st.data === "ok" || st.data === "reset")) {
      status = st.data;
    } else {
      const { data, error } = await supabase.rpc("has_my_pin");
      if (error) {
        setState({ has: null, status: null, error: true, loaded: true });
        return;
      }
      status = data ? "ok" : "none";
    }
    rememberHasPin(userId, status !== "none");
    setState({ has: status !== "none", status, error: false, loaded: true });
  }, [userId]);
  useEffect(() => {
    if (!enabled || !userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount
    void load();
  }, [enabled, userId, load]);
  return { ...state, reload: load };
}
