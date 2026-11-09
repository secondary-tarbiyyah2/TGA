"use client";

import { useEffect, useId, useState, type ComponentProps } from "react";
import { FeeEstimator } from "@/components/FeeEstimator";

/**
 * The fees calculator behind a "Work out your fees" button, near the top of
 * the fees page so families see from the start that it exists. Collapsed by
 * default; opens in place. Linking to /fees#calculator (or the old
 * #estimator) opens it and scrolls to it.
 */
export function FeeCalculatorPanel(props: ComponentProps<typeof FeeEstimator>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const check = () => {
      if (["#calculator", "#estimator"].includes(window.location.hash)) {
        setOpen(true);
        window.setTimeout(() => document.getElementById("calculator")?.scrollIntoView({ block: "start" }), 0);
      }
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open when arriving from a #calculator link
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  return (
    <div id="calculator" className="scroll-mt-24">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2" />
        </svg>
        {open ? "Hide the fees calculator" : "Work out your fees"}
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <p className="mt-2 text-sm text-ink/70">Choose your children&apos;s year groups and a payment plan to see your total, discounts and what you pay to secure a place.</p>
      <div id={panelId} hidden={!open} className="mt-5 max-w-2xl">
        {open && <FeeEstimator {...props} />}
      </div>
    </div>
  );
}
