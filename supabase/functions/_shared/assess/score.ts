// Turns answers into a report.
//
// What the numbers mean (and don't): every item has a curriculum level, so an
// estimate says "this child answers like a typical Year N pupil" for each
// strand. That is curriculum-referenced. It is NOT a nationally standardised
// score like GL's SAS, which needs a national sample to norm against. Once a
// year group has enough sittings, the Edge Function adds where the child sits
// among other TGA pupils of the same year (cohort percentile).
import { type Item, markItem, type Strand } from "./core.ts";
import type { BreakRules, Form, SectionKey } from "./form.ts";
import type { IntegritySummary } from "./integrity.ts";
import { bandOfMean, meanOf, WRITING_STRANDS, type WritingMark } from "./writing.ts";

export type Responses = Record<string, { value: unknown; ms?: number }>;

export type BandName = "Well below" | "Below" | "Expected" | "Above" | "Well above";
export type StrandResult = {
  key: string;
  label: string;
  correct: number;
  total: number;
  /** Ability estimate on the year scale (e.g. 4.3 ≈ "answers like a Year 4 pupil"). Null if too few items. */
  workingAt: number | null;
  low: number | null;
  high: number | null;
  band: BandName | null;
  gaps: string[];
};

export type Rubric = Record<string, number>;
export type TeacherMarks = {
  writing?: {
    scores: Rubric; notes?: string; markedBy?: string; markedAt?: string;
    /** Overall judgement set by staff when it differs from the strands' average (with a reason). */
    overall?: BandName; overrideReason?: string;
    /** How the staff mark relates to the AI/estimate first mark. */
    decision?: "accepted" | "adjusted" | "overridden" | "staff";
  };
  quran?: { stage: number; tajweed: number; fluency: number; juz: number; lastSurah?: string; notes?: string; markedBy?: string; markedAt?: string };
  arabic?: { letters: number; vowelled: number; unvowelled: number; understanding: number; speaking: number; notes?: string; markedBy?: string; markedAt?: string };
};

export type Integrity = IntegritySummary;
export type Context = {
  year: number; ageMonths?: number | null; summerBorn?: boolean; eal?: boolean; send?: string | null;
  extraTimePct?: number; readAloud?: boolean; largeText?: boolean; breaks?: BreakRules; otherArrangements?: string;
};

export type WritingReport = {
  band: BandName; mean: number; workingAt: number;
  /** staff = checked by a teacher; ai / estimate = first mark only, still to be checked. */
  source: "staff" | "ai" | "estimate";
  provisional: boolean;
  strands: { key: string; label: string; score: number; comment?: string }[];
  feedback?: string; nextSteps?: string[]; flags?: string[];
  checkedBy?: string; checkedAt?: string; decision?: string; overrideReason?: string; notes?: string; wordCount?: number;
};

export type Report = {
  version: 2;
  year: number;
  /** One line per area for the top of the report: Maths, English, Reasoning, Writing. */
  headline: { key: string; label: string; workingAt: number | null; band: BandName | null; note: string }[];
  /** One-line recommendation for placement. */
  placement: string;
  strands: StrandResult[];
  writing: WritingReport | null;
  quran: { group: string; summary: string } | null;
  arabic: { group: string; summary: string } | null;
  overall: { attainment: number | null; english: number | null; reasoning: number | null };
  narrative: string[];
  recommendations: { area: string; subject: "Maths" | "English" | "Reasoning" | "Qur'an and Arabic" | "Support"; text: string }[];
  integrity: Integrity;
  access: { extraTimePct?: number; readAloud?: boolean; largeText?: boolean; breaks?: BreakRules; other?: string };
  pendingTeacherSections: SectionKey[];
  /** Same as pendingTeacherSections (kept for the function and pupil-record sync). */
  pending: SectionKey[];
  /** Headline per area, copied onto the pupil record by entry_assessment_sync_baseline(). */
  estimates: { area: string; label: string; workingAt: number; band: BandName }[];
  /** Same as narrative. */
  summary: string[];
  caveat: string;
};

