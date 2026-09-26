/**
 * Client-side half of the "remember this device" MFA mechanism (see
 * supabase/migrations/0017_trusted_devices.sql for the server side and the
 * full reasoning). Only ever stores a random, opaque token — never
 * anything that identifies the device on its own (no user agent string, no
 * fingerprinting) and never the password/session token itself.
 *
 * Storage choice: localStorage, not a cookie. This site is a static export
 * with no server (see next.config.ts) — there is nothing that ever reads a
 * cookie server-side here, so a `document.cookie` value would carry the
 * `Secure; SameSite=Strict` attributes but gain none of a cookie's actual
 * benefit (a real httpOnly cookie set by a server) while adding exposure a
 * cookie doesn't need (it would still be readable by any script, exactly
 * like localStorage, but ALSO gets attached to every same-site request,
 * which nothing here needs). localStorage is therefore the more honest
 * choice for this architecture. Trade-off, stated plainly: clearing site
 * data / private browsing / a different browser all "forget" the device,
 * which fails SAFE (back to a full MFA challenge), never open.
 */
const STORAGE_KEY = "tga_learn_device_token_v1";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads the existing device token for this browser, if any. Never creates one. */
export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Reads the existing token, or mints and stores a new one. */
export function getOrCreateDeviceToken(): string | null {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const token = randomToken();
    localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // Storage unavailable (private mode, blocked, quota) — MFA will simply
    // be re-demanded every sign-in for this browser, which is the safe
    // direction to fail in.
    return null;
  }
}

/** Clears the locally-stored token (and remembered row id) only — the caller is responsible for also revoking the DB row if that's the intent. */
export function clearDeviceTokenLocally(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ROW_ID_KEY);
  } catch {
    // ignore
  }
}

const ROW_ID_KEY = "tga_learn_device_row_id_v1";

/** Remembers which trusted_devices row id is "this browser", for the account page's device list to highlight. Best-effort only — never trusted for anything security-relevant. */
export function setStoredDeviceRowId(id: string): void {
  try {
    localStorage.setItem(ROW_ID_KEY, id);
  } catch {
    // ignore
  }
}

export function getStoredDeviceRowId(): string | null {
  try {
    return localStorage.getItem(ROW_ID_KEY);
  } catch {
    return null;
  }
}

/** A human-readable label for the device list, best-effort only. */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent || "";
  const platform = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${browser} on ${platform}`;
}
