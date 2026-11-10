"use client";

import { useEffect, useRef } from "react";
import { usePortalPrefs } from "@/lib/learn/portalPrefs";
import { PAGE_TIPS, startTour } from "@/lib/learn/tours";

/** Show a complex page's two or three tips the first time someone opens it
 * (once `ready`, e.g. when the content has loaded), but never on top of the
 * first-sign-in tour: if that has not been seen yet, the tips wait for a later visit. */
export function usePageTips(name: keyof typeof PAGE_TIPS, ready: boolean) {
  const prefs = usePortalPrefs(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ready || !prefs.ready || done.current) return;
    const tips = PAGE_TIPS[name];
    if (prefs.tours.includes(tips.key) || !prefs.tours.some((k) => !k.startsWith("tip:"))) {
      done.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      done.current = true;
      startTour(tips);
    }, 700);
    return () => window.clearTimeout(t);
  }, [name, ready, prefs.ready, prefs.tours]);
}
