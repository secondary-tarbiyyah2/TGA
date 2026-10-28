"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tga-cookie-consent";

type Consent = "accepted" | "rejected";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reading localStorage requires the client, so whether to show the banner can only be
    // known post-mount, an effect (not a lazy initializer) is the correct tool here.
    let shouldShow = true;
    try {
      shouldShow = !window.localStorage.getItem(STORAGE_KEY);
    } catch {
      shouldShow = true;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consent must be read from localStorage, which isn't available during SSR/lazy-init
    setVisible(shouldShow);
  }, []);

  function choose(consent: Consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, consent);
    } catch {
      // Storage unavailable (private browsing etc.) · still honour the choice for this visit.
    }
    setVisible(false);
    window.dispatchEvent(new CustomEvent("tga-cookie-consent", { detail: consent }));
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="shadow-warm fixed inset-x-3 bottom-[4.75rem] z-[60] md:bottom-4 max-w-[420px] rounded-2xl border border-gold-light/50 bg-white p-4 sm:inset-x-auto sm:left-4 sm:p-5"
    >
      <p className="text-xs text-ink/80 sm:text-sm">
        We use essential cookies to run this site and, with your consent, analytics cookies. Change your choice any time in our{" "}
        <a href="/legal/cookies" className="underline text-gold-700">
          Cookie Policy
        </a>
        .
      </p>
      <div className="mt-3 flex gap-2 sm:mt-4 sm:gap-3">
        <button
          type="button"
          onClick={() => choose("rejected")}
          className="min-h-10 flex-1 rounded-full border border-gold-500 px-3 py-2 text-sm font-medium text-gold-700 hover:bg-cream sm:flex-none sm:px-4"
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="min-h-10 flex-1 rounded-full bg-gold-500 px-3 py-2 text-sm font-medium text-ink-900 hover:brightness-95 sm:flex-none sm:px-4"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
