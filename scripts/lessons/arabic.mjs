/**
 * Arabic text in the lesson decks, pupil PDFs and lesson plans.
 *
 * Every stretch of Arabic becomes its own run, marked as Arabic (lang ar-SA) in an Arabic font:
 * - Qur'an text (every Arabic run in a Qur'an lesson, and any ayah elsewhere) in Scheherazade New;
 * - other Arabic in Noto Naskh Arabic.
 * Both are SIL Open Font License fonts: CI installs them (scripts/lessons/install-quran-font.sh and
 * the Ubuntu package fonts-noto-core). Without this, LibreOffice drew Arabic in a fallback sans font,
 * and the size estimate counted every vowel mark as a letter, so voweled ayat came out tiny.
 */
export const QURAN_FONT = "Scheherazade New";
export const ARABIC_FONT = "Noto Naskh Arabic";
export const AR_LANG = "ar-SA";

const A = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
export const HAS_AR = new RegExp(`[${A}]`);
const LATIN = /[A-Za-z]/;
// Vowel marks, tanween, shadda, sukun, superscript alef and the small Qur'anic signs: they sit on a letter
// and take no width of their own.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]/g;
// Signs only used in the Uthmani script of a mushaf (alef wasla, small high and low signs): an ayah.
export const QURANIC = /[ٱۖ-ࣰۭ-ࣳ]/;
// A stretch of Arabic: from an Arabic letter to the last Arabic letter (or closing bracket of an
// ayah number) before non-Arabic text, keeping the spaces and punctuation in between.
const SEG = new RegExp(`[${A}](?:[${A}\\s().,:;!]*(?:[\\u0660-\\u0669]\\)|[${A}]))?`, "g");

/** Length of a word as it takes up space on the line (marks do not count). */
export const visibleLen = (s) => String(s).replace(MARKS, "").length;

/** True when the text has Arabic and no Latin letters (a whole Arabic paragraph or label). */
export const isArabicOnly = (s) => HAS_AR.test(String(s)) && !LATIN.test(String(s));

/** Font for an Arabic stretch: Scheherazade New for Qur'an text, Noto Naskh Arabic for the rest. */
export const arabicFont = (s, quran = false) => (quran || QURANIC.test(String(s)) ? QURAN_FONT : ARABIC_FONT);

/** Splits text into [{ text, ar }] pieces; the Arabic pieces are the stretches above. */
export function arabicSegments(text) {
  const s = String(text);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(SEG)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), ar: false });
    out.push({ text: m[0], ar: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), ar: false });
  return out;
}

/** Splits a passage of several ayat after each ayah number, e.g. "(٩)" or "﴿٩﴾", one ayah per line. */
export function splitAyat(text) {
  const parts = String(text)
    .split(/(?<=[)﴿﴾]\s*)\s+(?=[^\s(﴿﴾])/)
    .map((x) => x.trim())
    .filter(Boolean);
  // Only split where each piece ends in an ayah number: otherwise keep the text whole.
  return parts.length > 1 && parts.slice(0, -1).every((p) => /[(﴿﴾][٠-٩0-9]+[)﴿﴾]$/.test(p)) ? parts : [String(text)];
}
