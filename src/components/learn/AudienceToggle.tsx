"use client";

import { useRef } from "react";
import { Icon, type IconName } from "@/components/learn/Icon";

export type AudienceOption<T extends string> = { id: T; label: string; icon: IconName; caption: string };

/**
 * "Who's signing in?" segmented control for the portal sign-in page.
 *
 * A sliding gold-edged thumb marks the choice; each option has an icon and
 * a label, with a one-line caption below for the selected one. It behaves
 * as a proper radio group: only the selected option is in the Tab order,
 * and the arrow keys / Home / End move the selection, as screen-reader
 * users expect. The slide animation is switched off for
 * prefers-reduced-motion.
 */
export function AudienceToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: AudienceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const current = options[index];

  function move(to: number) {
    const next = (to + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") move(index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(options.length - 1);
    else return;
    e.preventDefault();
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative grid rounded-2xl bg-cream p-1.5 ring-1 ring-gold-light"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {/* The sliding thumb behind the selected option. */}
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 left-1.5 rounded-xl bg-white shadow-warm ring-1 ring-gold-300 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `calc((100% - 0.75rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        />
        {options.map((o, i) => {
          const selected = i === index;
          return (
            <button
              key={o.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.id)}
              className={`relative z-10 flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 ${
                selected ? "text-ink" : "text-ink/60 hover:text-ink"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  selected ? "bg-gold-100 text-gold-700" : "text-ink/50"
                }`}
              >
                <Icon name={o.icon} className="h-[18px] w-[18px]" />
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 text-center text-xs text-ink/70">
        {current.caption}
      </p>
    </div>
  );
}
