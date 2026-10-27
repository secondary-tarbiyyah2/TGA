"use client";

import { useEffect } from "react";
import Link from "next/link";
import { btn } from "@/components/learn/ui";

// Catches a render error anywhere under /learn so a broken widget shows this
// card inside the portal chrome rather than taking the whole page down with
// a blank screen. Next.js renders it in place of the failing page; "Try
// again" re-renders the same route.
export default function LearnError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Portal page error:", error);
  }, [error]);

  return (
    <section className="app-pad">
      <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-gold-light bg-white p-6 text-center shadow-sm">
        <h1 className="font-serif text-xl font-semibold text-ink">This page hit a problem</h1>
        <p className="mt-2 text-sm text-ink/70">
          Something went wrong while showing this page. Your work elsewhere in the portal is safe. Try again, or go back to your home page; if it keeps happening, report it
          from the Feedback link in the menu and mention what you were doing.
        </p>
        {error.digest && <p className="mt-2 text-xs text-ink/65">Reference: {error.digest}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className={btn("primary")}>
            Try again
          </button>
          <Link href="/" className={btn("secondary")}>
            Portal home
          </Link>
        </div>
      </div>
    </section>
  );
}
