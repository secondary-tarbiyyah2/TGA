"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages that already are (or sit inside) the apply / booking flow, a second
// "Apply" bar there would just be noise over the form.
// Also hidden where the page itself is the next step (the fit check, open-evening
// booking, contact and the apply page), so its own form is never covered.
const HIDDEN_ON = ["/admissions/apply", "/book-a-call", "/manage-booking", "/eligibility", "/open-evening", "/contact", "/admissions"];

/** Whether the sticky bar is shown on this path (CookieConsent positions itself above it). */
export function showsMobileCtaBar(raw: string): boolean {
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  return !(HIDDEN_ON.includes(path) || path.startsWith("/policies/"));
}

/** Sticky Apply / Book-a-call bar, phones and small tablets only. */
export function MobileCtaBar() {
  if (!showsMobileCtaBar(usePathname() || "/")) return null;

  return (
    <div
      role="region"
      aria-label="Quick actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold-light/60 bg-cream/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(27,30,33,0.08)] backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md gap-3">
        <Link
          href="/admissions"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-gold-500 px-4 text-sm font-semibold text-ink-900 hover:brightness-95"
        >
          Apply
        </Link>
        <Link
          href="/book-a-call#book"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-[1.5px] border-gold-500 px-4 text-sm font-semibold text-ink-900 hover:bg-gold-100"
        >
          Book a free call
        </Link>
      </div>
    </div>
  );
}
