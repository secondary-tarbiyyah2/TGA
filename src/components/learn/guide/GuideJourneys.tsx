"use client";

// The "Day in the life" cards on the Portal guide home: one per journey for
// this role, with how far you got, Start, Carry on and Start again.

import { useEffect, useState } from "react";
import { Icon } from "@/components/learn/Icon";
import type { Journey } from "@/content/portal-guide";
import { setJourneyStep } from "@/lib/learn/portalPrefs";
import { startSpot } from "./guideStore";

export function startJourney(j: Journey, from = 0) {
  startSpot({
    kind: "journey",
    key: j.id,
    heading: j.title,
    index: Math.max(0, Math.min(from, j.steps.length - 1)),
    steps: j.steps.map((s) => ({ href: s.href, from: s.from, target: s.target, title: s.title, body: s.body })),
  });
}

export function GuideJourneys({ journeys, progress }: { journeys: Journey[]; progress: Record<string, number> }) {
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable after mount
    setJustDone(new URLSearchParams(window.location.search).get("journey") === "done");
  }, []);
  if (journeys.length === 0) return null;
  return (
    <section aria-labelledby="journeys-title" className="space-y-3">
      <div>
        <h2 id="journeys-title" className="text-lg font-semibold text-ink">
          A day in the life
        </h2>
        <p className="text-sm text-ink/70">A guided walk through the pages you use together, in the order you use them. It moves from page to page and points at the real buttons.</p>
      </div>
      {justDone && (
        <p role="status" className="rounded-lg border border-forest-200 bg-forest-50 px-3 py-2 text-sm text-forest-900">
          Journey finished. Each page it visited is ticked on the map below.
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {journeys.map((j) => {
          const at = progress[j.id];
          const finished = at === -1;
          const started = typeof at === "number" && at > 0;
          const pct = finished ? 100 : started ? Math.round((at / j.steps.length) * 100) : 0;
          return (
            <li key={j.id} data-guide="guide-journey" className="flex flex-col rounded-2xl border border-gold-light bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-900" aria-hidden="true">
                  <Icon name={finished ? "circleCheck" : "compass"} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-ink">{j.title}</h3>
                  <p className="mt-0.5 text-sm leading-snug text-ink/70">{j.summary}</p>
                </div>
              </div>
              <ol className="mt-3 flex flex-wrap gap-1" aria-label={`${j.steps.length} stops`}>
                {j.steps.map((s, i) => (
                  <li key={i} title={s.title} className={`h-1.5 flex-1 rounded-full ${finished || (started && i < at) ? "bg-forest-700" : "bg-gold-100"}`}>
                    <span className="sr-only">
                      {i + 1}. {s.title}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink/65">
                {finished ? "Finished" : started ? `Stopped at step ${at + 1} of ${j.steps.length}` : `${j.steps.length} steps, about ${Math.max(2, Math.round(j.steps.length * 0.5))} minutes`}
                <span className="sr-only">, {pct}% done</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {started && !finished ? (
                  <>
                    <button type="button" onClick={() => startJourney(j, at)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
                      <Icon name="play" className="h-4 w-4" />
                      Carry on
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJourneyStep(j.id, 0);
                        startJourney(j, 0);
                      }}
                      className="inline-flex min-h-10 items-center rounded-lg border border-gold-light px-3 text-sm font-medium text-ink hover:bg-cream"
                    >
                      Start again
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => startJourney(j, 0)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold ${finished ? "border border-gold-light text-ink hover:bg-cream" : "bg-teal-700 text-white hover:bg-teal-800"}`}
                  >
                    <Icon name={finished ? "rotateCcw" : "play"} className="h-4 w-4" />
                    {finished ? "Walk it again" : "Start the journey"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
