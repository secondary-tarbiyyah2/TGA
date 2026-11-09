"use client";

import { StatusChip, type Tone } from "@/components/learn/ui";
import { Icon, type IconName } from "@/components/learn/Icon";

type Band = "Well below" | "Below" | "Expected" | "Above" | "Well above";
export type ReportData = {
  version?: number;
  year: number;
  headline?: { key: string; label: string; workingAt: number | null; band: Band | null; note: string }[];
  placement?: string;
  strands: { key: string; label: string; correct: number; total: number; workingAt: number | null; low: number | null; high: number | null; band: string | null; gaps: string[] }[];
  writing: {
    band: string; mean: number; workingAt: number; source?: "staff" | "ai" | "estimate"; provisional?: boolean;
    strands?: { key: string; label: string; score: number; comment?: string }[]; feedback?: string; nextSteps?: string[]; flags?: string[];
    checkedBy?: string; checkedAt?: string; decision?: string; overrideReason?: string; notes?: string; wordCount?: number;
  } | null;
  quran: { group: string; summary: string } | null;
  arabic: { group: string; summary: string } | null;
  overall: { attainment: number | null; english?: number | null; reasoning: number | null };
  narrative: string[];
  recommendations: { area: string; subject?: string; text: string }[];
  integrity: {
    notes: string[]; tabHides: number; fastAnswers: number; answered: number; unanswered: number; endedForLeaving?: string[];
    rating?: "No concerns" | "Some concerns" | "Review needed";
    counts?: { away: number; awaySeconds: number; blur: number; fullscreenExits: number; copy: number; paste: number; rightClick: number; shortcuts: number; otherSessions: number; breaks: number; breakSeconds: number; rapid: number; timed: number; longestSameLetter: number };
    timeline?: { t: string; section?: string; text: string; kind: "info" | "note" | "break" }[];
  };
  access?: { extraTimePct?: number; readAloud?: boolean; largeText?: boolean; breaks?: { perSection: number; minutes: number }; other?: string };
  pending: string[];
  caveat: string;
};

