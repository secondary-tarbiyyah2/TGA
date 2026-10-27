"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * The one tab control for the portal, so switching between views looks and
 * behaves the same on every page. Two styles, each with one job:
 *
 *  - "line" (default): the main sections of a page, e.g. Attendance's
 *    "Take register / Reports". An underlined row under the page title.
 *  - "switch": a small view switch inside a card, panel or drawer, e.g.
 *    "Draw / Type" when signing. A compact segmented control.
 *
 * Keyboard: Left/Right (and Home/End) move between tabs; only the selected
 * tab is in the Tab order, as the WAI-ARIA tabs pattern expects.
 *
 * Pair with `tabPanelProps(idBase, value)` on the content below so screen
 * readers link each tab to what it shows.
 */
export type TabItem<K extends string> = {
  key: K;
  label: ReactNode;
  /** Small number after the label, e.g. how many items are in that view. */
  count?: number;
  /** Show the count in red (something needs attention). */
  countAlert?: boolean;
};

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  idBase,
  variant = "line",
  fill = false,
  className = "",
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name for the group, e.g. "Attendance sections". */
  label: string;
  /** Prefix for element ids; give it when using tabPanelProps. */
  idBase?: string;
  variant?: "line" | "switch";
  /** Switch only: stretch tabs to share the full width. */
  fill?: boolean;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  // Fade the right edge only while there is more to scroll to.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [items]);
  // On phones the row scrolls; keep the selected tab in view so nothing is "cut off".
  useEffect(() => {
    const i = items.findIndex((t) => t.key === value);
    refs.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value, items]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].key);
    refs.current[next]?.focus();
  };

  const listCls =
    variant === "line"
      ? "portal-tabs flex gap-1 overflow-x-auto border-b border-gold-light"
      : `portal-tabs ${fill ? "flex" : "inline-flex max-w-full"} gap-1 overflow-x-auto rounded-xl border border-gold-light bg-cream p-1`;

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={`${listCls} ${more ? "portal-tabs--more" : ""} ${className}`}>
      {items.map((t, i) => {
        const selected = t.key === value;
        const tabCls =
          variant === "line"
            ? `-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors ${
                selected ? "border-teal-700 text-ink" : "border-transparent text-ink/65 hover:border-ink/20 hover:text-ink"
              }`
            : `${fill ? "flex-1" : "shrink-0"} inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors sm:min-h-8 ${
                selected ? "bg-white text-ink shadow-sm" : "text-ink/65 hover:text-ink"
              }`;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idBase ? `${idBase}-tab-${t.key}` : undefined}
            aria-controls={idBase ? `${idBase}-panel-${t.key}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabCls}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${t.countAlert && t.count > 0 ? "bg-red-50 text-red-800" : selected && variant === "line" ? "bg-teal-100 text-teal-900" : "bg-white/70 text-ink/65"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Props for the content shown under a Tabs row (same idBase). */
export function tabPanelProps(idBase: string, key: string) {
  return { role: "tabpanel" as const, id: `${idBase}-panel-${key}`, "aria-labelledby": `${idBase}-tab-${key}`, tabIndex: 0 };
}
