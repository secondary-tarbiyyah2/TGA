"use client";

import { reopenCookieConsent } from "./CookieConsent";

/** Footer link that clears the stored cookie choice and shows the banner again. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={reopenCookieConsent} className={className}>
      Cookie settings
    </button>
  );
}