// ── item response model ────────────────────────────────────────────────────
// P(correct | θ) = c + (1−c)·σ(k(θ − b) + 0.6): at θ = item level b a pupil
// has ~65% chance (the level definition), c is the guessing floor for
// multiple choice. θ is found by maximum a posteriori over a grid with a weak
// prior centred on the pupil's year group, so all-right/all-wrong papers
// still give a sensible (if wide) estimate. The "likely range" is ±1 standard
// error from the test information.
const K = 1.3, OFFSET = 0.6, PRIOR_SD = 2.5;
const sig = (x: number) => 1 / (1 + Math.exp(-x));
function guess(item: Item): number {
  return item.type === "mcq" ? 1 / Math.max(2, item.choices?.length || item.choiceSvgs?.length || 4) : 0;
}

export function estimate(items: Item[], correct: boolean[], prior: number): { theta: number; se: number } | null {
  if (items.length < 3) return null;
  let best = prior, bestLL = -Infinity;
  for (let t = -0.5; t <= 13; t += 0.05) {
    let ll = -((t - prior) ** 2) / (2 * PRIOR_SD ** 2);
    items.forEach((it, i) => {
      const c = guess(it);
      const p = Math.min(0.999, Math.max(0.001, c + (1 - c) * sig(K * (t - it.level) + OFFSET)));
      ll += correct[i] ? Math.log(p) : Math.log(1 - p);
    });
    if (ll > bestLL) { bestLL = ll; best = t; }
  }
  let info = 1 / PRIOR_SD ** 2;
  for (const it of items) {
    const c = guess(it);
    const s = sig(K * (best - it.level) + OFFSET);
    const p = c + (1 - c) * s;
    const dp = (1 - c) * K * s * (1 - s);
    info += (dp * dp) / (p * (1 - p));
  }
  return { theta: Math.round(best * 10) / 10, se: Math.round((1 / Math.sqrt(info)) * 10) / 10 };
}

export function bandOf(diff: number): BandName {
  return diff <= -1.5 ? "Well below" : diff <= -0.5 ? "Below" : diff < 0.75 ? "Expected" : diff < 1.75 ? "Above" : "Well above";
}

export function yearLabel(t: number): string {
  if (t < 0.75) return "below Year 1";
  if (t >= 11.75) return "beyond Year 11 (GCSE)";
  return `Year ${Math.round(t)}`;
}

const STRAND_GROUPS: { key: string; label: string; strands: Strand[] }[] = [
  { key: "maths", label: "Maths", strands: ["maths"] },
  { key: "reading", label: "Reading", strands: ["reading", "phonics"] },
  { key: "spag", label: "Spelling and grammar", strands: ["spelling", "grammar"] },
  { key: "verbal", label: "Verbal reasoning", strands: ["verbal"] },
  { key: "quantitative", label: "Number reasoning", strands: ["quantitative"] },
  { key: "nonverbal", label: "Non-verbal reasoning", strands: ["nonverbal"] },
];

export const QURAN_STAGES = [
  "Does not yet know the letters",
  "Knows the letters",
  "Reads letters with short vowels (harakat)",
  "Joins letters into words",
  "Reads sukun, shaddah, madd and tanween",
  "Reads from the mushaf slowly",
  "Reads the mushaf fluently",
];

export function quranGroup(q: NonNullable<TeacherMarks["quran"]>): { group: string; summary: string } {
  const stage = QURAN_STAGES[Math.max(0, Math.min(6, q.stage))];
  let group: string;
  if (q.stage <= 3) group = `Qa'idah group (stage ${q.stage + 1})`;
  else if (q.stage === 4) group = "Qa'idah completion → early Qur'an reading";
  else if (q.stage === 5) group = "Early Qur'an reading with tajweed";
  else if (q.juz >= 1) group = "Hifdh group";
  else group = "Fluent reading, beginning hifdh";
  const mem = q.juz >= 1 ? `${q.juz} juz' memorised` : q.lastSurah ? `memorised up to ${q.lastSurah}` : "little or no memorisation yet";
  return { group, summary: `${stage}; tajweed ${q.tajweed}/4, fluency ${q.fluency}/4; ${mem}.` };
}

