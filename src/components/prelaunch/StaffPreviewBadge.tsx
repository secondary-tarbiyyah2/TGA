"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- the exit link must reach the server so .htaccess can clear the cookie */

import { useSyncExternalStore } from "react";

// Shown only to staff browsing the full site with the private preview link
// (the PRE-LAUNCH block in public/.htaccess sets a readable tga_preview_ui
// cookie next to the real one). A small fixed label so nobody mistakes the
// unfinished site for the live one.
const noSubscribe = () => () => {};
const hasPreview = () => /(?:^|;\s*)tga_preview_ui=1(?:;|$)/.test(document.cookie);

export function StaffPreviewBadge() {
  const on = useSyncExternalStore(noSubscribe, hasPreview, () => false);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] print:hidden">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-cream shadow-lg">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gold-300" />
        Staff preview: not yet public
        <a href="/?preview=off" className="ml-1 text-gold-300 underline">Exit</a>
      </div>
    </div>
  );
}
