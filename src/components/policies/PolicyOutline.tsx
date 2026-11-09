"use client";

import { useEffect, useState } from "react";

export type OutlineItem = { id: string; text: string };

/**
 * A policy's sections as a side outline, like the outline in Google Docs
 * (owner, Nov 2026: "a nice navigation sidebar for policies, '1. Intent', '2. …'",
 * Tafweed T21). Sticky beside the text on wide screens; a "Contents" list that
 * opens and closes on phones. The section being read is highlighted.
 */
export function PolicyOutline({ items }: { items: OutlineItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const heads = items.map((i) => document.getElementById(i.id)).filter((x): x is HTMLElement => !!x);
    if (!heads.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px" }
    );
    heads.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  const list = (
    <ol className="space-y-0.5 text-sm">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={active === i.id ? "location" : undefined}
            className={`block rounded-lg border-l-2 py-1.5 pl-3 pr-2 leading-snug transition-colors ${
              active === i.id ? "border-gold-500 bg-gold-50 font-semibold text-ink" : "border-transparent text-ink/70 hover:bg-cream hover:text-ink"
            }`}
          >
            {i.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details className="mb-8 rounded-2xl border border-gold-light/60 bg-white p-4 lg:hidden">
        <summary className="cursor-pointer font-semibold text-ink">Contents</summary>
        <nav aria-label="Policy sections" className="mt-3">
          {list}
        </nav>
      </details>
      <nav aria-label="Policy sections" className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gold-700">Contents</p>
        {list}
      </nav>
    </>
  );
}
