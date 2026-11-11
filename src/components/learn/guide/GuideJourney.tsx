"use client";

// "A day in the life": walks across the real pages in order. Each step goes
// to its page (following a real link when the page needs a record, such as
// one class), then spotlights the real element. Skippable step by step,
// stoppable at any time, and resumable: the step reached is saved with the
// person's guide progress, and every page it visits counts as learned.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { normalisePortalPath } from "@/lib/learn/nav";
import { markGuideLearned, setJourneyStep } from "@/lib/learn/portalPrefs";
import { GuideSpotlight, guideSelector } from "./GuideSpotlight";
import { endSpot, moveSpot, type Spot } from "./guideStore";

const clean = (p: string) => normalisePortalPath(p).replace(/\/+$/, "") || "/";

export function GuideJourney({ spot }: { spot: Spot }) {
  const pathname = clean(usePathname() || "/");
  const router = useRouter();
  const step = spot.steps[spot.index];
  const here = !!step?.href && pathname === clean(step.href);
  const going = useRef<string | null>(null);

  // Go to the step's page. A step that needs a record (one class) follows the
  // first real link inside its `from` target on the page we are on.
  useEffect(() => {
    if (!step?.href || here) {
      going.current = null;
      return;
    }
    const want = `${spot.key}:${spot.index}`;
    if (going.current === want) return;
    going.current = want;
    let href = step.href;
    if (step.from) {
      const link = document.querySelector<HTMLAnchorElement>(`${guideSelector(step.from)} a[href]`) || document.querySelector<HTMLAnchorElement>(`a[href][data-guide="${step.from}"]`);
      const to = link?.getAttribute("href");
      if (to && clean(to.split("?")[0]) === clean(step.href)) href = to;
    }
    router.push(href);
  }, [step, here, spot.key, spot.index, router]);

  // Remember where we are, and tick the page.
  useEffect(() => {
    setJourneyStep(spot.key, spot.index);
    if (here && step?.href) markGuideLearned(clean(step.href));
  }, [spot.key, spot.index, here, step]);

  if (!step) return null;
  if (!here) {
    return (
      <div role="status" className="portal fixed bottom-24 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink shadow-xl lg:bottom-6">
        Going to the next page…
      </div>
    );
  }
  return (
    <GuideSpotlight
      key={`${spot.key}:${spot.index}`}
      heading={spot.heading}
      steps={spot.steps}
      index={spot.index}
      onMove={moveSpot}
      stopLabel="Stop for now"
      finishLabel="Finish"
      missingNote="This part is not on the screen just now: it appears when there is something to show. Press Next to carry on."
      onStop={endSpot}
      onFinish={() => {
        setJourneyStep(spot.key, -1);
        endSpot();
        router.push("/guide?journey=done");
      }}
      extra={
        spot.index < spot.steps.length - 1 ? (
          <button type="button" onClick={() => moveSpot(spot.index + 1)} className="min-h-11 rounded-lg px-2 text-sm font-medium text-ink/70 underline-offset-2 hover:text-ink hover:underline sm:min-h-9">
            Skip this step
          </button>
        ) : null
      }
    />
  );
}
