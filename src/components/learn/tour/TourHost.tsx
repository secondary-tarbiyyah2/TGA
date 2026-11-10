"use client";

// The guided tour (T38). Built in-house (no third-party script, nothing
// tracked): a dimmed screen with a cut-out around the real button or menu, and
// a small card with one sentence, Back / Next and "Skip tour". Keyboard: focus
// stays in the card, Esc closes, the arrow keys move. Phones: the card docks to
// the top or bottom edge so it never covers what it points at.
//
// The role tour starts once, the first time someone signs in (remembered in
// portal_prefs.tours_seen, so not again on another device). "Take the tour" in
// the menu and in search starts it again; pages with tips start theirs with
// startTour(PAGE_TIPS[...]).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import type { PortalArea } from "@/lib/learn/nav";
import { markTourSeen, usePortalPrefs } from "@/lib/learn/portalPrefs";
import { START_TOUR_EVENT, tourFor, type Tour, type TourStep } from "@/lib/learn/tours";

const WIDE = 1024; // the desktop sidebar appears from here (Tailwind lg)
const PAD = 6;

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = window.getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

function findTarget(step: TourStep): HTMLElement | null {
  for (const sel of step.target || []) {
    let list: NodeListOf<HTMLElement>;
    try {
      list = document.querySelectorAll<HTMLElement>(sel);
    } catch {
      continue;
    }
    for (const el of list) if (visible(el)) return el;
  }
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export function TourHost({ area, roles, userId }: { area: PortalArea; roles: string[]; userId: string }) {
  const prefs = usePortalPrefs(userId);
  const pathname = usePathname();
  const [tour, setTour] = useState<Tour | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [wide, setWide] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const autoTried = useRef(false);
  const titleId = useId();
  const bodyId = useId();

  const steps = (tour?.steps || []).filter((s) => wide || !s.desktopOnly);
  const step = steps[index] || null;

  const start = useCallback((t: Tour) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The phone menu closes so the tour can point at the page.
    window.dispatchEvent(new Event("tga-close-menu"));
    setWide(window.innerWidth >= WIDE);
    setIndex(0);
    setRect(null);
    setTour(t);
  }, []);

  const finish = useCallback(() => {
    if (tour) markTourSeen(tour.key);
    setTour(null);
    setRect(null);
    const el = returnFocus.current;
    if (el && document.contains(el)) window.setTimeout(() => el.focus(), 0);
  }, [tour]);

  // Started from the menu, search or a page's tips.
  useEffect(() => {
    const onStart = (e: Event) => {
      const t = (e as CustomEvent<Tour | null>).detail || tourFor(area, roles);
      window.setTimeout(() => start(t), 150);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [area, roles, start]);

  // First sign-in: the role tour, once (on the area's own pages, not account pages).
  useEffect(() => {
    if (!prefs.ready || autoTried.current || tour) return;
    const t = tourFor(area, roles);
    autoTried.current = true;
    if (prefs.tours.includes(t.key) || !pathname || !/^\/(learn\/)?(admin|teach|family|student)\//.test(pathname)) return;
    const timer = window.setTimeout(() => start(t), 900);
    return () => window.clearTimeout(timer);
  }, [prefs.ready, prefs.tours, area, roles, pathname, tour, start]);

  // Find and measure the highlighted element; keep it measured as the page moves.
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    const el = findTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const t = el && document.contains(el) && visible(el) ? el.getBoundingClientRect() : null;
        setRect(t ? { top: t.top, left: t.left, width: t.width, height: t.height } : null);
        setWide(window.innerWidth >= WIDE);
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Focus the main button on every step.
  useEffect(() => {
    if (step) nextRef.current?.focus({ preventScroll: true });
  }, [step, index]);

  const go = (d: number) => {
    const n = index + d;
    if (n < 0) return;
    if (n >= steps.length) return finish();
    setIndex(n);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Tab") {
      // Keep focus inside the card.
      const items = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") || [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
      items[next].focus();
    }
  };

  if (!tour || !step || typeof document === "undefined") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 640;
  const cardW = Math.min(352, vw - 24);
  const body = !wide && step.phoneBody ? step.phoneBody : step.body;

  // Where the card goes: beside a menu item, else under or over the target;
  // on phones, docked to the edge away from the target; with no target, centred.
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 110) };
  } else if (phone) {
    const targetLow = rect.top + rect.height / 2 > vh * 0.5;
    cardStyle = targetLow ? { left: 12, top: 12 } : { left: 12, bottom: 12 };
  } else if (rect.left + rect.width < 340 && rect.left < 300) {
    cardStyle = { left: rect.left + rect.width + 16, top: Math.min(Math.max(12, rect.top - 8), vh - 240) };
  } else {
    const below = rect.top + rect.height + 12;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    cardStyle = below + 220 < vh ? { left, top: below } : { left, top: Math.max(12, rect.top - 12 - 220) };
  }

  return createPortal(
    <div className="portal tour-root fixed inset-0 z-[300]" onKeyDown={onKey}>
      {/* Blocks clicks on the page while the tour is open; the cut-out shows the target. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {rect ? (
        <div
          aria-hidden="true"
          className="tour-spotlight"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div aria-hidden="true" className="tour-dim absolute inset-0" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="tour-card absolute rounded-xl border border-gold-light bg-white p-4 shadow-2xl"
        style={{ ...cardStyle, width: cardW }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-900">
          {tour.key.startsWith("tip:") ? "Tip" : "Tour"} {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="mt-1 text-base font-semibold text-ink">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-sm leading-relaxed text-ink/80">
          {body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {index < steps.length - 1 && (
            <button type="button" onClick={finish} className="min-h-11 rounded-lg px-2 text-sm font-medium text-ink/70 underline-offset-2 hover:text-ink hover:underline sm:min-h-9">
              {tour.key.startsWith("tip:") ? "Skip tips" : "Skip tour"}
            </button>
          )}
          <span className="ml-auto" />
          {index > 0 && (
            <button type="button" onClick={() => go(-1)} className="min-h-11 rounded-lg border border-gold-light px-3 text-sm font-medium text-ink hover:bg-cream sm:min-h-9">
              Back
            </button>
          )}
          <button ref={nextRef} type="button" onClick={() => go(1)} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:min-h-9">
            {index === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-teal-700" : "w-1.5 bg-gold-light"}`} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
