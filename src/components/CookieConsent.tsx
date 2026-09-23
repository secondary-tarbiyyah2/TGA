"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tga-cookie-consent";

type Consent = "accepted" | "rejected";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reading localStorage requires the client, so whether to show the banner can only be
    // known post-mount — an effect (not a lazy initializer) is the correct tool here.
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
      // Storage unavailable (private browsing etc.) — still honour the choice for this visit.
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
      className="shadow-warm fixed inset-x-4 bottom-4 z-[60] max-w-[420px] rounded-2xl border border-gold-light/50 bg-white p-5 sm:inset-x-auto sm:left-4"
    >
      <p className="text-sm text-ink/80">
        We use essential cookies to run this site, and (with your consent) analytics cookies to understand how
        it&apos;s used. You can change your choice at any time — see our{" "}
        <a href="/legal/cookies" className="underline text-gold-700">
          Cookie Policy
        </a>
        .
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => choose("rejected")}
          className="rounded-full border border-gold-500 px-4 py-2 text-sm font-medium text-gold-700 hover:bg-cream"
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-ink-900 hover:brightness-95"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
