// Turns answers into a report.
//
// What the numbers mean (and don't): every item has a curriculum level, so an
// estimate says "this child answers like a typical Year N pupil" for each
// strand. That is curriculum-referenced. It is NOT a nationally standardised
// score like GL's SAS, which needs a national sample to norm against. Once a
// year group has enough sittings, the Edge Function adds where the child sits
// among other TGA pupils of the same year (cohort percentile).
import { type Item, markItem, type Strand } from "./core.ts";
import type { Form, SectionKey } from "./form.ts";

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
  writing?: { scores: Rubric; notes?: string; markedBy?: string; markedAt?: string };
  quran?: { stage: number; tajweed: number; fluency: number; juz: number; lastSurah?: string; notes?: string; markedBy?: string; markedAt?: string };
  arabic?: { letters: number; vowelled: number; unvowelled: number; understanding: number; speaking: number; notes?: string; markedBy?: string; markedAt?: string };
};

export type Integrity = { tabHides: number; fastAnswers: number; answered: number; unanswered: number; timedOutSections: string[] };
export type Context = { year: number; ageMonths?: number | null; summerBorn?: boolean; eal?: boolean; send?: string | null; extraTimePct?: number; readAloud?: boolean };

export type Report = {
  version: 1;
  year: number;
  strands: StrandResult[];
  writing: { band: BandName; mean: number; workingAt: number } | null;
  quran: { group: string; summary: string } | null;
  arabic: { group: string; summary: string } | null;
  overall: { attainment: number | null; reasoning: number | null };
  narrative: string[];
  recommendations: { area: string; text: string }[];
  integrity: Integrity & { notes: string[] };
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

export const WRITING_RUBRIC: { key: string; label: string; hint: string }[] = [
  { key: "composition", label: "Content and effect", hint: "Ideas fit the task, purpose and reader" },
  { key: "organisation", label: "Organisation", hint: "Opening, paragraphs or sequence, ending" },
  { key: "vocabulary", label: "Vocabulary", hint: "Precise, varied word choice" },
  { key: "sentences", label: "Sentences and punctuation", hint: "Range of sentence types, accurate punctuation" },
  { key: "accuracy", label: "Spelling and presentation", hint: "Spelling for the year group, handwriting or layout" },
];
/** Each criterion is marked 0–4 RELATIVE TO THE YEAR GROUP: 0 well below, 1 below, 2 expected, 3 above, 4 well above. */

export function buildReport(form: Form, responses: Responses, marks: TeacherMarks, ctx: Context, events: { tabHides: number; timedOutSections: string[] }): Report {
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

  // Overall attainment (maths + reading + SPaG) and reasoning (all three families), each one estimate across their items.
  const pool = (keys: Strand[]) => auto.filter((i) => keys.includes(i.strand));
  const est = (its: Item[]) => estimate(its, its.map((i) => right.get(i.id) === true), Y)?.theta ?? null;
  const attainment = est(pool(["maths", "reading", "phonics", "spelling", "grammar"]));
  const reasoning = est(pool(["verbal", "quantitative", "nonverbal"]));

  // Teacher-marked sections.
  let writing: Report["writing"] = null;
  if (marks.writing?.scores && Object.keys(marks.writing.scores).length) {
    const vals = Object.values(marks.writing.scores);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    writing = { mean: Math.round(mean * 10) / 10, band: bandOf(mean - 2), workingAt: Math.round((Y + (mean - 2)) * 10) / 10 };
  }
  const quran = marks.quran ? quranGroup(marks.quran) : null;
  const arabic = marks.arabic ? arabicGroup(marks.arabic) : null;
  const pending = form.sections.filter((s) => (s.key === "writing" && !writing) || (s.key === "quran" && !quran) || (s.key === "arabic" && !arabic)).map((s) => s.key);

  // Integrity.
  const timed = auto.map((i) => responses[i.id]).filter(Boolean);
  const fast = timed.filter((r) => typeof r.ms === "number" && r.ms < 2500).length;
  const unanswered = auto.filter((i) => responses[i.id] === undefined || responses[i.id].value === "" || responses[i.id].value === null).length;
  const integrityNotes: string[] = [];
  if (events.tabHides >= 3) integrityNotes.push(`The test window was left ${events.tabHides} times. Discuss with the family before relying on the results.`);
  if (timed.length && fast / timed.length > 0.3) integrityNotes.push(`${fast} answers were given in under 2.5 seconds, which can mean guessing. Treat the lowest strands with caution.`);
  if (unanswered / Math.max(1, auto.length) > 0.2) integrityNotes.push(`${unanswered} questions were left unanswered${events.timedOutSections.length ? ` (time ran out in ${events.timedOutSections.join(", ")})` : ""}.`);
  if (!integrityNotes.length) integrityNotes.push("No concerns: the test was completed in one window at a normal pace.");

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
    recs.push({ area: "Maths", text: `Place in ${set}.${by.maths.gaps.length ? ` Gaps to teach first: ${by.maths.gaps.slice(0, 5).join("; ")}.` : ""}` });
  }
  const dr = d(by.reading);
  if (dr !== null && dr <= -0.5) recs.push({ area: "Reading", text: dr <= -1.5 ? `Daily guided reading and a phonics check${Y <= 4 ? "" : " (secondary phonics catch-up if gaps are found)"}; review after half a term.` : "Guided reading twice a week and reading at home every day; review after half a term." });
  else if (dr !== null && dr >= 1.75) recs.push({ area: "Reading", text: "Strong reader: stretch with challenging texts and the reading list for the year above." });
  const ds = d(by.spag);
  if (ds !== null && ds <= -1) recs.push({ area: "Spelling and grammar", text: `Weekly spelling and grammar practice from the Year ${Math.max(1, Math.round(by.spag.workingAt ?? Y))} list.${by.spag.gaps.length ? ` Start with: ${by.spag.gaps.slice(0, 3).join("; ")}.` : ""}` });

  const rs = ["verbal", "quantitative", "nonverbal"].map((k) => by[k]).filter((s): s is StrandResult => !!s && s.workingAt !== null);
  if (rs.length >= 2) {
    const hi = rs.reduce((a, b) => ((a.workingAt ?? 0) > (b.workingAt ?? 0) ? a : b));
    const lo = rs.reduce((a, b) => ((a.workingAt ?? 0) < (b.workingAt ?? 0) ? a : b));
    if ((hi.workingAt ?? 0) - (lo.workingAt ?? 0) >= 2) {
      let t = `Uneven reasoning profile: stronger in ${hi.label.toLowerCase()} than ${lo.label.toLowerCase()}.`;
      if (lo.key === "verbal" && ctx.eal) t += " With English as an additional language, low verbal reasoning is more likely to reflect vocabulary than ability; build academic vocabulary and re-check next term.";
      else if (lo.key === "verbal") t += " The pupil may understand more than they can yet put into words: use diagrams, models and worked examples, and teach vocabulary explicitly.";
      else if (hi.key === "verbal") t += " Explain in words and give spoken reasoning tasks; support visual-spatial work (shapes, graphs, geometry) with hands-on models.";
      recs.push({ area: "How the pupil learns", text: t });
    }
  }
  if (reasoning !== null && attainment !== null) {
    if (reasoning - attainment >= 1.5) recs.push({ area: "Potential", text: "Reasoning is well ahead of attainment, which usually means gaps in previous teaching rather than ability. Expect quick progress with a catch-up plan; set targets above the current level." });
    if (reasoning - Y <= -1.5 && attainment - Y <= -1.5) recs.push({ area: "Support", text: "Both reasoning and attainment are well below expectation. Share the report with the SENCo and the family before placement, and agree whether further assessment would help. This report is not a diagnosis." });
  }
  if (writing) recs.push({ area: "Writing", text: `Writing judged ${writing.band.toLowerCase()} expectation for Year ${Y}.${marks.writing?.notes ? ` Teacher's note: ${marks.writing.notes}` : ""}` });
  if (quran) recs.push({ area: "Qur'an", text: `${quran.group}. ${quran.summary}` });
  if (arabic) recs.push({ area: "Arabic", text: `${arabic.group}. ${arabic.summary}` });

  if (ctx.summerBorn) narrative.push("Born in the summer term, so among the youngest in the year group: bear this in mind for borderline results.");
  if (ctx.extraTimePct || ctx.readAloud) narrative.push(`Access arrangements used: ${[ctx.extraTimePct ? `${ctx.extraTimePct}% extra time` : "", ctx.readAloud ? "questions read aloud" : ""].filter(Boolean).join(", ")}.`);

  const estimates = strands.filter((x) => x.workingAt !== null && x.band).map((x) => ({ area: x.key, label: x.label, workingAt: x.workingAt as number, band: x.band as BandName }));
  if (writing) estimates.push({ area: "writing", label: "Writing", workingAt: writing.workingAt, band: writing.band });
  return {
    version: 1, year: Y, strands, writing, quran, arabic, pending, estimates, summary: narrative,
    overall: { attainment, reasoning },
    narrative, recommendations: recs,
    integrity: { tabHides: events.tabHides, fastAnswers: fast, answered: auto.length - unanswered, unanswered, timedOutSections: events.timedOutSections, notes: integrityNotes },
    pendingTeacherSections: pending,
    caveat: "Results are measured against national curriculum expectations for each year group (curriculum-referenced), from a paper generated for this pupil. They are not a nationally standardised score. Use them with the family conversation and teachers' judgement, never alone.",
  };
}