const BAND_TONE: Record<string, Tone> = { "Well below": "bad", Below: "warn", Expected: "neutral", Above: "info", "Well above": "good" };
const RATING: Record<string, { tone: Tone; icon: IconName; text: string }> = {
  "No concerns": { tone: "good", icon: "shieldCheck", text: "Nothing in how the assessment was sat needs attention." },
  "Some concerns": { tone: "warn", icon: "shieldCheck", text: "A few things are worth knowing about. They are usually innocent; read them alongside the results." },
  "Review needed": { tone: "bad", icon: "shieldAlert", text: "Several things together are worth a gentle conversation with the family before relying on the results." },
};
const SUBJECTS = ["Maths", "English", "Reasoning", "Qur'an and Arabic", "Support"] as const;
const SUBJECT_OF: Record<string, (typeof SUBJECTS)[number]> = {
  Maths: "Maths", Reading: "English", "Spelling and grammar": "English", Writing: "English", "How the pupil learns": "Reasoning", Potential: "Reasoning", Support: "Support", "Qur'an": "Qur'an and Arabic", Arabic: "Qur'an and Arabic",
};
const SUBJECT_ICON: Record<string, { icon: IconName; tile: string }> = {
  Maths: { icon: "calculator", tile: "tile-blue" },
  English: { icon: "bookOpen", tile: "tile-violet" },
  Reasoning: { icon: "lightbulb", tile: "tile-amber" },
  "Qur'an and Arabic": { icon: "bookMarked", tile: "tile-emerald" },
  Support: { icon: "heartHandshake", tile: "tile-rose" },
};
const FLAG_TEXT: Record<string, string> = {
  very_short: "Very short for the time given",
  off_topic: "May not answer the task",
  possibly_not_own_work: "Style may not be the pupil's own: worth a look",
  safeguarding_concern: "Possible safeguarding concern",
  not_in_english: "Not written in English",
  hard_to_read: "Hard to read",
};
const label = (t: number) => (t < 0.75 ? "below Y1" : t >= 11.75 ? "beyond Y11" : `Y${Math.round(t)}`);
const dur = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One row of the chart: the pupil's year as a line, the estimate as a dot, the likely range as a bar. */
function Scale({ year, at, low, high }: { year: number; at: number; low: number | null; high: number | null }) {
  const pos = (v: number) => `${(Math.max(0.5, Math.min(12, v)) - 0.5) / 11.5 * 100}%`;
  return (
    <div className="relative h-6" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-cream via-gold-100 to-cream print:bg-gray-200" />
      {Array.from({ length: 11 }, (_, i) => <span key={i} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink/15" style={{ left: pos(i + 1) }} />)}
      {low !== null && high !== null && <span className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-teal-700/20" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} />}
      <span className="absolute top-0 h-6 w-0.5 bg-ink/60" style={{ left: pos(year) }} />
      <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-700 shadow" style={{ left: pos(at) }} />
    </div>
  );
}

/** 0–4 relative to the year group, as five small blocks. */
function Pips({ score, name }: { score: number; name: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${name}: ${["well below", "below", "expected", "above", "well above"][score]} (${score} of 4)`}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`h-2.5 w-5 rounded-sm ${i <= score ? (score < 2 ? "bg-amber-500" : score === 2 ? "bg-teal-700" : "bg-green-700") : "bg-ink/10"} ${i === 2 ? "ring-1 ring-ink/30" : ""}`} />)}
    </span>
  );
}

function Card({ title, children, icon, tile, aside, breakable }: { title: string; children: React.ReactNode; icon?: IconName; tile?: string; aside?: React.ReactNode; breakable?: boolean }) {
  // Long cards may run on to the next page (their rows still stay whole) rather than leave half a page blank.
  return (
    <section className={`${breakable ? "" : "break-inside-avoid "}rounded-2xl border border-gold-light bg-white p-5 print:border-gray-300 print:p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">{icon && <span className={`portal-tile ${tile || "tile-slate"} print:hidden`} aria-hidden="true"><Icon name={icon} /></span>}{title}</h3>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EntryReport({ report, name }: { report: ReportData; name: string }) {
  const r = report;
  const first = name.split(" ")[0];
  const integ = r.integrity;
  const rating = integ.rating ? RATING[integ.rating] : null;
  // Older reports have no headline: build one from the strands.
  const headline = r.headline || r.strands.filter((s) => ["maths", "reading", "spag"].includes(s.key)).map((s) => ({ key: s.key, label: s.label, workingAt: s.workingAt, band: s.band as Band | null, note: `${s.correct}/${s.total} correct` }));
  const groups = SUBJECTS.map((sub) => ({ sub, recs: r.recommendations.filter((x) => (x.subject || SUBJECT_OF[x.area] || "Support") === sub) })).filter((g) => g.recs.length);
  const gaps = r.strands.filter((s) => s.gaps.length);
  const access = r.access || {};
  const accessList = [access.extraTimePct ? `${access.extraTimePct}% extra time` : "", access.readAloud ? "questions read aloud" : "", access.largeText ? "larger text" : "", access.breaks ? `up to ${access.breaks.perSection} break${access.breaks.perSection === 1 ? "" : "s"} of ${access.breaks.minutes} min in each part` : "", access.other || ""].filter(Boolean);
  const w = r.writing;
  // Times the pupil left the assessment during timed parts: another tab or app
  // (away) plus another window in front (blur). Same rule as the pupil's own count.
  const leaves = integ.counts ? integ.counts.away + integ.counts.blur : integ.tabHides;
  const leaveTone: Tone = leaves === 0 ? "good" : leaves === 1 ? "neutral" : leaves < 4 ? "warn" : "bad";
  const ended = integ.endedForLeaving || [];

  return (
    <article className="space-y-4 print:space-y-3 print:text-[11pt]" aria-label={`Entry assessment report for ${name}`}>
      {r.pending.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:hidden">Still to mark or check: {r.pending.join(", ")}. The report updates as soon as you save the marks.</p>
      )}

      {/* 1. Summary */}
      <Card title={`Summary for ${first}`} icon="clipboardCheck" tile="tile-gold" aside={rating && <StatusChip tone={rating.tone}>How it was sat: {integ.rating}</StatusChip>}>
        <div className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 print:bg-transparent ${leaves === 0 ? "border-gold-light/70 bg-white" : leaves < 4 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
          <p className="text-lg font-semibold text-ink">
            {leaves === 0 ? "Did not leave the assessment" : `Left the assessment ${leaves} ${leaves === 1 ? "time" : "times"}`}
          </p>
          {leaves > 0 && integ.counts && integ.counts.awaySeconds > 0 && <span className="text-sm text-ink/75">about {dur(integ.counts.awaySeconds)} away in all</span>}
          {ended.length > 0 && <StatusChip tone="bad">{ended.join(", ")} ended early for leaving</StatusChip>}
          <span className="ml-auto print:hidden"><StatusChip tone={leaveTone}>{leaves === 0 ? "Stayed on the page" : leaves === 1 ? "Once" : leaves < 4 ? "A few times" : "Many times"}</StatusChip></span>
        </div>
        {r.placement && <p className="rounded-xl bg-cream px-4 py-3 font-semibold text-ink print:bg-transparent print:px-0">{r.placement}</p>}
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Each area against the expectation for Year {r.year}</caption>
          <thead className="sr-only"><tr><th>Area</th><th>Against Year {r.year}</th><th>Working at</th><th>Details</th></tr></thead>
          <tbody className="divide-y divide-gold-light/50">
            {headline.map((h) => (
              <tr key={h.key}>
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">{h.label}</th>
                <td className="py-2 pr-3">{h.band ? <StatusChip tone={BAND_TONE[h.band]}>{h.band}</StatusChip> : <span className="text-ink/60">Not enough to judge</span>}</td>
                <td className="py-2 pr-3 tabular-nums text-ink">{h.workingAt !== null ? label(h.workingAt) : "–"}</td>
                <td className="hidden py-2 text-ink/60 sm:table-cell print:table-cell">{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(r.quran || r.arabic) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {r.quran && <p className="rounded-xl border border-gold-light/70 px-3 py-2 text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-ink/60">Qur&apos;an group</span><b className="text-ink">{r.quran.group}</b></p>}
            {r.arabic && <p className="rounded-xl border border-gold-light/70 px-3 py-2 text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-ink/60">Arabic group</span><b className="text-ink">{r.arabic.group}</b></p>}
          </div>
        )}
      </Card>

      {/* 2. Strands */}
      <Card title="Strand by strand" icon="chartLine" tile="tile-blue" breakable aside={<span className="text-xs text-ink/60"><span className="mr-1 inline-block h-3 w-0.5 bg-ink/60 align-middle" /> Year {r.year} <span className="mx-1 inline-block h-3 w-3 rounded-full bg-teal-700 align-middle" /> estimate <span className="mx-1 inline-block h-2 w-5 rounded-full bg-teal-700/20 align-middle" /> likely range</span>}>
        <ul className="divide-y divide-gold-light/50">
          {r.strands.map((s) => (
            <li key={s.key} className="grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[11rem_1fr_9rem] sm:items-center">
              <span><span className="block text-sm font-semibold text-ink">{s.label}</span><span className="block text-xs text-ink/60">{s.correct}/{s.total} correct</span></span>
              {s.workingAt !== null ? <Scale year={r.year} at={s.workingAt} low={s.low} high={s.high} /> : <span className="text-sm text-ink/60">Too few answers to judge</span>}
              <span className="flex items-center gap-2 sm:justify-end">
                {s.workingAt !== null && <span className="text-sm font-semibold tabular-nums text-ink">{label(s.workingAt)}</span>}
                {s.band && <StatusChip tone={BAND_TONE[s.band]}>{s.band}</StatusChip>}
              </span>
            </li>
          ))}
        </ul>
        {/* On paper the scale gets year labels, so the chart reads without the screen's hover and colour cues. */}
        <div className="relative mt-1 hidden h-4 text-[8pt] text-ink/60 print:grid print:grid-cols-[11rem_1fr_9rem] print:gap-x-4" aria-hidden="true">
          <span />
          <span className="relative">
            {[1, 3, 5, 7, 9, 11].map((y) => <span key={y} className="absolute -translate-x-1/2" style={{ left: `${(y - 0.5) / 11.5 * 100}%` }}>Y{y}</span>)}
          </span>
          <span />
        </div>
        {r.narrative.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/75">{r.narrative.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </Card>

      {/* 3. Next steps by subject */}
      {groups.length > 0 && (
        <Card title="Recommended next steps" icon="listChecks" tile="tile-teal" breakable>
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((g) => {
              const ic = SUBJECT_ICON[g.sub];
              return (
                <div key={g.sub} className="break-inside-avoid">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink"><span className={`portal-tile ${ic.tile} print:hidden`} aria-hidden="true"><Icon name={ic.icon} /></span>{g.sub}</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-ink/85">{g.recs.map((x, i) => <li key={i}>{x.area !== g.sub && <b className="text-ink">{x.area}. </b>}{x.text}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 4. Writing */}
      {w && (
        <Card title="Writing" icon="notebookPen" tile="tile-violet" aside={<span className="flex flex-wrap items-center gap-2">
          <StatusChip tone={w.provisional ? "warn" : "good"}>{w.provisional ? (w.source === "ai" ? "AI first mark, not yet checked" : "Estimate – needs staff marking") : w.decision === "accepted" ? "AI mark accepted by staff" : w.decision === "adjusted" ? "AI mark adjusted by staff" : w.decision === "overridden" ? "Overall judgement set by staff" : "Marked by staff"}</StatusChip>
          <StatusChip tone={BAND_TONE[w.band]}>{w.band}</StatusChip>
        </span>}>
          {w.flags?.includes("safeguarding_concern") && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">The marker flagged a possible safeguarding concern. Read the writing and follow the safeguarding policy.</p>}
          {w.strands?.length ? (
            <ul className="space-y-1.5">
              {w.strands.map((s) => (
                <li key={s.key} className="grid gap-x-3 sm:grid-cols-[14rem_auto_1fr] sm:items-center">
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  <Pips score={s.score} name={s.label} />
                  <span className="text-xs text-ink/65">{s.comment}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink/70">Average {w.mean} of 4 against the Year {r.year} expectation.</p>}
          {w.feedback && <p className="mt-3 text-sm text-ink/85">{w.feedback}</p>}
          {w.nextSteps?.length ? <p className="mt-2 text-sm text-ink/85"><b className="text-ink">Next steps:</b> {w.nextSteps.join("; ")}</p> : null}
          {w.flags?.filter((f) => f !== "safeguarding_concern").length ? <p className="mt-2 text-xs text-ink/65">Notes: {w.flags.filter((f) => f !== "safeguarding_concern").map((f) => FLAG_TEXT[f] || f).join("; ")}</p> : null}
          {w.overrideReason && <p className="mt-2 text-sm text-ink/80"><b className="text-ink">Why the overall judgement was changed:</b> {w.overrideReason}</p>}
          {w.notes && <p className="mt-2 text-sm text-ink/80"><b className="text-ink">Teacher&apos;s note:</b> {w.notes}</p>}
          {w.checkedBy && <p className="mt-2 text-xs text-ink/55">Checked by {w.checkedBy}{w.checkedAt ? ` on ${time(w.checkedAt)}` : ""}.{w.wordCount ? ` ${w.wordCount} words.` : ""}</p>}
        </Card>
      )}

      {/* 5. How it was sat */}
      <Card title="How this was sat" breakable icon={rating?.icon || "shieldCheck"} tile="tile-slate" aside={rating && <StatusChip tone={rating.tone}>{integ.rating}</StatusChip>}>
        {rating && <p className="text-sm text-ink/80">{rating.text}</p>}
        {integ.counts && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Switched tab or app", `${integ.counts.away}${integ.counts.away ? ` (${dur(integ.counts.awaySeconds)})` : ""}`],
              ["Breaks (allowed)", `${integ.counts.breaks}${integ.counts.breaks ? ` (${dur(integ.counts.breakSeconds)})` : ""}`],
              ["Very quick answers", `${integ.counts.rapid} of ${integ.counts.timed}`],
              ["Second window", String(integ.counts.otherSessions)],
              ["Copy or paste tried", String(integ.counts.copy + integ.counts.paste)],
              ["Left full screen", String(integ.counts.fullscreenExits)],
              ["Blocked shortcuts", String(integ.counts.shortcuts + integ.counts.rightClick)],
              ["Longest same-letter run", String(integ.counts.longestSameLetter)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-cream/70 px-3 py-2 print:bg-transparent print:px-0"><dt className="text-xs text-ink/60">{k}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>
            ))}
          </dl>
        )}
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/80">{integ.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="mt-3 text-sm text-ink/75"><b className="text-ink">Access arrangements:</b> {accessList.length ? accessList.join(", ") : "none"}.</p>
        {integ.timeline && integ.timeline.length > 0 && (
          <details className="mt-3 print:hidden">
            <summary className="cursor-pointer text-sm font-medium text-teal-800">Timeline ({integ.timeline.length} entries)</summary>
            <ol className="mt-2 max-h-72 space-y-0.5 overflow-y-auto text-xs">
              {integ.timeline.map((e, i) => (
                <li key={i} className={`flex gap-3 ${e.kind === "note" ? "text-ink" : "text-ink/60"}`}>
                  <span className="w-28 shrink-0 tabular-nums">{time(e.t)}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </Card>

      {/* 6. Gaps to teach */}
      {gaps.length > 0 && (
        <>
          <details className="break-inside-avoid rounded-2xl border border-gold-light bg-white p-5 print:hidden">
            <summary className="cursor-pointer text-base font-semibold text-ink">Gaps to teach <span className="font-normal text-ink/60">(questions at or below Year {r.year} answered wrongly)</span></summary>
            <GapList gaps={gaps} />
          </details>
          <section className="hidden break-inside-avoid rounded-2xl border border-gray-300 p-3 print:block">
            <h3 className="text-base font-semibold">Gaps to teach (questions at or below Year {r.year} answered wrongly)</h3>
            <GapList gaps={gaps} />
          </section>
        </>
      )}

      <p className="px-1 text-xs text-ink/60">{r.caveat.includes("not a diagnosis") ? r.caveat : `${r.caveat} This report is not a diagnosis.`}</p>
    </article>
  );
}

function GapList({ gaps }: { gaps: ReportData["strands"] }) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {gaps.map((s) => <div key={s.key}><p className="text-sm font-semibold text-ink">{s.label}</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink/75">{s.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>)}
    </div>
  );
}
