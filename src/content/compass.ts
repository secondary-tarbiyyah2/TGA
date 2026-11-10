// The Tarbiyyah Compass: Tarbiyyah Global Academy's own six values (owner,
// 10 November 2026). They replace the values shared with the other Tarbiyyah
// schools, so the Academy's framework is its own, and they are grouped in
// three strands of two rather than spelling out a word. Policy 23 sets out
// what each looks like; one value is the focus each half term.
//
// Keep this list, policy 23, migration 0195 and RECIPE_VALUES in
// supabase/functions/ai-assist/prompts.ts in step.

export type CompassValue = {
  /** The Arabic word, as pupils learn it. */
  word: string;
  /** Its meaning in English. */
  english: string;
  body: string;
  /** The half term this value is the focus. */
  halfTerm: string;
};

export type CompassStrand = { strand: "Faith" | "Knowledge" | "Character"; summary: string; values: [CompassValue, CompassValue] };

export const COMPASS: CompassStrand[] = [
  {
    strand: "Faith",
    summary: "Who we do it for",
    values: [
      { word: "Ikhlas", english: "Sincerity", body: "Doing what is right for the sake of Allah, whether or not anyone is watching.", halfTerm: "Spring 1" },
      { word: "Shukr", english: "Gratitude", body: "Noticing our blessings and thanking Allah and the people around us.", halfTerm: "Summer 2" },
    ],
  },
  {
    strand: "Knowledge",
    summary: "How we learn",
    values: [
      { word: "Ilm", english: "Love of learning", body: "Curiosity, good questions and the effort to really understand.", halfTerm: "Autumn 2" },
      { word: "Itqan", english: "Care and mastery", body: "Doing each piece of work carefully and completely, and keeping going when it is hard.", halfTerm: "Spring 2" },
    ],
  },
  {
    strand: "Character",
    summary: "How we treat others",
    values: [
      { word: "Adab", english: "Good manners", body: "Respect and kindness in how we speak, listen and behave, online and at home.", halfTerm: "Autumn 1" },
      { word: "Amanah", english: "Trustworthiness", body: "Being honest and reliable, and looking after what we are trusted with.", halfTerm: "Summer 1" },
    ],
  },
];

/** The six values in half-term order (Autumn 1 to Summer 2). */
export const COMPASS_BY_HALF_TERM: CompassValue[] = (() => {
  const order = ["Autumn 1", "Autumn 2", "Spring 1", "Spring 2", "Summer 1", "Summer 2"];
  return COMPASS.flatMap((s) => s.values).sort((a, b) => order.indexOf(a.halfTerm) - order.indexOf(b.halfTerm));
})();

/** "Ikhlas (Sincerity)" etc., for pickers and the report helper. */
export const COMPASS_LABELS: string[] = COMPASS_BY_HALF_TERM.map((v) => `${v.word} (${v.english})`);
