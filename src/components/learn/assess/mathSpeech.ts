// Turns what is on screen into what a voice should say, so maths is read the
// way a teacher would read it ("x to the power of 5", "three quarters",
// "minus 4", "2 to 3"), and punctuation questions can be heard properly.
// Pure TypeScript with no browser APIs, so scripts/assess-selftest.ts can test it.

const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "ⁿ": "n" };
const SUP_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+/;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const ORDINAL: Record<number, [string, string]> = {
  2: ["half", "halves"], 3: ["third", "thirds"], 4: ["quarter", "quarters"], 5: ["fifth", "fifths"], 6: ["sixth", "sixths"], 7: ["seventh", "sevenths"],
  8: ["eighth", "eighths"], 9: ["ninth", "ninths"], 10: ["tenth", "tenths"], 11: ["eleventh", "elevenths"], 12: ["twelfth", "twelfths"],
  13: ["thirteenth", "thirteenths"], 14: ["fourteenth", "fourteenths"], 15: ["fifteenth", "fifteenths"], 16: ["sixteenth", "sixteenths"],
  17: ["seventeenth", "seventeenths"], 18: ["eighteenth", "eighteenths"], 19: ["nineteenth", "nineteenths"], 20: ["twentieth", "twentieths"],
  25: ["twenty-fifth", "twenty-fifths"], 50: ["fiftieth", "fiftieths"], 100: ["hundredth", "hundredths"],
};
const VULGAR: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
const UNITS: Record<string, [string, string]> = {
  mm: ["millimetre", "millimetres"], cm: ["centimetre", "centimetres"], m: ["metre", "metres"], km: ["kilometre", "kilometres"],
  g: ["gram", "grams"], kg: ["kilogram", "kilograms"], ml: ["millilitre", "millilitres"], l: ["litre", "litres"],
};

const num = (s: string) => Number(s.replace(/,/g, ""));
const say = (n: number) => (Number.isInteger(n) && n >= 0 && n <= 20 ? WORDS[n] : String(n));

/** "3/4" → "three quarters", "1/2" → "one half", "7/20" → "seven twentieths", "5/37" → "5 over 37". */
export function fractionWords(n: number, d: number): string {
  const o = ORDINAL[d];
  if (!o || n > 20 || n < 0) return `${n} over ${d}`;
  return `${say(n)} ${n === 1 ? o[0] : o[1]}`;
}

function power(exp: string): string {
  if (exp === "2") return " squared";
  if (exp === "3") return " cubed";
  const e = exp.replace(/^-/, "minus ");
  return ` to the power of ${e}`;
}

