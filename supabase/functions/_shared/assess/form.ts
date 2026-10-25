// Builds one pupil's paper. Every sitting gets its own seed, so the questions
// (and the numbers in them), their order and the order of the options all
// differ from child to child, while the paper can be rebuilt exactly from the
// seed for review or appeal. The answer key stays on the server.
import { type Item, mcq, type Rng, Rng as R, hashSeed } from "./core.ts";
import { mathsFor } from "./maths.ts";
import { nonVerbalItems, quantitativeItems } from "./reasoning.ts";
import { ANALOGIES, ANTONYMS, type Band, GRAMMAR, ODD_ONE_OUT, type Passage, PASSAGES, PHONICS, SPELLINGS, SYNONYMS, WRITING_PROMPTS } from "./content.ts";
import { paperRange } from "./curriculum.ts";

export type SectionKey = "maths" | "english" | "reasoning" | "writing" | "quran" | "arabic";
export type Section = {
  key: SectionKey;
  title: string;
  intro: string;
  minutes: number;
  /** Sat by the child on screen (false = assessed live by a teacher). */
  candidate: boolean;
  items: Item[];
  passages?: { id: string; title: string; text: string }[];
  writingPrompt?: { id?: string; title: string; prompt: string; guide: string; purpose?: string; audience?: string };
};
/** Breaks the child may take during a timed part: the clock pauses and the questions are hidden. */
export type BreakRules = { perSection: number; minutes: number };
export type Form = {
  version: 1;
  year: number;
  seed: number;
  sections: Section[];
  readAloud: boolean;
  /** Read each question out automatically when it appears (youngest pupils, or by arrangement). */
  autoRead?: boolean;
  breaks?: BreakRules;
};
export type FormOptions = { extraTimePct?: number; readAloud?: boolean; autoRead?: boolean; skip?: SectionKey[]; breaks?: Partial<BreakRules> };

export const bandFor = (year: number): Band => (year <= 2 ? 1 : year <= 4 ? 2 : year <= 6 ? 3 : year <= 9 ? 4 : 5);

/** Default breaks: younger children get more, shorter ones. Staff can change them per pupil. */
export function defaultBreaks(year: number): BreakRules {
  if (year <= 2) return { perSection: 3, minutes: 3 };
  if (year <= 6) return { perSection: 2, minutes: 3 };
  return { perSection: 1, minutes: 5 };
}
export function breakRulesFor(form: Pick<Form, "year" | "breaks">): BreakRules {
  return form.breaks || defaultBreaks(form.year);
}

/** The passages a pupil in this year may be given (a passage's `years`, else its band). */
export function passagesFor(year: number): Passage[] {
  return PASSAGES.filter((p) => (p.years ? year >= p.years[0] && year <= p.years[1] : p.band === bandFor(year)));
}

/** Spread n picks evenly across a level-sorted list (with a little randomness), reusing generators if needed. */
function spread<T extends { level: number }>(r: Rng, list: T[], n: number): T[] {
  const sorted = [...list].sort((a, b) => a.level - b.level);
  if (!sorted.length) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i + r.next() * 0.8) * (sorted.length / n);
    out.push(sorted[Math.min(sorted.length - 1, Math.floor(pos))]);
  }
  return out;
}

/**
 * Per-pupil order that still runs roughly easy to hard: shuffle within small
 * blocks, so children start with something they can do, but no two pupils
 * see the same question in the same place.
 */
function blockShuffle<T>(r: Rng, list: T[], size = 4): T[] {
  const out: T[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...r.shuffle(list.slice(i, i + size)));
  return out;
}

const inRange = (lvl: number, lo: number, hi: number) => lvl >= lo - 0.01 && lvl <= hi + 0.01;
const PUNCTUATION_OBJECTIVE = /punctuat|capital|comma|apostrophe|inverted|speech|hyphen|dash|colon|brackets|question mark|exclamation|full stop|its and it's/i;

