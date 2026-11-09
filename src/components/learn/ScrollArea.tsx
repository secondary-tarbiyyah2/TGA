"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/learn/Icon";

/**
 * A panel that scrolls on its own: the fix for lists that were clipped by a
 * fixed-height card (the calendar's day panel showed 3 or 4 of 9 lessons with
 * no way to reach the rest).
 *
 * - Scrolls by mouse wheel, touch and keyboard: the area is focusable
 *   (tabIndex 0), so arrow keys, Page Up/Down, Home and End work once it is
 *   tabbed to or clicked.
 * - While anything is hidden below, a soft fade and a "N more below" button
 *   sit at the bottom edge. The button scrolls on by most of a screen.
 * - `min-h-0` and `flex-1` let it shrink inside a flex column with a max
 *   height (the usual reason a list gets cut off instead of scrolling). Give
 *   it a max height of its own (`className="max-h-80"`) when its parent is not
 *   a flex column.
 * - When printed it shows everything.
 *
 * `itemSelector` picks what counts as one item for the "N more" count.
 */
export function ScrollArea({
  label,
  className = "",
  itemSelector = "li",
  noun = "more",
  children,
}: {
  /** Accessible name for the scrolling region, e.g. "Lessons on this day". */
  label: string;
  className?: string;
  itemSelector?: string;
  /** Word after the number in the hint ("3 more below"). */
  noun?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(0);
  const [scrollable, setScrollable] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const canScroll = el.scrollHeight - el.clientHeight > 2;
    setScrollable(canScroll);
    if (!canScroll || el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      setBelow(0);
      return;
    }
    const bottom = el.getBoundingClientRect().bottom;
    const items = Array.from(el.querySelectorAll<HTMLElement>(itemSelector)).filter((i) => !i.querySelector(itemSelector));
    // An item counts as "below" when less than half of it is showing.
    const hidden = items.filter((i) => {
      const r = i.getBoundingClientRect();
      return r.height > 0 && r.top + r.height / 2 > bottom;
    }).length;
    setBelow(Math.max(hidden, 1));
  }, [itemSelector]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mo?.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const more = () => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ top: Math.max(120, el.clientHeight * 0.8), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={scrollable ? 0 : undefined}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-700 print:max-h-none print:overflow-visible ${className}`}
      >
        {children}
      </div>
      {below > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent pb-2 print:hidden">
          <button
            type="button"
            onClick={more}
            className="pointer-events-auto inline-flex min-h-8 items-center gap-1 rounded-full border border-gold-light bg-white px-3 text-xs font-semibold text-ink shadow-sm hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {below} {noun} below
            <Icon name="chevronDown" size="sm" />
          </button>
        </div>
      )}
    </div>
  );
}
