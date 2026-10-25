// What is age-appropriate for each year group, used both to build papers
// (form.ts) and to vet the whole bank (scripts/assess-selftest.ts).
//
//  - paperRange(year): the item levels a paper for that year may contain.
//    A little below the year (to find gaps) and a little above (to find
//    the able child), never far above: a Year 1 child is not shown Year 3
//    fractions.
//  - MATHS_TOPICS / ENGLISH_TOPICS: a simple year-by-year map of what the
//    national curriculum expects, so an item labelled "Y4 …" really is a
//    Year 4 skill.
//  - SPELLING_LISTS: the statutory word lists (Y1, Y2, Y3–4, Y5–6). A word
//    from a later list must not be placed at an earlier level.
//  - READING: length and readability limits for each year's passage.
//  - BANNED: references the school does not want anywhere in the bank.
//
// Pure TypeScript, no imports, so it runs in Deno and Node.

export type Range = { lo: number; hi: number };

export function paperRange(year: number): Range {
  const Y = Math.min(11, Math.max(1, Math.round(year)));
  if (Y === 1) return { lo: 1, hi: 2.6 };
  if (Y === 2) return { lo: 1, hi: 3.4 };
  return { lo: Math.max(1, Y - 2), hi: Math.min(11.9, Y + 1.5) };
}

export const inPaperRange = (level: number, year: number): boolean => {
  const r = paperRange(year);
  return level >= r.lo - 0.01 && level <= r.hi + 0.01;
};

// ── maths: year → topics (national curriculum programmes of study, KS1–KS4) ──
export const MATHS_TOPICS: Record<number, RegExp[]> = {
  1: [/count/i, /one more|one less/i, /add within 20/i, /subtract within 20/i, /missing number/i, /halves/i],
  2: [/add 2-digit/i, /tens and ones/i, /2, 5 and 10 times/i, /tell the time/i, /money/i],
  3: [/add 3-digit/i, /subtract 3-digit/i, /3, 4 and 8 times/i, /fraction of an amount/i, /perimeter/i],
  4: [/times tables to 12/i, /multiply 2-digit by 1-digit/i, /round/i, /equivalent fractions/i, /area/i, /decimals: tenths/i],
  5: [/long multiplication/i, /percentages of amounts/i, /add fractions/i, /decimals by 10/i, /prime/i, /units of length/i],
  6: [/order of operations/i, /ratio/i, /angles in a triangle/i, /divide fractions/i, /formula|algebra/i, /mean/i],
  7: [/negative numbers/i, /equations/i, /simplify expressions/i, /fractions, decimals and percentages/i, /area of a triangle/i],
  8: [/percentage change/i, /expand brackets/i, /nth term/i, /circumference/i, /probability/i],
  9: [/index laws/i, /right-angled triangles/i, /standard form/i, /inequalities/i, /proportion|best buy/i],
  10: [/factorise quadratics/i, /simultaneous/i, /compound interest/i, /trigonometry/i, /rearrange/i],
  11: [/quadratic equations/i, /surds/i, /functions/i, /conditional probability/i],
};

