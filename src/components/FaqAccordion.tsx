"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FaqEntry } from "@/content/seed";
import { FaqAnswer } from "@/components/FaqAnswer";
import { FAQ_CATEGORIES, faqCategoryLabel, faqPlainText, faqSlug } from "@/lib/faq";

type Item = FaqEntry & { slug: string; haystack: string };

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
    <li id={item.slug} className="scroll-mt-56 lg:scroll-mt-28">
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

const SECTION_ID = (key: string) => `faq-cat-${faqSlug(key)}`;

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const items = useMemo(() => prepare(entries), [entries]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<string>("");
  const searchId = useId();
  const mobileSearchId = useId();
  const listTop = useRef<HTMLDivElement>(null);
  const chipRow = useRef<HTMLDivElement>(null);

  // Open (and scroll to) the question named in the address, on arrival and when the hash changes.
  useEffect(() => {
    const go = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (!slug || !items.some((i) => i.slug === slug)) return;
      setQuery("");
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
  const visible = terms.length ? items.filter((i) => terms.every((t) => i.haystack.includes(t))) : items;

  const present = FAQ_CATEGORIES.filter((c) => items.some((i) => i.category === c.category));
  const known = new Set(FAQ_CATEGORIES.map((c) => c.category));
  const groups = [
    ...present.map((c) => ({ key: c.category, label: c.label, items: visible.filter((i) => i.category === c.category) })),
    { key: "other", label: "Other questions", items: visible.filter((i) => !known.has(i.category)) },
  ].filter((g) => g.items.length > 0);
  const groupKeys = groups.map((g) => g.key).join("|");

  // Highlight the topic being read (the section nearest the top, under the sticky bars).
  useEffect(() => {
    const els = groupKeys
      .split("|")
      .filter(Boolean)
      .map((k) => document.getElementById(SECTION_ID(k)))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (records) => {
        for (const r of records) seen.set(r.target.id, r.isIntersecting);
        const first = els.find((el) => seen.get(el.id));
        if (first) setActive(first.dataset.key || "");
      },
      { rootMargin: "-200px 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [groupKeys]);

  // Keep the highlighted chip in view in the phone topic row.
  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  const jumpTo = (key: string) => {
    const el = document.getElementById(SECTION_ID(key));
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActive(key);
    // Move focus to the section heading so keyboard and screen-reader users land there too.
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

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

  const status = terms.length
    ? `${visible.length} of ${items.length} question${items.length === 1 ? "" : "s"} matching "${query.trim()}"`
    : `${items.length} questions`;

  const searchBox = (id: string, compact: boolean) => (
    <div className="relative">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={compact ? "Search the questions" : "Try fees, deadline, hifdh or laptop"}
        autoComplete="off"
        className={`w-full rounded-full border border-gold-light/80 bg-white pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-500 ${compact ? "py-2" : "py-2.5"}`}
      />
    </div>
  );

  const counts = (key: string) => groups.find((g) => g.key === key)?.items.length ?? 0;
  const topics = [...present.map((c) => ({ key: c.category, label: c.label })), ...(groups.some((g) => g.key === "other") ? [{ key: "other", label: "Other questions" }] : [])];

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-14">
      {/* Phones and tablets: search and topics stay under the header while scrolling. */}
      <div className="sticky top-20 z-30 -mx-5 border-b border-gold-light/50 bg-cream/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden">
        <label htmlFor={mobileSearchId} className="sr-only">
          Search the questions
        </label>
        {searchBox(mobileSearchId, true)}
        <nav aria-label="FAQ topics" className="mt-2">
          <div ref={chipRow} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {topics.map((t) => {
              const n = counts(t.key);
              const on = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  data-key={t.key}
                  disabled={n === 0}
                  aria-current={on ? "true" : undefined}
                  onClick={() => jumpTo(t.key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                    on ? "border-ink bg-ink text-cream" : "border-gold-light/70 bg-white text-ink/80"
                  }`}
                >
                  {t.label}
                  <span className={`text-xs tabular-nums ${on ? "text-cream/70" : "text-ink-500"}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Wide screens: a sidebar that stays in view under the header. */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto pb-4">
          <div className="rounded-2xl border border-gold-light/50 bg-gold-50 p-4">
            <label htmlFor={searchId} className="mb-2 block text-sm font-semibold text-ink">
              Search the questions
            </label>
            {searchBox(searchId, false)}
          </div>
          <nav aria-label="FAQ topics">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink/65">Topics</p>
            <ul className="space-y-0.5">
              {topics.map((t) => {
                const n = counts(t.key);
                const on = active === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      disabled={n === 0}
                      aria-current={on ? "true" : undefined}
                      onClick={() => jumpTo(t.key)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-40 ${
                        on ? "border-gold-700 bg-white font-semibold text-ink" : "border-transparent text-ink/75 hover:bg-white hover:text-ink"
                      }`}
                    >
                      <span>{t.label}</span>
                      <span className="text-xs tabular-nums text-ink-500">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="rounded-2xl border border-gold-light/50 bg-white p-4 text-sm text-ink-700">
            <p className="font-semibold text-ink">Still have a question?</p>
            <p className="mt-1">
              <Link href="/contact" className="font-medium text-gold-700 underline underline-offset-2">Contact us</Link> or{" "}
              <Link href="/book-a-call" className="font-medium text-gold-700 underline underline-offset-2">book a call</Link>.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <div ref={listTop} className="mt-4 flex flex-wrap items-center justify-between gap-3 lg:mt-0">
          <p className="text-sm text-ink-700">
            <span role="status" aria-live="polite">
              {status}
            </span>
            {terms.length > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setQuery("")} className="font-medium text-gold-700 underline underline-offset-2 hover:text-gold-900">
                  Clear search
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
          <section key={g.key} id={SECTION_ID(g.key)} data-key={g.key} aria-labelledby={`${SECTION_ID(g.key)}-h`} className="mt-8 scroll-mt-56 first-of-type:mt-4 lg:scroll-mt-28">
            <h2 id={`${SECTION_ID(g.key)}-h`} tabIndex={-1} className="mb-3 font-serif text-xl font-semibold text-ink focus:outline-none">
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
          <p className="mt-10 text-sm text-ink-700 lg:hidden">
            Still have a question? <Link href="/contact" className="font-medium text-gold-700 underline underline-offset-2">Contact us</Link> or{" "}
            <Link href="/book-a-call" className="font-medium text-gold-700 underline underline-offset-2">book a call</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