export function arabicGroup(a: NonNullable<TeacherMarks["arabic"]>): { group: string; summary: string } {
  const total = a.letters * 2 + a.vowelled + a.unvowelled + a.understanding + a.speaking; // /20
  const group = total < 5 ? "Arabic Foundations (letters and sounds)" : total < 10 ? "Early Reading Arabic" : total < 15 ? "Intermediate Arabic" : "Advanced Arabic";
  return { group, summary: `Letters ${a.letters}/2, reads vowelled text ${a.vowelled}/4, unvowelled ${a.unvowelled}/4, understanding ${a.understanding}/4, speaking ${a.speaking}/4.` };
}

export const WRITING_RUBRIC = WRITING_STRANDS;
/** Each criterion is marked 0–4 RELATIVE TO THE YEAR GROUP: 0 well below, 1 below, 2 expected, 3 above, 4 well above. */

/** The writing result: the staff mark when there is one, otherwise the AI (or estimate) first mark, shown as provisional. */
export function writingResult(year: number, marks: TeacherMarks, first?: (WritingMark & { createdAt?: string }) | null): WritingReport | null {
  const w = marks.writing;
  const label = (k: string) => WRITING_STRANDS.find((s) => s.key === k)?.label || k;
  if (w?.scores && Object.keys(w.scores).length) {
    const mean = Object.values(w.scores).reduce((a, b) => a + b, 0) / Object.values(w.scores).length;
    const band = w.overall || bandOfMean(mean);
    const comments = first && w.decision !== "staff" ? first.strands : {};
    return {
      band, mean: Math.round(mean * 10) / 10, workingAt: Math.round((year + (BAND_ORDER.indexOf(band) - 2)) * 10) / 10,
      source: "staff", provisional: false,
      strands: WRITING_STRANDS.filter((s) => w.scores[s.key] !== undefined).map((s) => ({ key: s.key, label: s.label, score: w.scores[s.key], comment: w.scores[s.key] === comments[s.key]?.score ? comments[s.key]?.comment : undefined })),
      feedback: first?.feedback || undefined, nextSteps: first?.nextSteps?.length ? first.nextSteps : undefined, flags: first?.flags?.length ? first.flags : undefined,
      checkedBy: w.markedBy, checkedAt: w.markedAt, decision: w.decision, overrideReason: w.overrideReason, notes: w.notes, wordCount: first?.wordCount,
    };
  }
  if (first) {
    const mean = meanOf(first.strands);
    return {
      band: first.overall, mean: Math.round(mean * 10) / 10, workingAt: Math.round(first.workingAt * 10) / 10,
      source: first.source === "staff" ? "staff" : first.source, provisional: true,
      strands: WRITING_STRANDS.filter((s) => first.strands[s.key]).map((s) => ({ key: s.key, label: label(s.key), score: first.strands[s.key].score, comment: first.strands[s.key].comment })),
      feedback: first.feedback, nextSteps: first.nextSteps, flags: first.flags, wordCount: first.wordCount,
    };
  }
  return null;
}

const BAND_ORDER: BandName[] = ["Well below", "Below", "Expected", "Above", "Well above"];

