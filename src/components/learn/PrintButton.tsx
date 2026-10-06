"use client";

import { useRef } from "react";
import { findPrintScope, printElement } from "@/components/learn/printScope";

/**
 * "Print / Save as PDF". Prints only the nearest <PrintScope> (see
 * printScope.tsx): the card/section the button belongs to, or the one named by
 * `scope`. With no scope on the page it falls back to the page content with
 * the portal chrome (sidebar, header, dialogs) hidden.
 */
export function PrintButton({ label = "Print / Save as PDF", scope }: { label?: string; scope?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => printElement(findPrintScope(ref.current, scope))}
      className="print:hidden rounded-lg border border-gold-light px-4 py-2 text-sm hover:bg-cream bg-white text-ink/80 font-medium transition-colors"
    >
      {label}
    </button>
  );
}
