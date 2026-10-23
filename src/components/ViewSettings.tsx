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

/** A button with a small pop-over, for the public header. */
export function ViewSettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useRestoreView();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="view-settings"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink/80 hover:bg-cream hover:text-gold-700"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v.01" />
          <path d="M8 10h8" />
          <path d="M12 10v7" />
          <path d="m9 21 3-4 3 4" />
        </svg>
        View
      </button>
      {open && (
        <div id="view-settings" role="group" aria-label="View settings" className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-gold-light/60 bg-white p-2 shadow-warm">
          <ViewSettingsPanel />
        </div>
      )}
    </div>
  );
}