export function buildForm(year: number, seed: number, opts: FormOptions = {}): Form {
  const r = new R(seed);
  const Y = Math.min(11, Math.max(1, Math.round(year)));
  const { lo, hi } = paperRange(Y);
  const young = Y <= 2;
  const readAloud = !!opts.readAloud || Y <= 3;
  const autoRead = opts.autoRead ?? (Y <= 2 || !!opts.readAloud);
  const extra = 1 + (opts.extraTimePct || 0) / 100;
  const mins = (m: number) => Math.round(m * extra);
  let n = 0;
  const id = (p: string) => `${p}${(++n).toString(36)}`;
  const sections: Section[] = [];
  const skip = new Set(opts.skip || []);
  const def = defaultBreaks(Y);
  const breaks: BreakRules = {
    perSection: Math.max(0, Math.min(6, Math.round(opts.breaks?.perSection ?? def.perSection))),
    minutes: Math.max(1, Math.min(15, Math.round(opts.breaks?.minutes ?? def.minutes))),
  };

  // ── Maths ──
  if (!skip.has("maths")) {
    const count = young ? 12 : Y <= 6 ? 20 : 24;
    const gens = spread(r, mathsFor(lo, hi), count);
    const items: Item[] = gens.map((g) => {
      const made = g.make(r);
      // The youngest pupils answer by tapping, never typing.
      if (young && made.type === "numeric") {
        const ans = Number(made.answer);
        const m = mcq(r, String(ans), [String(ans + 1), String(ans - 1), String(ans + 10)], [String(ans + 2), String(ans - 2)]);
        return { id: id("m"), strand: "maths", level: g.level, objective: g.objective, ...made, type: "mcq", choices: m.choices, answer: m.answer };
      }
      return { id: id("m"), strand: "maths", level: g.level, objective: g.objective, ...made };
    });
    sections.push({ key: "maths", title: young ? "Numbers" : "Maths", intro: young ? "Tap the right answer. Press the speaker to hear the question again." : "Work out each answer. You may use paper for working out, but not a calculator.", minutes: mins(young ? 12 : Y <= 6 ? 25 : 35), candidate: true, items: blockShuffle(r, items) });
  }

  // ── English: the reading text first, then its questions; then spelling and grammar ──
  if (!skip.has("english")) {
    const passage = r.pick(passagesFor(Y));
    const items: Item[] = [];
    if (young) {
      const ph: Item[] = [];
      for (const p of spread(r, PHONICS.filter((p) => inRange(p.level, 1, Math.min(hi, 2.6))), Y === 1 ? 5 : 6)) {
        const m = mcq(r, p.say, p.choices.filter((c) => c !== p.say));
        ph.push({ id: id("p"), strand: "phonics", level: p.level, objective: "Phonics: hear a word, find it", type: "mcq", stem: "Listen. Tap the word you hear.", say: p.say, speakChoices: false, choices: m.choices, answer: m.answer });
      }
      items.push(...r.shuffle(ph));
    }
    // Reading questions stay in text order (they follow the story), with shuffled options.
    // Questions pitched above this year's range are left out (easier ones stay: they find gaps).
    for (const q of passage.questions.filter((q) => q.level <= hi + 0.01)) {
      const correct = q.choices[q.answer];
      const m = mcq(r, correct, q.choices.filter((_, i) => i !== q.answer));
      items.push({ id: id("r"), strand: "reading", level: q.level, objective: `Reading: ${q.skill}`, type: "mcq", stem: q.q, choices: m.choices, answer: m.answer, passageId: passage.id });
    }
    if (!young) {
      const sg: Item[] = [];
      for (const s of spread(r, SPELLINGS.filter((s) => inRange(s.level, lo, hi)), Y <= 6 ? 6 : 5)) {
        const m = mcq(r, s.correct, s.wrong);
        sg.push({ id: id("s"), strand: "spelling", level: s.level, objective: `Spelling (Year ${Math.floor(s.level)} words)`, type: "mcq", stem: "Which word is spelt correctly?", speakChoices: false, choices: m.choices, answer: m.answer });
      }
      for (const g of spread(r, GRAMMAR.filter((g) => inRange(g.level, lo, hi)), Y <= 6 ? 6 : 7)) {
        const correct = g.choices[g.answer];
        const m = mcq(r, correct, g.choices.filter((_, i) => i !== g.answer));
        sg.push({ id: id("g"), strand: "grammar", level: g.level, objective: g.objective, type: "mcq", stem: g.stem, speakPunctuation: PUNCTUATION_OBJECTIVE.test(g.objective) || undefined, choices: m.choices, answer: m.answer });
      }
      items.push(...blockShuffle(r, sg.sort((a, b) => a.level - b.level)));
    }
    sections.push({
      key: "english",
      title: young ? "Listening and reading" : "English",
      intro: young ? "First listen and find some words. Then read a short story and answer questions about it." : "First read the text. Then answer the questions. You can look back at the text at any time.",
      minutes: mins(young ? 12 : Y <= 6 ? 30 : 35),
      candidate: true,
      items,
      passages: [{ id: passage.id, title: passage.title, text: passage.text }],
    });
  }

  // ── Reasoning ──
  if (!skip.has("reasoning")) {
    const items: Item[] = [];
    const add = (strand: "verbal" | "quantitative" | "nonverbal", made: Omit<Item, "id" | "strand">) => items.push({ id: id("x"), strand, ...made });
    const nNv = young ? 6 : 9, nQ = young ? 4 : Y <= 6 ? 7 : 9, nV = young ? 0 : Y <= 6 ? 8 : 10;
    for (const it of nonVerbalItems(r, lo, hi, nNv)) add("nonverbal", it);
    for (const it of quantitativeItems(r, lo, hi, nQ)) add("quantitative", it);
    if (nV) {
      const verbal = [
        ...SYNONYMS.filter((w) => inRange(w.level, lo, hi)).map((w) => ({ level: w.level, kind: "syn" as const, w })),
        ...ANTONYMS.filter((w) => inRange(w.level, lo, hi)).map((w) => ({ level: w.level, kind: "ant" as const, w })),
        ...ANALOGIES.filter((a) => inRange(a.level, lo, hi)).map((a) => ({ level: a.level, kind: "ana" as const, a })),
        ...ODD_ONE_OUT.filter((o) => inRange(o.level, lo, hi)).map((o) => ({ level: o.level, kind: "odd" as const, o })),
      ];
      for (const v of spread(r, r.shuffle(verbal), nV)) {
        if (v.kind === "syn" || v.kind === "ant") {
          const m = mcq(r, v.w.answer, v.w.distractors);
          add("verbal", { level: v.level, objective: v.kind === "syn" ? "Words with similar meanings" : "Words with opposite meanings", type: "mcq", stem: v.kind === "syn" ? `Which word means nearly the same as “${v.w.word}”?` : `Which word means the opposite of “${v.w.word}”?`, choices: m.choices, answer: m.answer });
        } else if (v.kind === "ana") {
          const m = mcq(r, v.a.answer, v.a.distractors);
          add("verbal", { level: v.level, objective: "Word analogies", type: "mcq", stem: `${v.a.a} is to ${v.a.b} as ${v.a.c} is to …?`, choices: m.choices, answer: m.answer });
        } else {
          const correct = v.o.options[v.o.answer];
          const m = mcq(r, correct, v.o.options.filter((_, i) => i !== v.o.answer), [], 5);
          add("verbal", { level: v.level, objective: "Odd one out (words)", type: "mcq", stem: "Which word does not belong with the others?", choices: m.choices, answer: m.answer });
        }
      }
    }
    sections.push({ key: "reasoning", title: young ? "Puzzles" : "Reasoning", intro: young ? "Look carefully at the shapes and numbers and find the answer." : "Puzzles with shapes, numbers and words. Some are tricky on purpose. If you are stuck, choose your best answer and move on.", minutes: mins(young ? 10 : Y <= 6 ? 25 : 30), candidate: true, items: r.shuffle(items) });
  }

  // ── Writing ──
  if (!skip.has("writing")) {
    const wp = r.pick(WRITING_PROMPTS.filter((w) => w.band === bandFor(Y)));
    sections.push({
      key: "writing",
      title: "Writing",
      intro: young ? "Done with your teacher on the call: they will read the task to you and you will write on paper." : `${wp.title}. Plan for a few minutes, then write your answer in the box. Your teacher will read it.`,
      minutes: mins(wp.minutes),
      candidate: !young,
      items: young ? [] : [{ id: id("w"), strand: "reading", level: Y, objective: "Extended writing", type: "text", stem: wp.prompt, answer: "" }],
      writingPrompt: { id: wp.id, title: wp.title, prompt: wp.prompt, guide: wp.guide, purpose: wp.purpose, audience: wp.audience },
    });
  }

  if (!skip.has("quran")) sections.push({ key: "quran", title: "Qur'an", intro: "Assessed live by a teacher on the family call: recitation, tajweed and memorisation.", minutes: 10, candidate: false, items: [] });
  if (!skip.has("arabic")) sections.push({ key: "arabic", title: "Arabic", intro: "Assessed live by a teacher on the family call: letters, reading and understanding.", minutes: 8, candidate: false, items: [] });

  return { version: 1, year: Y, seed, sections, readAloud, autoRead, breaks };
}

export const newSeed = (salt: string): number => hashSeed(`${salt}:${Date.now()}:${Math.random()}`);
