"use client";

import { useState } from "react";
import { keyStages } from "@/content/curriculum";

/**
 * Embeds a real sample-week grid directly on the curriculum index page —
 * previously the page was one hero + a 4-card grid with no content of its
 * own, making every visitor click through to a key stage page just to see
 * a sample week. Same real sampleWeek data each key stage page already
 * shows (content/curriculum.ts), just reachable without navigating away.
 */
export function CurriculumSampleWeek() {
  const [active, setActive] = useState(keyStages[0].slug);
  const stage = keyStages.find((ks) => ks.slug === active) || keyStages[0];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {keyStages.map((ks) => (
          <button
            key={ks.slug}
            type="button"
            onClick={() => setActive(ks.slug)}
            aria-pressed={active === ks.slug}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active === ks.slug ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"
            }`}
          >
            {ks.range}
          </button>
        ))}
      </div>
      <div className="mt-6 divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50">
        {stage.sampleWeek.map((d) => (
          <div key={d.day} className="flex justify-between bg-white px-4 py-3 text-sm">
            <span className="font-semibold text-ink">{d.day}</span>
            <span className="text-ink/70">{d.focus}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink/70">
        Illustrative sample for {stage.range} — the confirmed timetable is published ahead of enrolment.{" "}
        <a href={`/curriculum/${stage.slug}`} className="font-semibold text-gold-700 underline">
          Full subject list for this stage →
        </a>
      </p>
    </div>
  );
}
