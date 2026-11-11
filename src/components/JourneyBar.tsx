"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Container } from "./Container";
import { Icon } from "@/components/learn/Icon";
import { JOURNEY, journeyIndex, normalisePath } from "@/lib/siteJourney";

/**
 * "Your journey": a five-step strip (Explore, Check the fit, Fees, Meet us,
 * Apply) at the top of every page on a prospective family's path. It shows
 * where this page sits and links straight to the next step, so a family is
 * never left wondering where to go after reading a page.
 *
 * A step is ticked only once this visitor has opened it (owner, 11 Nov 2026:
 * opening Open evenings straight away must not show Explore, Check the fit
 * and Fees as done). Visited steps are remembered in this browser only.
 */
const VISITED_KEY = "tga:journey-visited";

function readVisited(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(VISITED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function JourneyBar() {
  const path = normalisePath(usePathname() || "/");
  const at = journeyIndex(path);
  const [visited, setVisited] = useState<string[]>([]);

  useEffect(() => {
    if (at === -1) return;
    const key = JOURNEY[at].key;
    const seen = readVisited();
    const updated = seen.includes(key) ? seen : [...seen, key];
    try {
      window.localStorage.setItem(VISITED_KEY, JSON.stringify(updated));
    } catch {
      /* storage blocked: ticks just stay off */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the browser's record after mount (static export)
    setVisited(updated);
  }, [at]);

  if (at === -1) return null;
  const next = JOURNEY[at + 1];

  return (
    <nav aria-label="Your journey" className="journey-bar border-b border-gold-light/40 bg-white/80 backdrop-blur">
      <Container className="flex items-center gap-3 py-2.5">
        <span className="hidden shrink-0 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-700 md:inline">Your journey</span>
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {JOURNEY.map((s, i) => {
            const state = i === at ? "here" : visited.includes(s.key) ? "done" : "todo";
            return (
              <li key={s.key} className="flex shrink-0 items-center gap-1">
                {i > 0 && <span aria-hidden="true" className={`h-px w-4 sm:w-6 ${visited.includes(s.key) && visited.includes(JOURNEY[i - 1].key) ? "bg-gold-500" : "bg-gold-light/70"}`} />}
                <Link
                  href={s.href}
                  aria-current={state === "here" ? "step" : undefined}
                  className={`flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
                    state === "here"
                      ? "bg-ink-900 text-white"
                      : state === "done"
                        ? "text-gold-900 hover:bg-gold-50"
                        : "text-ink/70 hover:bg-gold-50 hover:text-ink"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[0.65rem] ${
                      state === "here" ? "bg-gold-500 text-ink-900" : state === "done" ? "bg-gold-100 text-gold-900" : "border border-gold-light text-ink/70"
                    }`}
                  >
                    {state === "done" ? <Icon name="check" size="sm" className="h-3 w-3" strokeWidth={2.5} /> : i + 1}
                  </span>
                  <span className={state === "here" ? "" : "hidden sm:inline"}>{s.label}</span>
                  {state === "done" && <span className="sr-only"> (visited)</span>}
                </Link>
              </li>
            );
          })}
        </ol>
        {next && (
          <Link
            href={next.href}
            className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-gold-500 px-3.5 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-gold-100 sm:inline-flex"
          >
            <span className="text-ink/70">Next:</span> {next.nextLabel}
            <Icon name="arrowRight" size="sm" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </Container>
    </nav>
  );
}

/** A large "next step" card at the foot of journey pages, the same next step as the bar. */
export function JourneyNext() {
  const path = normalisePath(usePathname() || "/");
  const at = journeyIndex(path);
  if (at === -1 || at === JOURNEY.length - 1) return null;
  const next = JOURNEY[at + 1];
  return (
    <section aria-labelledby="journey-next-heading" className="bg-cream">
      <Container className="pt-10">
        <Link href={next.href} className="glow-border group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-ink-900 p-5 text-white sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold-300/40 bg-gold-300/10 text-gold-300">
            <Icon name={next.icon} size="lg" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold-300">
              Step {at + 2} of {JOURNEY.length}
            </span>
            <span id="journey-next-heading" className="mt-0.5 block font-serif text-lg font-semibold sm:text-xl">
              Next: {next.nextLabel}
            </span>
          </span>
          <Icon name="arrowRight" className="h-6 w-6 shrink-0 text-gold-300 transition-transform group-hover:translate-x-1" />
        </Link>
      </Container>
    </section>
  );
}