// ── English grammar, punctuation and vocabulary: year → topics (KS1–KS3, GCSE) ──
export const ENGLISH_TOPICS: Record<number, RegExp[]> = {
  1: [/capital letter/i, /full stop/i, /question mark/i, /exclamation/i, /joining words/i, /plural/i, /suffix -ed/i],
  2: [/past tense/i, /progressive/i, /command/i, /commas in a list/i, /adjectives/i, /contraction/i, /singular possession/i, /because/i, /nouns/i],
  3: [/a or an/i, /present perfect/i, /inverted commas/i, /conjunctions/i, /prepositions/i, /adverbs/i, /prefixes/i, /word families/i],
  4: [/plural possession/i, /fronted adverbial/i, /standard english/i, /noun phrases/i, /pronouns/i, /direct speech/i, /determiners/i, /irregular plurals/i],
  5: [/relative/i, /modal/i, /brackets/i, /possibility/i, /dashes/i, /adjectives into verbs/i, /clarify meaning/i, /cohesion/i],
  6: [/passive/i, /semi-colon/i, /colon/i, /subjunctive/i, /formal/i, /hyphens/i, /question tags/i, /active voice/i, /subordinate/i],
  7: [/complex sentences/i, /compound sentences/i, /abstract nouns/i, /subject of a sentence/i, /indefinite pronouns/i, /comma splices/i, /agreement/i, /homophones/i, /future perfect/i],
  8: [/colon/i, /semi-colons/i, /modifiers/i, /word class/i, /agentless passive/i, /formal register/i, /fewer and less/i, /indefinite pronouns/i, /past perfect/i],
  9: [/subjunctive/i, /parallel/i, /dash/i, /rhetorical/i, /who and whom/i, /gerunds/i, /concise/i, /its and it's/i, /conditional/i],
};

/** The year the objective label claims ("Y4 …"), or null. */
export const objectiveYear = (objective: string): number | null => {
  const m = objective.match(/^Y(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
};

/** Does a labelled objective fit that year's curriculum map? */
export function topicFits(subject: "maths" | "english", objective: string): { year: number | null; ok: boolean } {
  const y = objectiveYear(objective);
  if (y === null) return { year: null, ok: false };
  const map = subject === "maths" ? MATHS_TOPICS : ENGLISH_TOPICS;
  const topics = map[y];
  if (!topics) return { year: y, ok: false };
  return { year: y, ok: topics.some((re) => re.test(objective)) };
}

// ── statutory spelling lists ──
// Year 1 and Year 2 common exception words; Years 3–4 and Years 5–6 word lists.
export const SPELLING_LISTS: { from: number; to: number; words: string[] }[] = [
  { from: 1, to: 1, words: "the a do to today of said says are were was is his has I you your they be he me she we no go so by my here there where love come some one once ask friend school put push pull full house our".split(" ") },
  { from: 2, to: 2, words: "door floor poor because find kind mind behind child children wild climb most only both old cold gold hold told every everybody even great break steak pretty beautiful after fast last past father class grass pass plant path bath hour move prove improve sure sugar eye could should would who whole any many clothes busy people water again half money parents".split(" ") },
  { from: 3, to: 4, words: "accident actual address answer appear arrive believe bicycle breath breathe build busy business calendar caught centre century certain circle complete consider continue decide describe different difficult disappear early earth eight eighth enough exercise experience experiment extreme famous favourite February forward fruit grammar group guard guide heard heart height history imagine increase important interest island knowledge learn length library material medicine mention minute natural naughty notice occasion often opposite ordinary particular peculiar perhaps popular position possess possession possible potatoes pressure probably promise purpose quarter question recent regular reign remember sentence separate special straight strange strength suppose surprise therefore though although thought through various weight woman women".split(" ") },
  { from: 5, to: 6, words: "accommodate accompany according achieve aggressive amateur ancient apparent appreciate attached available average awkward bargain bruise category cemetery committee communicate community competition conscience conscious controversy convenience correspond criticise curiosity definite desperate determined develop dictionary disastrous embarrass environment equip equipped equipment especially exaggerate excellent existence explanation familiar foreign forty frequently government guarantee harass hindrance identity immediate immediately individual interfere interrupt language leisure lightning marvellous mischievous muscle necessary neighbour nuisance occupy occur opportunity parliament persuade physical prejudice privilege profession programme pronunciation queue recognise recommend relevant restaurant rhyme rhythm sacrifice secretary shoulder signature sincere sincerely soldier stomach sufficient suggest symbol system temperature thorough twelfth variety vegetable vehicle yacht".split(" ") },
];

/** The earliest statutory list a word is on, or null if it is on none. */
export function spellingListYear(word: string): number | null {
  const w = word.toLowerCase();
  for (const l of SPELLING_LISTS) if (l.words.some((x) => x.toLowerCase() === w)) return l.from;
  return null;
}

// ── reading passages ──
export type Readability = { words: number; sentences: number; wordsPerSentence: number; syllablesPerWord: number; longWords: number; grade: number };

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch–Kincaid grade (US grade ≈ UK year − 1) plus the raw counts. */
export function readability(text: string): Readability {
  const words = text.replace(/[“”"‘’]/g, "'").split(/\s+/).map((w) => w.replace(/[^A-Za-z'-]/g, "")).filter((w) => /[A-Za-z]/.test(w));
  const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$|[”’"'])/g) || []).length);
  const syl = words.reduce((p, w) => p + syllables(w), 0);
  const n = Math.max(1, words.length);
  const grade = 0.39 * (n / sentences) + 11.8 * (syl / n) - 15.59;
  return {
    words: words.length, sentences, wordsPerSentence: Math.round((n / sentences) * 10) / 10,
    syllablesPerWord: Math.round((syl / n) * 100) / 100,
    longWords: words.filter((w) => syllables(w) >= 3).length,
    grade: Math.round(grade * 10) / 10,
  };
}

/**
 * Limits for the passage a pupil in each year reads. Year 1 children need a
 * very short text in short sentences (it is read to them as well); older
 * pupils can handle longer texts and longer words. `maxGrade` is a ceiling
 * on Flesch–Kincaid, which is rough, so it is a backstop to reading the
 * passage by hand, not a replacement for it.
 */
export const READING_LIMITS: Record<number, { minWords: number; maxWords: number; maxWordsPerSentence: number; maxGrade: number; maxLongWordShare: number }> = {
  1: { minWords: 30, maxWords: 70, maxWordsPerSentence: 7, maxGrade: 1.5, maxLongWordShare: 0.03 },
  2: { minWords: 60, maxWords: 130, maxWordsPerSentence: 9, maxGrade: 3, maxLongWordShare: 0.06 },
  3: { minWords: 150, maxWords: 330, maxWordsPerSentence: 15, maxGrade: 5.5, maxLongWordShare: 0.1 },
  4: { minWords: 150, maxWords: 360, maxWordsPerSentence: 16, maxGrade: 6.5, maxLongWordShare: 0.11 },
  5: { minWords: 250, maxWords: 460, maxWordsPerSentence: 19, maxGrade: 8, maxLongWordShare: 0.13 },
  6: { minWords: 250, maxWords: 480, maxWordsPerSentence: 20, maxGrade: 9, maxLongWordShare: 0.14 },
  7: { minWords: 300, maxWords: 560, maxWordsPerSentence: 22, maxGrade: 10, maxLongWordShare: 0.15 },
  8: { minWords: 300, maxWords: 600, maxWordsPerSentence: 23, maxGrade: 11, maxLongWordShare: 0.16 },
  9: { minWords: 300, maxWords: 640, maxWordsPerSentence: 24, maxGrade: 12, maxLongWordShare: 0.17 },
  10: { minWords: 350, maxWords: 720, maxWordsPerSentence: 26, maxGrade: 13, maxLongWordShare: 0.19 },
  11: { minWords: 350, maxWords: 760, maxWordsPerSentence: 27, maxGrade: 14, maxLongWordShare: 0.2 },
};

// ── content rules ──
// No reference anywhere to Sufis or Sufism, or to any philosopher or school
// of philosophy (Greek or otherwise). Names are matched as whole words.
export const BANNED: { label: string; re: RegExp }[] = [
  { label: "Sufi / Sufism", re: /\bsufi(s|sm)?\b|\btasawwuf\b|\bdervish(es)?\b|\bwhirling\b|\bdhikr circle\b|\btariqa\b|\bzawiya\b/i },
  { label: "philosophy / philosopher", re: /\bphilosoph\w*/i },
  { label: "Greek philosophers", re: /\b(plato|platonic|aristotle|aristotelian|socrates|socratic|pythagoras|pythagorean|euclid|archimedes|eureka|thales|heraclitus|parmenides|zeno|epicurus|epicurean|diogenes|stoic(s|ism)?|plotinus|neoplatoni\w*|ptolemy|galen|hippocrates)\b/i },
  { label: "Muslim philosophers and Sufi figures", re: /\b(ibn sina|avicenna|ibn rushd|averroes|al-?farabi|alfarabi|al-?kindi|rumi|al-?ghazali|ghazali|ibn arabi|ibn al-?arabi|al-?hallaj|ibn tufail|ibn bajja|avempace|suhrawardi|mulla sadra|al-?razi|rhazes|ibn khaldun|ibn al-?haytham|alhazen|ikhwan al-?safa|mutazil\w*)\b/i },
  { label: "other philosophers", re: /\b(confucius|lao tzu|laozi|kant|hegel|nietzsche|descartes|spinoza|rousseau|voltaire|locke|hobbes|hume|sartre|marx|machiavelli)\b/i },
  { label: "House of Wisdom translation movement", re: /\bhouse of wisdom\b|\bbayt al-?hikma\b|\btranslation movement\b/i },
];

export function bannedHits(text: string): string[] {
  return BANNED.filter((b) => b.re.test(text)).map((b) => b.label);
}
