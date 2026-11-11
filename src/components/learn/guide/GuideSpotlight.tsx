"use client";

// "Show me": dims the page and outlines each real element in turn (found by
// its data-guide name), with a small card that says what it is. Shares the
// look of the first-sign-in tour (tour-spotlight, tour-card in globals.css).
// Keyboard: focus stays in the card, arrows move, Esc stops, and focus goes
// back to where it was. If something is not on screen (an empty list, a
// button that only shows near lesson time), the card says so and carries on.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SpotStep } from "./guideStore";

const PAD = 6;

export function guideSelector(target: string) {
  return `[data-guide="${target.replace(/"/g, "")}"]`;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const s = window.getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

export function findGuideTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(guideSelector(target))) if (visible(el)) return el;
  return null;
}

type Rect = { top: number; left: number; width: number; height: number };

export function GuideSpotlight({
  heading,
  steps,
  index,
  onMove,
  onStop,
  onFinish,
  finishLabel = "Done",
  stopLabel = "Stop",
  extra,
  missingNote = "This is not on the screen just now. It appears when there is something to show here.",
}: {
  heading: string;
  steps: SpotStep[];
  index: number;
  onMove: (i: number) => void;
  onStop: () => void;
  onFinish: () => void;
  finishLabel?: string;
  stopLabel?: string;
  /** Extra buttons in the card (journeys add "Skip this step"). */
  extra?: ReactNode;
  missingNote?: string;
}) {
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [found, setFound] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const back = returnFocus;
    return () => {
      const el = back.current;
      if (el && document.contains(el)) window.setTimeout(() => el.focus(), 0);
    };
  }, []);

  // Find the target (it may still be loading: look again for a moment), scroll to it and keep it measured.
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    let tries = 0;
    let el: HTMLElement | null = null;
    let timer = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el && document.contains(el) && visible(el) ? el.getBoundingClientRect() : null;
        setRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
      });
    };
    const look = () => {
      el = findGuideTarget(step.target);
      if (!el && step.target && tries++ < 12) {
        timer = window.setTimeout(look, 250);
        return;
      }
      setFound(!!el || !step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      }
      measure();
    };
    look();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (step) nextRef.current?.focus({ preventScroll: true });
  }, [step, index]);

  if (!step || typeof document === "undefined") return null;
  const last = index === steps.length - 1;
  const go = (d: number) => {
    const n = index + d;
    if (n < 0) return;
    if (n >= steps.length) return onFinish();
    onMove(n);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onStop();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "Tab") {
      const items = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") || [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1].focus();
    }
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 640;
  const cardW = Math.min(360, vw - 24);
  let cardStyle: React.CSSProperties;
  if (!rect) cardStyle = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 120) };
  else if (phone) cardStyle = rect.top + rect.height / 2 > vh * 0.5 ? { left: 12, top: 12 } : { left: 12, bottom: 12 };
  else {
    const below = rect.top + rect.height + 12;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 12);
    if (below + 230 < vh) cardStyle = { left, top: below };
    else if (rect.top - 242 > 0) cardStyle = { left, top: rect.top - 242 };
    else cardStyle = { left: Math.max(12, vw - cardW - 16), bottom: 16 };
  }

  return createPortal(
    <div className="portal tour-root fixed inset-0 z-[300]" onKeyDown={onKey}>
      <div className="absolute inset-0" aria-hidden="true" />
      {rect ? (
        <>
          {/* Four dim panels round the target (more reliable than one huge shadow), then its outline. */}
          {(() => {
            const t = Math.max(0, rect.top - PAD);
            const l = Math.max(0, rect.left - PAD);
            const r = rect.left + rect.width + PAD;
            const b = rect.top + rect.height + PAD;
            return (
              <>
                <div aria-hidden="true" className="tour-dim absolute inset-x-0 top-0" style={{ height: t }} />
                <div aria-hidden="true" className="tour-dim absolute inset-x-0 bottom-0" style={{ top: b }} />
                <div aria-hidden="true" className="tour-dim absolute left-0" style={{ top: t, height: b - t, width: l }} />
                <div aria-hidden="true" className="tour-dim absolute right-0" style={{ top: t, height: b - t, left: r }} />
              </>
            );
          })()}
          <div aria-hidden="true" className="tour-spotlight" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "none" }} />
        </>
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
          {heading} · {index + 1} of {steps.length}
        </p>
        <h2 id={titleId} className="mt-1 text-base font-semibold text-ink">
          {step.title}
        </h2>
        <div id={bodyId}>
          <p className="mt-1 text-sm leading-relaxed text-ink/80">{step.body}</p>
          {!found && <p className="mt-2 rounded-lg bg-cream px-2.5 py-1.5 text-xs text-ink/75">{missingNote}</p>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onStop} className="min-h-11 rounded-lg px-2 text-sm font-medium text-ink/70 underline-offset-2 hover:text-ink hover:underline sm:min-h-9">
            {stopLabel}
          </button>
          {extra}
          <span className="ml-auto" />
          {index > 0 && (
            <button type="button" onClick={() => go(-1)} className="min-h-11 rounded-lg border border-gold-light px-3 text-sm font-medium text-ink hover:bg-cream sm:min-h-9">
              Back
            </button>
          )}
          <button ref={nextRef} type="button" onClick={() => go(1)} className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:min-h-9">
            {last ? finishLabel : "Next"}
          </button>
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-teal-700" : "w-1.5 bg-gold-light"}`} />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {found ? `Showing ${step.title}.` : `${step.title} is not on the screen just now.`}
        </p>
      </div>
    </div>,
    document.body,
  );
}
