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
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gold-light/40 bg-white p-4 shadow-[0_-8px_24px_rgba(32,18,23,0.12)] sm:p-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink/80">
          We use essential cookies to run this site, and (with your consent) analytics cookies to understand how it&apos;s
          used. You can change your choice at any time — see our{" "}
          <a href="/legal/cookies" className="underline text-maroon">
            Cookie Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="rounded-full border border-maroon px-4 py-2 text-sm font-medium text-maroon hover:bg-cream"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-maroon px-4 py-2 text-sm font-medium text-white hover:bg-maroon-dark"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
