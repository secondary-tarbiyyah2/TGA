"use client";

// Minimal print-stylesheet approach per the Phase A decision (no PDF
// library in package.json, and a heavy new dependency isn't worth it for
// "export my timetable"): window.print() against a page that already hides
// non-essential chrome via Tailwind's `print:hidden` utility (see usages
// of this button — the surrounding nav/sign-out controls carry that
// class), so the browser's own Print / Save as PDF dialog produces a
// clean, print-optimized timetable.
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-lg border border-gold-light px-4 py-2 text-sm hover:bg-cream bg-white text-ink/80 font-medium transition-colors"
    >
      {label}
    </button>
  );
}
