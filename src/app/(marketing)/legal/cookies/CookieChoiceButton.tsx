"use client";

import { useState } from "react";

const STORAGE_KEY = "tga-cookie-consent";

/**
 * Lets a visitor change the choice they made in the cookie banner (the banner
 * promises they can do this from the Cookie Policy). Clearing the saved choice
 * and reloading brings the banner back.
 */
export function CookieChoiceButton() {
  const [failed, setFailed] = useState(false);

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    } catch {
      setFailed(true);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-gold-500 px-5 text-sm font-semibold text-ink-900 hover:bg-gold-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
      >
        Change my cookie choice
      </button>
      {failed && (
        <p role="status" className="mt-2 text-sm text-ink/70">
          Your browser is blocking site storage, so no choice is saved on this device. Nothing is remembered between visits.
        </p>
      )}
    </div>
  );
}
