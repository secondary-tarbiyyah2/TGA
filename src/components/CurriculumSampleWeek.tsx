"use client";

import { useState } from "react";
import { SCHOOL_WEEK_NOTE, keyStages as defaultStages, type KeyStage } from "@/content/curriculum";

/** Live lessons a week by subject for one key stage, from the Curriculum Policy. */
export function WeeklyLessons({ ks }: { ks: KeyStage }) {
  return (
    <div className="mt-4">
      <table className="w-full overflow-hidden rounded-2xl border border-gold-light/50 bg-white text-sm">
        <caption className="sr-only">Live lessons a week for {ks.range}</caption>
        <thead>
          <tr className="border-b border-gold-light/50 text-left text-xs uppercase tracking-wide text-ink/65">
            <th scope="col" className="px-4 py-2.5 font-semibold">Subject</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Lessons a week</th>
          </tr>
        </thead>
        <tbody>
          {ks.weekly.map((w) => (
            <tr key={w.subject} className="border-b border-gold-light/40 last:border-0">
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">
                {w.subject}
              </th>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink/80">{w.lessons}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-cream/60">
            <th scope="row" className="px-4 py-2.5 text-left font-semibold text-ink">
              Total
            </th>
            <td className="px-4 py-2.5 text-right font-semibold text-ink">
              {ks.totalLessons.replace(/ a week.*$/, "")}, {ks.lessonLength} each
            </td>
          </tr>
        </tfoot>
      </table>
      {ks.note && <p className="mt-3 text-sm text-ink/75">{ks.note}</p>}
      <p className="mt-2 text-xs text-ink/70">{SCHOOL_WEEK_NOTE} Each year group&apos;s exact timetable is published before enrolment.</p>
    </div>
  );
}

/** The curriculum index page's key-stage switcher. */
export function CurriculumSampleWeek({ stages }: { stages?: KeyStage[] }) {
  const keyStages = stages && stages.length > 0 ? stages : defaultStages;
  const [active, setActive] = useState(keyStages[0].slug);
  const stage = keyStages.find((ks) => ks.slug === active) || keyStages[0];

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Key stage">
        {keyStages.map((ks) => (
          <button
            key={ks.slug}
            type="button"
            onClick={() => setActive(ks.slug)}
            aria-pressed={active === ks.slug}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active === ks.slug ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
          >
            {ks.range}
          </button>
        ))}
      </div>
      <WeeklyLessons ks={stage} />
      <a href={`/curriculum/${stage.slug}`} className="mt-3 inline-block text-sm font-semibold text-gold-700 underline">
        Full subject list for {stage.range} →
      </a>
    </div>
  );
}
