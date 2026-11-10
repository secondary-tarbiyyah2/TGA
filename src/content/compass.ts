// The Tarbiyyah Compass: Tarbiyyah Global Academy's own values, which spell
// IHSAN (owner, 10 November 2026: "I need an acronym for the values", and
// they must differ from the RECIPE values of Tarbiyyah Primary, Secondary
// (Boys) and Al-Banaat). Ihsan, worshipping Allah as though you see Him, is
// the aim the five letters build towards: in an online school much of a
// pupil's conduct happens with no adult in the room.
//
// Each letter is the focus of one half term; the last half term is Ihsan
// itself, all five together. Policy 23 sets out what each looks like.
//
// Keep this list, policy 23, migration 0197 and RECIPE_VALUES in
// supabase/functions/ai-assist/prompts.ts in step.

export type CompassValue = {
  /** The letter of IHSAN this value gives. */
  letter: string;
  /** The value's name, starting with that letter. */
  word: string;
  /** A short gloss: the English meaning, or the Arabic word behind it. */
  gloss: string;
  body: string;
  /** The half term this value is the focus. */
  halfTerm: string;
};

export const COMPASS_WORD = "IHSAN";

export const COMPASS: CompassValue[] = [
  { letter: "I", word: "Ilm", gloss: "love of learning", body: "Curiosity, good questions and the effort to really understand.", halfTerm: "Autumn 2" },
  { letter: "H", word: "Honesty", gloss: "sidq and amanah", body: "Telling the truth, doing your own work and keeping the trust others place in you.", halfTerm: "Summer 1" },
  { letter: "S", word: "Sabr and shukr", gloss: "patience and gratitude", body: "Keeping going when things are hard, and thanking Allah and others when they are easy.", halfTerm: "Spring 2" },
  { letter: "A", word: "Adab", gloss: "good manners", body: "Respect and kindness in how we speak, listen and behave, online and at home.", halfTerm: "Autumn 1" },
  { letter: "N", word: "Niyyah", gloss: "sincere intention", body: "Doing what is right for the sake of Allah, whether or not anyone is watching.", halfTerm: "Spring 1" },
];

/** The half term when all five come together as Ihsan. */
export const IHSAN_HALF_TERM = "Summer 2";

/** The five values in half-term order (Autumn 1 to Summer 1). */
export const COMPASS_BY_HALF_TERM: CompassValue[] = (() => {
  const order = ["Autumn 1", "Autumn 2", "Spring 1", "Spring 2", "Summer 1", "Summer 2"];
  return [...COMPASS].sort((a, b) => order.indexOf(a.halfTerm) - order.indexOf(b.halfTerm));
})();
