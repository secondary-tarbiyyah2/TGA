"use client";

import { openAccessibility } from "./ViewSettings";

/** A text button that opens the accessibility centre (used on the accessibility statement). */
export function OpenAccessibilityButton() {
  return (
    <button type="button" onClick={openAccessibility} className="font-semibold text-gold-900 underline underline-offset-2 hover:text-ink">
      Open it now
    </button>
  );
}
