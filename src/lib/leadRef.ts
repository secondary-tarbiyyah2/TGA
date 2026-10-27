"use client";

/**
 * A short, stable reference derived from an email address, so a person who
 * both registers interest and later submits the full application shows up
 * as the same lead in the admissions inbox / CRM, without needing a
 * database of our own.
 *
 * This site's only backend is public/register.php and public/apply.php, 
 * two stateless mail senders (see README "Forms & email"), with an
 * optional forward to an external CRM webhook if one is configured
 * (mailer_forward_to_crm). Neither script has, or can safely gain, a
 * datastore of its own on this shared host. Given that, the honest way to
 * get "one lead, not two disconnected entries" is:
 *  1. Both forms send the same deterministic reference for a given email
 *     (this function), included in the emailed text and in the CRM
 *     forward's payload, so a human, or a real CRM, can match the two
 *     submissions on sight/by field, even though this site never stores
 *     either one itself.
 *  2. On the same device, the application form pre-fills from a prior
 *     register-interest submission (see ApplicationForm), so the family
 *     doesn't have to retype what they already told us.
 * True server-side deduplication (one row updated in place) would need an
 * actual datastore behind these endpoints, out of scope for a static
 * export with no server-side state.
 */
export async function leadRef(email: string): Promise<string> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return "";
  try {
    const data = new TextEncoder().encode(normalised);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 8);
  } catch {
    // Web Crypto unavailable (very old browser) · fall back to a cheap,
    // still-deterministic, non-cryptographic hash rather than send nothing.
    let hash = 0;
    for (let i = 0; i < normalised.length; i++) {
      hash = (hash * 31 + normalised.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
}

export type StoredRegisterInterest = {
  parent_name: string;
  email: string;
  phone: string;
  yeargroup: string;
  lead_ref: string;
};

const STORAGE_KEY = "tga_register_interest";

/** Best-effort only, see artifact/browser-storage guidance: never required for correctness. */
export function saveRegisterInterest(data: StoredRegisterInterest) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private browsing / storage blocked, the form still worked, this is just a convenience.
  }
}

export function readRegisterInterest(): StoredRegisterInterest | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