/** Maths and everyday notation → words. Safe to run on ordinary sentences. */
export function mathsToSpeech(input: string): string {
  let s = ` ${input} `;
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…\s*\?/g, " and so on?").replace(/…/g, " ").replace(/\u00a0/g, " ");
  for (const [k, v] of Object.entries(VULGAR)) s = s.split(k).join(v);

  // Functions: f⁻¹(x), f(x).
  s = s.replace(/\b([fgh])(?:⁻¹|\^-1)\(([a-z])\)/g, "$1 inverse of $2");
  s = s.replace(/\b([fgh])\(([a-z0-9])\)/g, "$1 of $2");

  // Square and cubic units: 12 cm², cm³.
  s = s.replace(/(\d)\s?(mm|cm|m|km)²/g, (_, d, u) => `${d} square ${UNITS[u][1]}`);
  s = s.replace(/(\d)\s?(mm|cm|m)³/g, (_, d, u) => `${d} cubic ${UNITS[u][1]}`);
  s = s.replace(/(^|\s)(mm|cm|m|km)²/g, (_, p, u) => `${p}square ${UNITS[u][1]}`);
  s = s.replace(/(^|\s)(mm|cm|m)³/g, (_, p, u) => `${p}cubic ${UNITS[u][1]}`);

  // Powers: x⁵, 10⁻³, x^5, x^(n+1).
  s = s.replace(new RegExp(`([A-Za-z0-9)])(${SUP_RE.source})`, "g"), (_, b, e) => `${b}${power(e.split("").map((c: string) => SUP[c] ?? c).join(""))}`);
  s = s.replace(/([A-Za-z0-9)])\^\(([^)]+)\)/g, (_, b, e) => `${b} to the power of ${e}`);
  s = s.replace(/([A-Za-z0-9)])\^(-?\w+)/g, (_, b, e) => `${b}${power(e)}`);

  // Roots: √(A/π), 3√2, √50.
  s = s.replace(/√\(([^)]+)\)/g, " the square root of $1, ");
  s = s.replace(/(\d)√(\d+)/g, "$1 root $2");
  s = s.replace(/√(\w+)/g, " the square root of $1");

  // Money, percentages, degrees, units after a number.
  s = s.replace(/£(\d[\d,]*)\.(\d{2})\b/g, (_, p, q) => `${p} pound${num(p) === 1 ? "" : "s"} ${Number(q) ? q : ""}`.trim() + " ");
  s = s.replace(/£(\d[\d,]*)/g, (_, p) => `${p} pound${num(p) === 1 ? "" : "s"}`);
  s = s.replace(/£/g, " pounds ");
  s = s.replace(/(\d)p\b/g, "$1 pence");
  s = s.replace(/(\d)\s?%/g, "$1 percent");
  s = s.replace(/(\d)\s?°/g, "$1 degrees");
  s = s.replace(/°/g, " degrees");
  s = s.replace(/(\d[\d,.]*)\s?(mm|cm|km|kg|ml|m|g|l)\b(?![\w'])/g, (_, d, u) => `${d} ${num(d) === 1 ? UNITS[u][0] : UNITS[u][1]}`);

  // Times of day and ratios: 4:05 → "4 oh 5"; 2:3 → "2 to 3".
  const ratioContext = /ratio/i.test(input);
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => (ratioContext ? `${h} to ${Number(mm)}` : mm === "00" ? `${h} o'clock` : mm.startsWith("0") ? `${h} oh ${Number(mm)}` : `${h} ${mm}`));
  s = s.replace(/\b(\d+):(\d+)\b/g, "$1 to $2");

  // Fractions: 3/4, ?/12, (x − 3)/2.
  s = s.replace(/\?\/(\d+)/g, (_, d) => (ORDINAL[Number(d)] ? ` how many ${ORDINAL[Number(d)][1]} ` : ` what over ${d} `));
  s = s.replace(/(^|[^\w.\/])(\d+)\/(\d+)(?![\w.\/])/g, (_, p, n, d) => `${p}${fractionWords(Number(n), Number(d))}`);

  // Brackets in maths are read; brackets in sentences become a pause.
  for (let k = 0; k < 3; k++) {
    s = s.replace(/\(([^()]*)\)/g, (_, inner: string) => (/^[\w\s+\-−×÷/.=,]*$/.test(inner) && /[+\-−×÷/=]|^\s*[a-z]\s*$|\d\s*[a-z]\b/.test(inner) ? ` bracket ${inner} close bracket ` : `, ${inner}, `));
  }
  s = s.replace(/\//g, " over ");

  // Comparisons and operators.
  s = s.replace(/≤/g, " is less than or equal to ").replace(/≥/g, " is greater than or equal to ").replace(/≠/g, " is not equal to ");
  s = s.replace(/\s<\s/g, " is less than ").replace(/\s>\s/g, " is greater than ");
  s = s.replace(/=\s*\?/g, " equals what? ");
  s = s.replace(/=/g, " equals ");
  s = s.replace(/×/g, " times ").replace(/÷/g, " divided by ").replace(/±/g, " plus or minus ").replace(/\+/g, " plus ");
  // Minus: negative numbers and subtraction both read "minus"; hyphens inside words are left alone.
  s = s.replace(/(^|[\s(,])[−-](?=\s?[\d(a-zA-Z])(?![a-z]{2})/g, "$1minus ");
  s = s.replace(/\s[−–-]\s/g, " minus ");
  s = s.replace(/−/g, " minus ");

  // Letters next to numbers are separate symbols: 3x → "3 x"; nth → "n th".
  s = s.replace(/\b(\d+)([a-z])\b/g, "$1 $2");
  s = s.replace(/\bnth\b/g, "n th");
  s = s.replace(/π/g, " pi ").replace(/→/g, " goes to ").replace(/■/g, " box");
  s = s.replace(/(^|\s)\?(?=\s|$)/g, "$1 what ");
  return s.replace(/\s+([,.?!])/g, "$1").replace(/,\s*,/g, ",").replace(/([.?!]),/g, "$1").replace(/,\s*$/, ".").replace(/\s{2,}/g, " ").trim();
}

/** For punctuation questions: say each mark, and "capital" before a capital letter. */
export function punctuationToSpeech(input: string): string {
  const out: string[] = [];
  let quoteOpen = false;
  const END: Record<string, string> = { ",": "comma", ".": "full stop", "?": "question mark", "!": "exclamation mark", ";": "semi-colon", ":": "colon", ")": "close bracket", "”": "close inverted commas" };
  for (const tok of input.replace(/\s+/g, " ").trim().split(" ")) {
    let t = tok;
    const pre: string[] = [], post: string[] = [];
    while (t && /^[“"‘(]/.test(t)) {
      const c = t[0];
      if (c === "(") pre.push("open bracket");
      else if (c === '"') { pre.push(quoteOpen ? "close inverted commas" : "open inverted commas"); quoteOpen = !quoteOpen; }
      else { pre.push("open inverted commas"); quoteOpen = true; }
      t = t.slice(1);
    }
    while (t && /[”"’'),.?!;:]$/.test(t)) {
      const c = t[t.length - 1];
      if ((c === "’" || c === "'") && /[a-z]s['’]$/i.test(t)) { post.unshift("apostrophe"); t = t.slice(0, -1); continue; }
      if (c === "’" || c === "'" || c === '"') { post.unshift("close inverted commas"); quoteOpen = false; t = t.slice(0, -1); continue; }
      if (c === "”") quoteOpen = false;
      post.unshift(END[c]);
      t = t.slice(0, -1);
    }
    if (t === "–" || t === "–" || t === "-") { out.push(...pre, "dash", ...post); continue; }
    let word = t.replace(/['’]/g, " apostrophe ").replace(/(\w)-(\w)/g, "$1 hyphen $2");
    if (/^[A-Z]/.test(t)) word = `capital ${t[0]}, ${word}`;
    out.push(...pre, word, ...post);
  }
  return out.filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
}

export type SpeakableItem = {
  stem: string; type: "mcq" | "numeric" | "text"; choices?: string[]; choiceSvgs?: string[]; say?: string; unit?: string;
  speakChoices?: boolean; speakPunctuation?: boolean; strand?: string;
};
const UNIT_WORDS: Record<string, string> = { "£": "pounds", p: "pence", "%": "percent", "°": "degrees", cm: "centimetres", m: "metres", km: "kilometres", g: "grams", kg: "kilograms", "cm²": "square centimetres", "m²": "square metres" };

/** Everything a child needs to hear for one question: the number, the question, each option with its letter, and what to do. */
export function itemSpeech(item: SpeakableItem, n?: number, total?: number): string[] {
  const parts: string[] = [];
  if (n) parts.push(total ? `Question ${n} of ${total}.` : `Question ${n}.`);
  if (item.say && item.speakChoices === false) {
    parts.push(mathsToSpeech(item.stem));
    parts.push(`The word is: ${item.say}.`, `${item.say}.`);
  } else {
    parts.push(mathsToSpeech(item.stem));
  }
  if (item.type === "mcq") {
    if (item.choiceSvgs?.length) {
      const L = (item.choices || []).map((c) => c);
      parts.push(`Look at the pictures, then choose ${L.slice(0, -1).join(", ")} or ${L[L.length - 1]}.`);
    } else if (item.speakChoices === false) {
      parts.push(item.say ? "Tap the word you heard." : "Read the words yourself, then choose one.");
    } else {
      (item.choices || []).forEach((c, i) => parts.push(`Option ${"ABCDEFGH"[i]}: ${item.speakPunctuation ? punctuationToSpeech(c) : mathsToSpeech(c)}.`));
    }
  } else if (item.type === "numeric") {
    parts.push(`Type your answer in the box${item.unit ? `, in ${UNIT_WORDS[item.unit] || item.unit}` : ""}.`);
  } else {
    parts.push("Plan for a few minutes, then write your answer in the box.");
  }
  return parts.map((p) => p.replace(/\.\.$/, ".").replace(/\?\.$/, "?"));
}

export function passageSpeech(title: string, text: string): string[] {
  return [`${title}.`, ...text.split(/\n\n+/).map((p) => p.replace(/[“”]/g, '"').trim()).filter(Boolean)];
}
