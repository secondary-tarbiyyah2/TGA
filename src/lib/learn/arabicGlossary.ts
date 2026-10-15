/**
 * Arabic script for the Islamic Studies terms pupils meet in transliteration,
 * so the Arabic always appears next to them and pupils learn to read it.
 * Add a term here once and it is shown in Arabic everywhere it appears in
 * revision slides, key words, quiz questions and feedback.
 *
 * Spelling and harakat should be checked by an Islamic Studies teacher.
 * Longer phrases come first so they match before the single words inside them.
 */
export const ARABIC_GLOSSARY: [term: string, arabic: string][] = [
  ["lā ilāha illā Allāh", "لَا إِلَٰهَ إِلَّا ٱللَّٰه"],
  ["al-Asma' was-Sifat", "الأَسْمَاءُ وَالصِّفَات"],
  ["tawhid al-ʿibadah", "تَوْحِيدُ العِبَادَة"],
  ["ʿalayhi as-salām", "عَلَيْهِ ٱلسَّلَام"],
  ["ar-Rububiyyah", "الرُّبُوبِيَّة"],
  ["al-Uluhiyyah", "الأُلُوهِيَّة"],
  ["aqeedah", "العَقِيدَة"],
  ["al-ʿaqd", "العَقْد"],
  ["al-ʿaql", "العَقْل"],
  ["al-ʿahd", "العَهْد"],
  ["al-ʿilm", "العِلْم"],
  ["ʿaql", "العَقْل"],
  ["tawhid", "التَّوْحِيد"],
  ["ikhlas", "الإِخْلَاص"],
  ["fitrah", "الفِطْرَة"],
  ["hiss", "الحِسّ"],
  ["sharʿ", "الشَّرْع"],
  ["shirk", "الشِّرْك"],
  ["mushrik", "مُشْرِك"],
  ["duʿa'", "الدُّعَاء"],
  ["tawakkul", "التَّوَكُّل"],
  ["niyyah", "النِّيَّة"],
  ["shahadah", "الشَّهَادَة"],
  ["Bismillah", "بِسْمِ ٱللَّٰه"],
  ["Alhamdulillah", "ٱلْحَمْدُ لِلَّٰه"],
  ["SubhanAllah", "سُبْحَانَ ٱللَّٰه"],
  ["salah", "الصَّلَاة"],
  ["zakah", "الزَّكَاة"],
  ["sawm", "الصَّوْم"],
  ["hajj", "الحَجّ"],
  ["Sunnah", "السُّنَّة"],
];

export type GlossPart = string | { term: string; arabic: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole words only: a letter (or ʿ / ') just before or after means it's part of a longer word.
const MATCHER = new RegExp(
  `(?<![\\p{L}ʿ'])(${ARABIC_GLOSSARY.map(([t]) => escape(t)).join("|")})(?![\\p{L}ʿ])`,
  "giu",
);
const LOOKUP = new Map(ARABIC_GLOSSARY.map(([t, a]) => [t.toLowerCase(), a]));

/** Splits text into plain runs and glossary terms (with their Arabic). */
export function splitWithArabic(text: string): GlossPart[] {
  const out: GlossPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MATCHER)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ term: m[0], arabic: LOOKUP.get(m[0].toLowerCase()) || "" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
