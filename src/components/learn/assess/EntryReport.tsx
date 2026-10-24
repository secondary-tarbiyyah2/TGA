"use client";

import { StatusChip, type Tone } from "@/components/learn/ui";
import { Icon, type IconName } from "@/components/learn/Icon";

export type ReportData = {
  year: number;
  strands: { key: string; label: string; correct: number; total: number; workingAt: number | null; low: number | null; high: number | null; band: string | null; gaps: string[] }[];
  writing: { band: string; mean: number; workingAt: number } | null;
  quran: { group: string; summary: string } | null;
  arabic: { group: string; summary: string } | null;
  overall: { attainment: number | null; reasoning: number | null };
  narrative: string[];
  recommendations: { area: string; text: string }[];
  integrity: { notes: string[]; tabHides: number; fastAnswers: number; answered: number; unanswered: number };
  pending: string[];
  caveat: string;
};

const BAND_TONE: Record<string, Tone> = { "Well below": "bad", Below: "warn", Expected: "neutral", Above: "info", "Well above": "good" };
const AREA_ICON: Record<string, { icon: IconName; tile: string }> = {
  Maths: { icon: "calculator", tile: "tile-blue" },
  Reading: { icon: "bookOpen", tile: "tile-violet" },
  "Spelling and grammar": { icon: "notebookPen", tile: "tile-rose" },
  Writing: { icon: "notebookPen", tile: "tile-violet" },
  "Qur'an": { icon: "bookMarked", tile: "tile-emerald" },
  Arabic: { icon: "languages", tile: "tile-teal" },
  "How the pupil learns": { icon: "lightbulb", tile: "tile-amber" },
  Potential: { icon: "trophy", tile: "tile-gold" },
  Support: { icon: "heartHandshake", tile: "tile-rose" },
};
const label = (t: number) => (t < 0.75 ? "below Y1" : t >= 11.75 ? "beyond Y11" : `Y${Math.round(t)}`);

/** One row of the chart: the pupil's year as a line, the estimate as a dot, the likely range as a bar. */
function Scale({ year, at, low, high }: { year: number; at: number; low: number | null; high: number | null }) {
  const pos = (v: number) => `${(Math.max(0.5, Math.min(12, v)) - 0.5) / 11.5 * 100}%`;
  return (
    <div className="relative h-8" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-cream via-gold-100 to-cream" />
      {Array.from({ length: 11 }, (_, i) => (
        <span key={i} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink/15" style={{ left: pos(i + 1) }} />
      ))}
      {low !== null && high !== null && <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-teal-700/20" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />}
      <span className="absolute top-0 h-8 w-0.5 bg-ink/60" style={{ left: pos(year) }} />
      <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-700 shadow" style={{ left: pos(at) }} />
    </div>
  );
}

export function EntryReport({ report, name }: { report: ReportData; name: string }) {
  const r = report;
  const first = name.split(" ")[0];
  return (
    <article className="space-y-5 print:space-y-3" aria-label={`Entry assessment report for ${name}`}>
      {r.pending.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">Still to mark: {r.pending.join(", ")}. The report updates as soon as you save the marks.</p>
      )}

      <section className="rounded-2xl border border-gold-light bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">Where {first} is working</h3>
          <span className="text-xs text-ink/60"><span className="mr-1 inline-block h-3 w-0.5 bg-ink/60 align-middle" /> Year {r.year} &nbsp;<span className="mx-1 inline-block h-3 w-3 rounded-full bg-teal-700 align-middle" /> estimate &nbsp;<span className="mx-1 inline-block h-2 w-5 rounded-full bg-teal-700/20 align-middle" /> likely range</span>
        </div>
        <ul className="mt-1 divide-y divide-gold-light/50">
          {r.strands.map((s) => (
            <li key={s.key} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_1fr_9rem] sm:items-center">
              <span>
                <span className="block text-sm font-semibold text-ink">{s.label}</span>
                <span className="block text-xs text-ink/60">{s.correct}/{s.total} correct</span>
              </span>
              {s.workingAt !== null ? <Scale year={r.year} at={s.workingAt} low={s.low} high={s.high} /> : <span className="text-sm text-ink/60">Too few answers to judge</span>}
              <span className="flex items-center gap-2 sm:justify-end">
                {s.workingAt !== null && <span className="text-sm font-semibold tabular-nums text-ink">{label(s.workingAt)}</span>}
                {s.band && <StatusChip tone={BAND_TONE[s.band]}>{s.band}</StatusChip>}
              </span>
            </li>
          ))}
          {r.writing && (
            <li className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_1fr_9rem] sm:items-center">
              <span><span className="block text-sm font-semibold text-ink">Writing</span><span className="block text-xs text-ink/60">teacher&apos;s judgement</span></span>
              <Scale year={r.year} at={r.writing.workingAt} low={null} high={null} />
              <span className="flex items-center gap-2 sm:justify-end"><StatusChip tone={BAND_TONE[r.writing.band]}>{r.writing.band}</StatusChip></span>
            </li>
          )}
        </ul>
      </section>

      {(r.quran || r.arabic) && (
        <section className="grid gap-3 sm:grid-cols-2">
          {r.quran && (
            <div className="flex gap-3 rounded-2xl border border-gold-light bg-white p-4">
              <span className="portal-tile tile-emerald" aria-hidden="true"><Icon name="bookMarked" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Qur&apos;an group</p><p className="font-semibold text-ink">{r.quran.group}</p><p className="mt-1 text-sm text-ink/70">{r.quran.summary}</p></div>
            </div>
          )}
          {r.arabic && (
            <div className="flex gap-3 rounded-2xl border border-gold-light bg-white p-4">
              <span className="portal-tile tile-teal" aria-hidden="true"><Icon name="languages" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Arabic group</p><p className="font-semibold text-ink">{r.arabic.group}</p><p className="mt-1 text-sm text-ink/70">{r.arabic.summary}</p></div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-gold-light bg-white p-5">
        <h3 className="text-base font-semibold text-ink">Summary</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-ink/85">{r.narrative.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </section>

      {r.recommendations.length > 0 && (
        <section className="rounded-2xl border border-gold-light bg-white p-5">
          <h3 className="text-base font-semibold text-ink">Recommendations</h3>
          <ul className="mt-3 space-y-3">
            {r.recommendations.filter((x) => x.area !== "Qur'an" && x.area !== "Arabic").map((x, i) => {
              const ic = AREA_ICON[x.area] || { icon: "lightbulb" as IconName, tile: "tile-slate" };
              return (
                <li key={i} className="flex gap-3">
                  <span className={`portal-tile ${ic.tile}`} aria-hidden="true"><Icon name={ic.icon} /></span>
                  <p className="text-sm text-ink/85"><b className="text-ink">{x.area}.</b> {x.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {r.strands.some((s) => s.gaps.length) && (
        <details className="rounded-2xl border border-gold-light bg-white p-5">
          <summary className="cursor-pointer text-base font-semibold text-ink">Gaps to teach (questions at or below Year {r.year} answered wrongly)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {r.strands.filter((s) => s.gaps.length).map((s) => (
              <div key={s.key}><p className="text-sm font-semibold text-ink">{s.label}</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink/75">{s.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>
            ))}
          </div>
        </details>
      )}

      <section className="rounded-2xl border border-gold-light bg-cream/60 p-5 text-sm">
        <h3 className="font-semibold text-ink">How this was sat</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink/75">{r.integrity.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="mt-3 text-xs text-ink/60">{r.caveat}</p>
      </section>
    </article>
  );
}
