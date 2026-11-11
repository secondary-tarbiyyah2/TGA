"use client";

// The guide's words are loaded only when someone opens the guide, so they add
// nothing to the first load of any portal page.

import { useEffect, useState } from "react";

type GuideModule = typeof import("@/content/portal-guide");

let cache: GuideModule | null = null;
let pending: Promise<GuideModule> | null = null;

export function loadGuideContent(): Promise<GuideModule> {
  if (cache) return Promise.resolve(cache);
  pending ??= import("@/content/portal-guide").then((m) => (cache = m));
  return pending;
}

export function useGuideContent(enabled = true): GuideModule | null {
  const [mod, setMod] = useState<GuideModule | null>(cache);
  useEffect(() => {
    if (!enabled || mod) return;
    let alive = true;
    void loadGuideContent().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, [enabled, mod]);
  return mod;
}
