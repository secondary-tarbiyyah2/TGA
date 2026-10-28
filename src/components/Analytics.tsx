"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, CONSENT_STORAGE_KEY } from "./CookieConsent";

/**
 * Plausible is cookieless (no personal data), but the cookie banner tells
 * visitors analytics run "with your consent", so the script only loads once
 * they have accepted, and stops being added if they later reject. Set
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN to enable.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setConsented(window.localStorage.getItem(CONSENT_STORAGE_KEY) === "accepted");
      } catch {
        setConsented(false);
      }
    };
    read();
    const onChoice = (e: Event) => setConsented((e as CustomEvent).detail === "accepted");
    window.addEventListener(CONSENT_EVENT, onChoice);
    return () => window.removeEventListener(CONSENT_EVENT, onChoice);
  }, []);

  if (!domain || !consented) return null;
  return <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />;
}
