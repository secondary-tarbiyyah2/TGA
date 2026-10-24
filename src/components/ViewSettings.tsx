"use client";

import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/learn/ui";

const KEY = "tga-view";
type View = { text: boolean; reading: boolean; contrast: boolean; dark: boolean };
const OFF: View = { text: false, reading: false, contrast: false, dark: false };

function read(): View {
  try {
    return { ...OFF, ...(JSON.parse(window.localStorage.getItem(KEY) || "{}") as Partial<View>) };
  } catch {
    return OFF;
  }
}

function apply(v: View) {
  const r = document.documentElement;
  r.toggleAttribute("data-large-text", v.text);
  r.toggleAttribute("data-reading", v.reading);
  r.toggleAttribute("data-contrast", v.contrast);
  r.toggleAttribute("data-dark", v.dark);
}

/** Restores the saved view settings as soon as any page with a header opens. */
export function useRestoreView() {
  useEffect(() => {
    apply(read());
  }, []);
}

const OPTIONS: { key: keyof View; label: string; hint: string; portalOnly?: boolean }[] = [
  { key: "dark", label: "Dark mode", hint: "A dark portal, easier on the eyes in the evening.", portalOnly: true },
  { key: "text", label: "Larger text", hint: "Bigger type everywhere." },
  { key: "reading", label: "Easy reading", hint: "Softer background, wider spacing, left-aligned text." },
  { key: "contrast", label: "High contrast", hint: "Darker text and stronger lines." },
];

/** The view options as switches. Remembered on this device; dark mode only shows (and applies) in the portal. */
export function ViewSettingsPanel({ className = "", portal = false }: { className?: string; portal?: boolean }) {
  const [view, setView] = useState<View>(OFF);
  useEffect(() => {
    const v = read();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved choice once after mount
    setView(v);
    apply(v);
  }, []);
  const toggle = (k: keyof View) => {
    const next = { ...view, [k]: !view[k] };
    setView(next);
    apply(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: applies for this visit only */
    }
  };
  return (
    <div className={className}>
      {OPTIONS.filter((o) => portal || !o.portalOnly).map((o) => (
        <Switch key={o.key} checked={view[o.key]} onChange={() => toggle(o.key)} label={o.label} hint={o.hint} />
      ))}
    </div>
  );
}

/** "Aa" display button in the public header: opens a centred dialog with the display options. */
export function ViewSettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useRestoreView();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title="Display options: larger text, easy reading, high contrast"
        className="flex items-center gap-2 rounded-full border border-gold-light/70 px-3 py-1.5 text-sm font-medium text-ink/80 hover:border-gold-500 hover:text-gold-700"
      >
        <span aria-hidden="true" className="font-serif text-[15px] font-bold leading-none tracking-tight">Aa</span>
        <span className="sr-only">Display options</span>
        <span aria-hidden="true" className="hidden xl:inline">Display</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="view-settings-title" className="w-full max-w-md rounded-3xl border border-gold-light/60 bg-white p-6 shadow-warm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="view-settings-title" className="font-serif text-xl font-semibold text-ink">Make this site easier to read</h2>
                <p className="mt-1 text-sm text-ink/70">Your choices are remembered on this device.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-2 text-ink/70 hover:bg-cream">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" /></svg>
              </button>
            </div>
            <ViewSettingsPanel className="mt-4" />
            <button type="button" onClick={() => setOpen(false)} className="mt-5 w-full rounded-full bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-900 hover:brightness-95">Done</button>
          </div>
        </div>
      )}
    </>
  );
}