export function buildReport(form: Form, responses: Responses, marks: TeacherMarks, ctx: Context, integrity: Integrity, extra: { firstWritingMark?: (WritingMark & { createdAt?: string }) | null } = {}): Report {
  const Y = form.year;
  const auto = form.sections.filter((s) => s.candidate).flatMap((s) => s.items.filter((i) => i.type !== "text"));
  const right = new Map(auto.map((i) => [i.id, markItem(i, responses[i.id]?.value)]));

  const strands: StrandResult[] = [];
  for (const g of STRAND_GROUPS) {
    const its = auto.filter((i) => g.strands.includes(i.strand));
    if (!its.length) continue;
    const c = its.map((i) => right.get(i.id) === true);
    const est = estimate(its, c, Y);
    const gaps = its.filter((i, k) => !c[k] && i.level <= Y + 0.5).map((i) => i.objective);
    strands.push({
      key: g.key, label: g.label, correct: c.filter(Boolean).length, total: its.length,
      workingAt: est?.theta ?? null, low: est ? Math.round((est.theta - est.se) * 10) / 10 : null, high: est ? Math.round((est.theta + est.se) * 10) / 10 : null,
      band: est ? bandOf(est.theta - Y) : null,
      gaps: [...new Set(gaps)],
    });
  }

  // Overall attainment (maths + English), English on its own, and reasoning (all three families).
  const pool = (keys: Strand[]) => auto.filter((i) => keys.includes(i.strand));
  const est = (its: Item[]) => estimate(its, its.map((i) => right.get(i.id) === true), Y)?.theta ?? null;
  const attainment = est(pool(["maths", "reading", "phonics", "spelling", "grammar"]));
  const english = est(pool(["reading", "phonics", "spelling", "grammar"]));
  const reasoning = est(pool(["verbal", "quantitative", "nonverbal"]));

  // Teacher-marked sections. Writing counts only once a member of staff has checked it.
  const writing = writingResult(Y, marks, extra.firstWritingMark);
  const quran = marks.quran ? quranGroup(marks.quran) : null;
  const arabic = marks.arabic ? arabicGroup(marks.arabic) : null;
  const pending = form.sections.filter((s) => (s.key === "writing" && (!writing || writing.provisional)) || (s.key === "quran" && !quran) || (s.key === "arabic" && !arabic)).map((s) => s.key);

  // Narrative and recommendations.
  const by = Object.fromEntries(strands.map((s) => [s.key, s]));
  const name = (s?: StrandResult) => (s && s.workingAt !== null ? `working at about ${yearLabel(s.workingAt)}` : "not enough answers to judge");
  const narrative: string[] = [];
  const recs: Report["recommendations"] = [];
  const d = (s?: StrandResult) => (s && s.workingAt !== null ? s.workingAt - Y : null);

  if (attainment !== null) narrative.push(`Across maths and English the pupil is ${bandOf(attainment - Y).toLowerCase()} the expectation for Year ${Y}, answering like a typical ${yearLabel(attainment)} pupil.`);
  if (by.maths) narrative.push(`Maths: ${name(by.maths)} (${by.maths.correct}/${by.maths.total} correct).`);
  if (by.reading) narrative.push(`Reading: ${name(by.reading)} (${by.reading.correct}/${by.reading.total}).`);
  if (by.spag) narrative.push(`Spelling and grammar: ${name(by.spag)} (${by.spag.correct}/${by.spag.total}).`);
  if (reasoning !== null) narrative.push(`Reasoning, which shows how the pupil thinks rather than what they have been taught, is ${bandOf(reasoning - Y).toLowerCase()} expectation.`);

  const dm = d(by.maths);
  if (dm !== null) {
    const set = dm <= -1.5 ? "a support group with a catch-up plan" : dm <= -0.5 ? "the core group, with targeted gap teaching" : dm < 1.75 ? "the core group" : "the extension group";
    recs.push({ area: "Maths", subject: "Maths", text: `Place in ${set}.${by.maths.gaps.length ? ` Gaps to teach first: ${by.maths.gaps.slice(0, 5).join("; ")}.` : ""}` });
  }
  const dr = d(by.reading);
  if (dr !== null && dr <= -0.5) recs.push({ area: "Reading", subject: "English", text: dr <= -1.5 ? `Daily guided reading and a phonics check${Y <= 4 ? "" : " (secondary phonics catch-up if gaps are found)"}; review after half a term.` : "Guided reading twice a week and reading at home every day; review after half a term." });
  else if (dr !== null && dr >= 1.75) recs.push({ area: "Reading", subject: "English", text: "Strong reader: stretch with challenging texts and the reading list for the year above." });
  const ds = d(by.spag);
  if (ds !== null && ds <= -1) recs.push({ area: "Spelling and grammar", subject: "English", text: `Weekly spelling and grammar practice from the Year ${Math.max(1, Math.round(by.spag.workingAt ?? Y))} list.${by.spag.gaps.length ? ` Start with: ${by.spag.gaps.slice(0, 3).join("; ")}.` : ""}` });
  if (writing) {
    const steps = writing.nextSteps?.length ? ` Next steps: ${writing.nextSteps.slice(0, 2).join("; ")}.` : "";
    recs.push({ area: "Writing", subject: "English", text: `Writing judged ${writing.band.toLowerCase()} expectation for Year ${Y}${writing.provisional ? " (first mark, still to be checked by a teacher)" : ""}.${steps}${writing.notes ? ` Teacher's note: ${writing.notes}` : ""}` });
  }

  const rs = ["verbal", "quantitative", "nonverbal"].map((k) => by[k]).filter((s): s is StrandResult => !!s && s.workingAt !== null);
  if (rs.length >= 2) {
    const hi = rs.reduce((a, b) => ((a.workingAt ?? 0) > (b.workingAt ?? 0) ? a : b));
    const lo = rs.reduce((a, b) => ((a.workingAt ?? 0) < (b.workingAt ?? 0) ? a : b));
    if ((hi.workingAt ?? 0) - (lo.workingAt ?? 0) >= 2) {
      let t = `Uneven reasoning profile: stronger in ${hi.label.toLowerCase()} than ${lo.label.toLowerCase()}.`;
      if (lo.key === "verbal" && ctx.eal) t += " With English as an additional language, low verbal reasoning is more likely to reflect vocabulary than ability; build academic vocabulary and re-check next term.";
      else if (lo.key === "verbal") t += " The pupil may understand more than they can yet put into words: use diagrams, models and worked examples, and teach vocabulary explicitly.";
      else if (hi.key === "verbal") t += " Explain in words and give spoken reasoning tasks; support visual-spatial work (shapes, graphs, geometry) with hands-on models.";
      recs.push({ area: "How the pupil learns", subject: "Reasoning", text: t });
    }
  }
  if (reasoning !== null && attainment !== null) {
    if (reasoning - attainment >= 1.5) recs.push({ area: "Potential", subject: "Reasoning", text: "Reasoning is well ahead of attainment, which usually means gaps in previous teaching rather than ability. Expect quick progress with a catch-up plan; set targets above the current level." });
    if (reasoning - Y <= -1.5 && attainment - Y <= -1.5) recs.push({ area: "Support", subject: "Support", text: "Both reasoning and attainment are well below expectation. Share the report with the SENCo and the family before placement, and agree whether further assessment would help. This report is not a diagnosis." });
  }
  if (integrity.counts.breaks >= 2) recs.push({ area: "Support", subject: "Support", text: "Several breaks helped this pupil to keep going. Short movement breaks and work in small chunks may help in class too. This is an observation, not a diagnosis." });
  if (quran) recs.push({ area: "Qur'an", subject: "Qur'an and Arabic", text: `${quran.group}. ${quran.summary}` });
  if (arabic) recs.push({ area: "Arabic", subject: "Qur'an and Arabic", text: `${arabic.group}. ${arabic.summary}` });

  if (ctx.summerBorn) narrative.push("Born in the summer term, so among the youngest in the year group: bear this in mind for borderline results.");
  const used = [ctx.extraTimePct ? `${ctx.extraTimePct}% extra time` : "", ctx.readAloud ? "questions read aloud" : "", ctx.largeText ? "larger text" : "", integrity.counts.breaks ? `${integrity.counts.breaks} break${integrity.counts.breaks === 1 ? "" : "s"}` : ""].filter(Boolean);
  if (used.length) narrative.push(`Access arrangements used: ${used.join(", ")}.`);

  // Headline: one line per area against the year expectation.
  const line = (key: string, label: string, at: number | null, note: string) => ({ key, label, workingAt: at, band: at === null ? null : bandOf(at - Y), note });
  const headline: Report["headline"] = [];
  if (by.maths) headline.push(line("maths", "Maths", by.maths.workingAt, `${by.maths.correct}/${by.maths.total} correct`));
  if (english !== null || by.reading) headline.push(line("english", Y <= 2 ? "English (phonics and reading)" : "English (reading, spelling, grammar)", english, [by.reading ? `reading ${by.reading.correct}/${by.reading.total}` : "", by.spag ? `spelling and grammar ${by.spag.correct}/${by.spag.total}` : ""].filter(Boolean).join(", ")));
  if (reasoning !== null) headline.push(line("reasoning", "Reasoning", reasoning, Y <= 2 ? "shapes and numbers" : "shapes, numbers and words"));
  if (writing) headline.push({ key: "writing", label: "Writing", workingAt: writing.workingAt, band: writing.band, note: writing.provisional ? (writing.source === "ai" ? "AI first mark, to be checked" : "estimate, needs staff marking") : "checked by a teacher" });

  // One-line placement.
  // Writing counts towards placement only once a teacher has checked it.
  const areaBands = headline.filter((h) => h.band && h.key !== "reasoning" && !(h.key === "writing" && writing?.provisional)) as { label: string; band: BandName; key: string }[];
  const short = (k: string) => (k === "english" ? "English" : k === "writing" ? "writing" : "maths");
  const wellBelow = areaBands.filter((h) => h.band === "Well below").map((h) => short(h.key));
  const below = areaBands.filter((h) => h.band === "Below").map((h) => short(h.key));
  const ahead = areaBands.filter((h) => h.band === "Above" || h.band === "Well above").map((h) => short(h.key));
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  let placement = `Place in Year ${Y}`;
  if (!areaBands.length) placement += "; results are not ready yet.";
  else if (wellBelow.length) placement += ` with a catch-up plan in ${list(wellBelow)}${below.length ? ` and targeted gap teaching in ${list(below)}` : ""}; review after half a term.`;
  else if (below.length) placement += ` in the core groups, with targeted gap teaching in ${list(below)}.`;
  else placement += ` in the core groups${ahead.length ? `, with extension work in ${list(ahead)}` : ""}.`;
  if (integrity.rating === "Review needed") placement += " Check the notes on how it was sat before relying on this.";

  const estimates = strands.filter((x) => x.workingAt !== null && x.band).map((x) => ({ area: x.key, label: x.label, workingAt: x.workingAt as number, band: x.band as BandName }));
  if (writing && !writing.provisional) estimates.push({ area: "writing", label: "Writing", workingAt: writing.workingAt, band: writing.band });
  return {
    version: 2, year: Y, headline, placement, strands, writing, quran, arabic, pending, estimates, summary: narrative,
    overall: { attainment, english, reasoning },
    narrative, recommendations: recs,
    integrity,
    access: { extraTimePct: ctx.extraTimePct || undefined, readAloud: ctx.readAloud || undefined, largeText: ctx.largeText || undefined, breaks: ctx.breaks, other: ctx.otherArrangements || undefined },
    pendingTeacherSections: pending,
    caveat: "Results are measured against national curriculum expectations for each year group (curriculum-referenced), from a paper generated for this pupil. They are not a nationally standardised score, and this report is not a diagnosis. Use it with the family conversation and teachers' judgement, never alone.",
  };
}
