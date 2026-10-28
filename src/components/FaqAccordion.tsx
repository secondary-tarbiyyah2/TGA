"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FaqEntry } from "@/content/seed";
import { FaqAnswer } from "@/components/FaqAnswer";
import { FAQ_CATEGORIES, faqCategoryLabel, faqPlainText, faqSlug } from "@/lib/faq";

type Item = FaqEntry & { slug: string; haystack: string };

const ALL = "all";

/** Category order from FAQ_CATEGORIES, then the admin's order within it (most asked first). */
function prepare(entries: FaqEntry[]): Item[] {
  const rank = (c: string) => {
    const i = FAQ_CATEGORIES.findIndex((x) => x.category === c);
    return i < 0 ? FAQ_CATEGORIES.length : i;
  };
  return [...entries]
    .sort((a, b) => rank(a.category) - rank(b.category) || (a.order ?? 0) - (b.order ?? 0))
    .map((e) => ({
      ...e,
      slug: faqSlug(e.question),
      haystack: `${e.question} ${faqPlainText(e.answer)} ${faqCategoryLabel(e.category)}`.toLowerCase(),
    }));
}

function FaqItem({ item, open, onToggle }: { item: Item; open: boolean; onToggle: (slug: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${item.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address bar still shows the link */
    }
    window.history.replaceState(null, "", `#${item.slug}`);
  };
  return (
    <li id={item.slug} className="scroll-mt-28">
      <h3>
        <button
          type="button"
          id={`faq-q-${item.slug}`}
          onClick={() => onToggle(item.slug)}
          aria-expanded={open}
          aria-controls={`faq-a-${item.slug}`}
          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gold-50"
          style={{ minHeight: 48 }}
        >
          <span className="font-medium text-ink">{item.question}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`mt-0.5 h-5 w-5 shrink-0 text-gold-700 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <div id={`faq-a-${item.slug}`} role="region" aria-labelledby={`faq-q-${item.slug}`} hidden={!open} className="px-5 pb-5 text-[15px] text-ink-700">
        <FaqAnswer answer={item.answer} />
        <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 rounded text-xs font-medium text-ink-500 hover:text-gold-700">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
          <span aria-live="polite">{copied ? "Link copied" : "Copy link to this answer"}</span>
        </button>
      </div>
    </li>
  );
}

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const items = useMemo(() => prepare(entries), [entries]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const searchId = useId();
  const listTop = useRef<HTMLDivElement>(null);

  // Open (and scroll to) the question named in the address, on arrival and when the hash changes.
  useEffect(() => {
    const go = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (!slug || !items.some((i) => i.slug === slug)) return;
      setQuery("");
      setCategory(ALL);
      setOpen((prev) => new Set(prev).add(slug));
      window.setTimeout(() => {
        document.getElementById(slug)?.scrollIntoView({ block: "start" });
        document.getElementById(`faq-q-${slug}`)?.focus({ preventScroll: true });
      }, 0);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [items]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = terms.length ? items.filter((i) => terms.every((t) => i.haystack.includes(t))) : items;
  const visible = category === ALL ? matching : matching.filter((i) => i.category === category);

  const present = FAQ_CATEGORIES.filter((c) => items.some((i) => i.category === c.category));
  const known = new Set(FAQ_CATEGORIES.map((c) => c.category));
  const groups = [
    ...present.map((c) => ({ key: c.category, label: c.label, items: visible.filter((i) => i.category === c.category) })),
    { key: "other", label: "Other questions", items: visible.filter((i) => !known.has(i.category)) },
  ].filter((g) => g.items.length > 0);

  const toggle = useCallback((slug: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const allOpen = visible.length > 0 && visible.every((i) => open.has(i.slug));
  const toggleAll = () =>
    setOpen((prev) => {
      const next = new Set(prev);
      for (const i of visible) {
        if (allOpen) next.delete(i.slug);
        else next.add(i.slug);
      }
      return next;
    });

  const filtering = terms.length > 0 || category !== ALL;
  const status = filtering
    ? `${visible.length} of ${items.length} question${items.length === 1 ? "" : "s"}${terms.length ? ` matching "${query.trim()}"` : ""}${category !== ALL ? ` in ${faqCategoryLabel(category)}` : ""}`
    : `${items.length} questions`;

  const chip = (value: string, label: string, count: number) => {
    const on = category === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        onClick={() => {
          setCategory(value);
          listTop.current?.scrollIntoView({ block: "nearest" });
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
          on ? "border-ink bg-ink text-cream" : "border-gold-light/70 bg-white text-ink/80 hover:border-gold-500 hover:text-ink"
        }`}
      >
        {label}
        <span className={`text-xs tabular-nums ${on ? "text-cream/70" : "text-ink-500"}`}>{count}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="rounded-2xl border border-gold-light/50 bg-gold-50 p-4 sm:p-5">
        <label htmlFor={searchId} className="mb-2 block text-sm font-semibold text-ink">
          Search the questions
        </label>
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try fees, deadline, hifdh or laptop"
            autoComplete="off"
            className="w-full rounded-full border border-gold-light/80 bg-white py-2.5 pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-500"
          />
        </div>
        <div role="group" aria-label="Filter by topic" className="mt-4 flex flex-wrap gap-2">
          {chip(ALL, "All", matching.length)}
          {present.map((c) => chip(c.category, c.label, matching.filter((i) => i.category === c.category).length))}
        </div>
      </div>

      <div ref={listTop} className="mt-6 flex flex-wrap items-center justify-between gap-3 scroll-mt-28">
        <p className="text-sm text-ink-700">
          <span role="status" aria-live="polite">
            {status}
          </span>
          {filtering && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory(ALL);
                }}
                className="font-medium text-gold-700 underline underline-offset-2 hover:text-gold-900"
              >
                Show all
              </button>
            </>
          )}
        </p>
        {visible.length > 0 && (
          <button type="button" onClick={toggleAll} className="min-h-10 rounded-full px-3 py-1 text-sm font-medium text-gold-700 hover:text-gold-900">
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <div className="mt-4 rounded-2xl border border-gold-light/50 bg-white p-6">
          <p className="font-medium text-ink">No questions match your search.</p>
          <p className="mt-2 text-ink-700">
            Try a different word, or ask us directly: <Link href="/contact" className="font-medium text-gold-700 underline underline-offset-2">contact us</Link> or{" "}
            <Link href="/book-a-call" className="font-medium text-gold-700 underline underline-offset-2">book a call</Link>.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`faq-cat-${faqSlug(g.key)}`} className="mt-8 first-of-type:mt-4">
          <h2 id={`faq-cat-${faqSlug(g.key)}`} className="mb-3 font-serif text-xl font-semibold text-ink">
            {g.label}
          </h2>
          <ul className="divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50 bg-white">
            {g.items.map((i) => (
              <FaqItem key={i._id} item={i} open={open.has(i.slug)} onToggle={toggle} />
            ))}
          </ul>
        </section>
      ))}

      {visible.length > 0 && (
        <p className="mt-10 text-sm text-ink-700">
          Still have a question? <Link href="/contact" className="font-medium text-gold-700 underline underline-offset-2">Contact us</Link> or{" "}
          <Link href="/book-a-call" className="font-medium text-gold-700 underline underline-offset-2">book a call</Link>.
        </p>
      )}
    </div>
  );
}
