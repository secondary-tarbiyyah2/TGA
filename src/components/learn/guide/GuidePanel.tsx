"use client";

// The page's guide in a side panel (a bottom sheet on phones): what the page
// is for, when you'd use it, numbered steps naming the real buttons, tips, who
// else sees what you do, related pages, and "Show me", which spotlights the
// real elements on the page in turn. Opening it ticks the page as learned in
// the Portal guide's journey map.

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/learn/Icon";
import type { GuideEntry, GuideRole } from "@/content/portal-guide";
import { markGuideLearned } from "@/lib/learn/portalPrefs";
import { GUIDE_BUTTON_ID } from "./GuideButton";
import { closeGuidePanel, startSpot } from "./guideStore";

export const GUIDE_HOME = "/guide";
/** The Portal guide home page (journey map and A to Z) is live. */
const HAS_GUIDE_HOME = true;

export function GuidePanel({
  entry,
  role,
  entries,
  learned,
  pathname,
}: {
  entry: GuideEntry | null;
  role: GuideRole;
  entries: GuideEntry[] | null;
  learned: string[];
  pathname: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const byHref = new Map((entries || []).map((e) => [e.href, e]));
  const total = entries?.length || 0;
  const done = (entries || []).filter((e) => learned.includes(e.href)).length;

  // Focus moves into the panel; Esc closes it and returns to Guide me.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [entry?.href]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!panelRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (entry) markGuideLearned(entry.href);
  }, [entry]);

  function close() {
    closeGuidePanel();
    window.setTimeout(() => document.getElementById(GUIDE_BUTTON_ID)?.focus(), 0);
  }

  const showMe = () => {
    if (!entry) return;
    startSpot({
      kind: "show",
      key: entry.href,
      heading: "Show me",
      steps: entry.showMe.map((s) => ({ target: s.target, title: s.label, body: s.say })),
    });
  };

  return (
    <div
      ref={panelRef}
      id="portal-guide-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="guide-panel portal fixed z-[60] flex flex-col border-gold-light bg-white text-ink shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[78vh] max-sm:rounded-t-2xl max-sm:border-t sm:bottom-0 sm:right-0 sm:top-[60px] sm:w-[400px] sm:border-l"
    >
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gold-light sm:hidden" aria-hidden="true" />
      <div className="flex items-start gap-3 border-b border-gold-light px-5 pb-3 pt-3 sm:pt-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-900" aria-hidden="true">
          <Icon name="compass" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-900">Portal guide{entry ? ` · ${entry.category}` : ""}</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-snug text-ink outline-none">
            {entry ? entry.name : "This page"}
          </h2>
        </div>
        <button type="button" onClick={close} aria-label="Close the guide" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink/70 hover:bg-cream hover:text-ink">
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {!entries ? (
          <p className="text-sm text-ink/70">Loading the guide…</p>
        ) : !entry ? (
          <div className="space-y-3 text-sm text-ink/80">
            <p>There is no guide written for this page yet.</p>
            {HAS_GUIDE_HOME && <Link href={GUIDE_HOME} onClick={closeGuidePanel} className="font-semibold text-teal-700 underline">
              Open the Portal guide
            </Link>}
          </div>
        ) : (
          <article className="space-y-5 text-sm">
            <p className="text-base leading-relaxed text-ink">{entry.purpose}</p>
            <p className="rounded-lg bg-cream/70 px-3 py-2 text-ink/80">
              <span className="font-semibold text-ink">When you&apos;d use it: </span>
              {entry.when}
            </p>

            <button type="button" onClick={showMe} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
              <Icon name="eye" className="h-4 w-4" />
              Show me on this page
              <span className="font-normal text-white/85">
                ({entry.showMe.length} {entry.showMe.length === 1 ? "thing" : "things"})
              </span>
            </button>

            <section aria-labelledby={`${titleId}-how`}>
              <h3 id={`${titleId}-how`} className="text-[0.9375rem] font-semibold text-ink">
                How to use it
              </h3>
              <ol className="mt-2 space-y-2.5">
                {entry.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-xs font-semibold text-forest-900" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed text-ink/85">
                      <span className="sr-only">Step {i + 1}: </span>
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby={`${titleId}-tips`}>
              <h3 id={`${titleId}-tips`} className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-ink">
                <Icon name="lightbulb" className="h-4 w-4 text-gold-900" />
                Tips
              </h3>
              <ul className="mt-2 space-y-1.5">
                {entry.tips.map((t, i) => (
                  <li key={i} className="leading-relaxed text-ink/85">
                    {t}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby={`${titleId}-who`} className="rounded-lg border border-gold-light px-3 py-2.5">
              <h3 id={`${titleId}-who`} className="flex items-center gap-1.5 font-semibold text-ink">
                <Icon name="shieldCheck" className="h-4 w-4 text-forest-900" />
                Who else sees this
              </h3>
              <p className="mt-1 leading-relaxed text-ink/80">{entry.privacy}</p>
            </section>

            {entry.related.length > 0 && (
              <section aria-labelledby={`${titleId}-rel`}>
                <h3 id={`${titleId}-rel`} className="text-[0.9375rem] font-semibold text-ink">
                  Related pages
                </h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {entry.related.map((h) => {
                    const r = byHref.get(h);
                    if (!r) return null;
                    const isDetail = r.detail;
                    return (
                      <li key={h}>
                        {isDetail ? (
                          <span className="inline-flex min-h-9 items-center rounded-full border border-gold-light px-3 text-ink/70">{r.name}</span>
                        ) : (
                          <Link href={h} onClick={() => window.setTimeout(() => headingRef.current?.focus(), 50)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-gold-light px-3 font-medium text-ink hover:border-teal-700 hover:text-teal-800">
                            {learned.includes(h) && <Icon name="check" className="h-3.5 w-3.5 text-forest-900" />}
                            {r.name}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </article>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gold-light px-5 py-3 text-sm">
        {HAS_GUIDE_HOME && (
          <Link href={`${GUIDE_HOME}?from=${encodeURIComponent(pathname)}`} onClick={closeGuidePanel} className="font-semibold text-teal-700 hover:underline">
            Open the Portal guide
          </Link>
        )}
        {total > 0 && (
          <span className="ml-auto text-xs text-ink/65" aria-label={`${done} of ${total} pages learned`}>
            {done} of {total} pages learned
          </span>
        )}
        <span className="sr-only">Guide for {role === "pupil" ? "pupils" : "your role"}. Press Escape to close.</span>
      </div>
    </div>
  );
}
