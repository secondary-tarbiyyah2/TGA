"use client";

import { useEffect, useState } from "react";

export const CONSENT_STORAGE_KEY = "tga-cookie-consent";
export const CONSENT_EVENT = "tga-cookie-consent";
/** Fired by the footer's "Cookie settings" link to show the banner again. */
export const REOPEN_EVENT = "tga-cookie-reopen";

type Consent = "accepted" | "rejected";

/** Clears the stored choice and shows the banner again (footer "Cookie settings"). */
export function reopenCookieConsent() {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* fine */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: "rejected" }));
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reading localStorage requires the client, so whether to show the banner can only be
    // known post-mount, an effect (not a lazy initializer) is the correct tool here.
    let shouldShow = true;
    try {
      shouldShow = !window.localStorage.getItem(CONSENT_STORAGE_KEY);
    } catch {
      shouldShow = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consent must be read from localStorage, which isn't available during SSR/lazy-init
    setVisible(shouldShow);
    const reopen = () => setVisible(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  function choose(consent: Consent) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
    } catch {
      // Storage unavailable (private browsing etc.) · still honour the choice for this visit.
    }
    setVisible(false);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  }

  if (!visible) return null;

  // Sits above the phone CTA bar (its height plus the home-indicator safe
  // area), and in the bottom-left corner on larger screens.
  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="shadow-warm fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] max-w-[420px] rounded-2xl border border-gold-light/50 bg-white p-5 sm:inset-x-auto sm:left-4 md:bottom-4"
    >
      <p className="text-sm text-ink/80">
        We use essential cookies to run this site, and (with your consent) analytics to understand how
        it&apos;s used. You can change your choice at any time from &ldquo;Cookie settings&rdquo; in the footer, see our{" "}
        <a href="/legal/cookies/" className="underline text-gold-700">
          Cookie Policy
        </a>
        .
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => choose("rejected")}
          className="min-h-11 rounded-full border border-gold-500 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-cream"
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="min-h-11 rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-ink-900 hover:brightness-95"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
