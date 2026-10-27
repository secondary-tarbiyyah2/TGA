"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages that already are (or sit inside) the apply / booking flow, a second
// "Apply" bar there would just be noise over the form.
const HIDDEN_ON = ["/admissions/apply", "/admissions/payment", "/book-a-call", "/manage-booking", "/open-evening/manage"];

/** Sticky Apply / Book-a-call bar, phones and small tablets only. */
export function MobileCtaBar() {
  const raw = usePathname() || "/";
  const path = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  if (HIDDEN_ON.includes(path)) return null;

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
          href="/book-a-call"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-[1.5px] border-gold-500 px-4 text-sm font-semibold text-ink-900 hover:bg-gold-100"
        >
          Book a free call
        </Link>
      </div>
    </div>
  );
}
