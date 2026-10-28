// Text clean-up for inbound absence emails:
//   * htmlToText: a plain-text view of an HTML-only email
//   * cleanEmailBody: drops quoted earlier messages, signatures, "Sent from
//     my iPhone" lines and disclaimers, so only what the parent just wrote
//     is parsed
//   * normaliseForParsing: lower case, text-speak expanded and common
//     misspellings corrected ("tommorow", "wensday", "temprature"), so the
//     date and reason rules below only need to know the correct spellings
//   * damerauLevenshtein: the edit distance used for the fuzzy matching

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: "..." };

export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "");
  // Quoted earlier messages in Gmail / Outlook / Apple Mail HTML.
  s = s.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i, "");
  s = s.replace(/<div[^>]*id="(divRplyFwdMsg|appendonsend)"[\s\S]*$/i, "");
  s = s.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&(#?\w+);/g, (m, e: string) => {
    if (ENTITIES[e]) return ENTITIES[e];
    if (/^#\d+$/.test(e)) return String.fromCharCode(Number(e.slice(1)));
    if (/^#x[0-9a-f]+$/i.test(e)) return String.fromCharCode(parseInt(e.slice(2), 16));
    return m;
  });
  return s;
}

const SIGN_OFF = /^\s*(kind(est)? regards|warm(est)? regards|best regards|regards|many thanks|thanks( so much| again| very much)?|thank you( so much| very much| in advance)?|thx|ty|best wishes|best|cheers|sincerely|yours (sincerely|faithfully|truly)|jazak(a|u|i)?\s*(allah|allahu|allaahu)\s*(khair|khayr|khairan|khayran|kheir)?|jzk|jazakallah(u)?\s*(khair|khayr|khairan|khayran)?|wa?s+alam+(u)?( alaikum| alaykum| alaikom)?|was+alaam|w\/?salam|salaam|take care|many thanks in advance)\b[\s,.!]*$/i;
const CUT_LINE = [
  /^\s*-{2,}\s*original message\s*-{2,}/i,
  /^\s*-{2,}\s*forwarded message\s*-{2,}/i,
  /^\s*begin forwarded message/i,
  /^\s*_{5,}\s*$/,
  /^\s*(sent from my|sent from outlook|get outlook for|sent from yahoo|sent from mail for windows|sent via|sent using)\b/i,
  /^\s*(this e-?mail (and any|is confidential|may contain)|confidentiality notice|disclaimer:)/i,
];

/**
 * Keeps only what the parent wrote in this message. Removes quoted replies
 * ("On Tue, ... wrote:", Outlook "From: ... Sent:" headers, "> " lines),
 * the "-- " signature marker, phone signatures and a trailing sign-off block
 * ("Kind regards, Amina Khan, 07...").
 */
export function cleanEmailBody(raw: string): string {
  const text = (raw || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const lines = text.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    // "On Tue, 27 Oct 2026 at 08:01, School <x@y> wrote:" (sometimes wrapped onto two lines)
    if (/^\s*on\b.{0,200}\bwrote:\s*$/i.test(line) || (/^\s*on\b.{6,200}$/i.test(line) && /^.{0,120}\bwrote:\s*$/i.test(next))) break;
    if (/^\s*le\b.{0,200}\ba écrit\s*:\s*$/i.test(line)) break;
    // Outlook: "From: ..." followed within a few lines by "Sent:" / "Date:"
    if (/^\s*\*?from:\*?\s/i.test(line) && lines.slice(i + 1, i + 5).some((l) => /^\s*\*?(sent|date|to|subject):\*?\s/i.test(l))) break;
    if (CUT_LINE.some((re) => re.test(line))) break;
    if (/^\s*--\s*$/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  // Trailing sign-off: a line that is only "Kind regards" / "JazakAllah khair"
  // etc. with at most six short lines (name, phone) after it.
  for (let i = 0; i < kept.length; i++) {
    if (!SIGN_OFF.test(kept[i])) continue;
    const rest = kept.slice(i + 1).filter((l) => l.trim());
    if (rest.length <= 6 && rest.every((l) => l.trim().length <= 60)) {
      kept.length = i;
      break;
    }
  }
  return kept.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

/** Edit distance counting a swap of two neighbouring letters as one edit. */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// Text-speak and abbreviations, expanded word for word.
const TEXTSPEAK: Record<string, string> = {
  "2day": "today", tday: "today", tdy: "today", tody: "today",
  "2moro": "tomorrow", "2morro": "tomorrow", "2morrow": "tomorrow", "2moz": "tomorrow", "2mrw": "tomorrow", "2mro": "tomorrow", "2morow": "tomorrow", "2mor": "tomorrow",
  tmrw: "tomorrow", tmr: "tomorrow", tmrow: "tomorrow", tmoz: "tomorrow", tomoz: "tomorrow", tmw: "tomorrow", tomo: "tomorrow", tomm: "tomorrow",
  yday: "yesterday", yest: "yesterday", ystrdy: "yesterday",
  mon: "monday", tue: "tuesday", tues: "tuesday", wed: "wednesday", weds: "wednesday", wednes: "wednesday", thu: "thursday", thur: "thursday", thurs: "thursday", thr: "thursday", thurday: "thursday", fri: "friday",
  jan: "january", feb: "february", mar: "march", apr: "april", jun: "june", jul: "july", aug: "august", sep: "september", sept: "september", oct: "october", nov: "november", dec: "december",
  appt: "appointment", appts: "appointments", apt: "appointment", appoint: "appointment",
  dr: "doctor", drs: "doctors", gp: "gp", hosp: "hospital", dentists: "dentist", docs: "doctors", doc: "doctor",
  pls: "please", plz: "please", thx: "thanks", wk: "week", wks: "weeks", hes: "he's", shes: "she's", wont: "won't", cant: "can't", isnt: "isn't", wasnt: "wasn't", didnt: "didn't", doesnt: "doesn't", couldnt: "couldn't", im: "i'm",
  u: "you", ur: "your", bc: "because", cos: "because", coz: "because", cuz: "because", b4: "before",
  sik: "sick", sic: "sick", ill: "ill", unwel: "unwell", "un-well": "unwell", poorley: "poorly", pourly: "poorly",
  temp: "temperature", temps: "temperature",
  kids: "kids", kidz: "kids", childs: "children", childrens: "children",
};

// The words the rules look for. Misspellings within a small edit distance of
// one of these are corrected to it ("wensday" -> "wednesday").
const VOCAB = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "today", "tomorrow", "yesterday", "morning", "afternoon", "week", "weeks", "next", "until", "between", "returning", "commencing",
  "unwell", "sick", "poorly", "fever", "temperature", "vomiting", "vomited", "sickness", "diarrhoea", "diarrhea", "headache", "migraine", "stomach", "tummy", "cough", "coughing", "chickenpox", "infection", "tonsillitis", "conjunctivitis", "flu", "covid", "sore", "throat", "illness", "unwell",
  "appointment", "appointments", "dentist", "dental", "doctor", "doctors", "hospital", "orthodontist", "optician", "opticians", "clinic", "consultant", "vaccination", "vaccine", "surgery", "operation", "check-up",
  "emergency", "funeral", "bereavement", "passed", "janazah",
  "religious", "ramadan", "umrah", "hajj", "festival",
  "holiday", "wedding", "absent", "absence", "attending", "children", "both",
];

// Ordinary words that must never be "corrected" into a vocabulary word,
// e.g. "never" is one edit from "fever" and "general" two from "funeral".
const PROTECTED = new Set(
  (
    "a about above after again against all also am an and any are as at away back be because been before being below between both but by can could did do does doing done down during each even ever every few for from further get got had has have having he her here hers him his how i if in into is it its just keep kept last later lesson lessons let like made make many may me might more most much must my never no nor not now of off often on once only or other our out over own please really same see seen she should since so some still such than that the their them then there these they this those though through thus till to too under until up upon us very was we well were what when where which while who whom why will with would yet you your yours " +
    "today's mother father mum mom dad grand nan nana nanny granny grandma grandad brother sister son daughter family child children kid kids boy boys girl girls twins teacher teachers class classes school home house work " +
    "never sever ever clever lever river fewer feverish rough tough though through cough dough could would should cold hold told gold bold older sore more store score shore wore " +
    "general several genuine funny sunny money monkey moody mondays fridays sundays " +
    "march marched marching april may june july august sat sun wed mon fri " +
    "having saving moving leaving loving living giving coming going doing being seeing feeling hoping " +
    "inform informed informing letting know knew known writing written wrote message email emails reply replied " +
    "alhamdulillah inshallah insha'allah mashallah allah salaam salam assalamu alaikum walaikum wa rahmatullah barakatuh brother sister ustadh ustadha " +
    "eid arafah jumuah jummah janaza nikah walima aqiqah"
  ).split(/\s+/),
);

/** Allowed edit distance for a word of this length (0 = exact only). */
function allowance(len: number): number {
  if (len >= 7) return 2;
  if (len >= 4) return 1;
  return 0;
}

const vocabCache = new Map<string, string | null>();

/** The vocabulary word a (possibly misspelt) token stands for, if any. */
export function correctWord(tok: string): string | null {
  if (TEXTSPEAK[tok]) return TEXTSPEAK[tok];
  if (PROTECTED.has(tok)) return null;
  if (VOCAB.includes(tok)) return tok;
  if (vocabCache.has(tok)) return vocabCache.get(tok)!;
  let best: string | null = null;
  let bestD = 99;
  if (/^[a-z]+$/.test(tok) && tok.length >= 4) {
    for (const v of VOCAB) {
      const allow = Math.min(allowance(tok.length), allowance(v.length));
      if (allow === 0) continue;
      const dist = damerauLevenshtein(tok, v);
      if (dist <= allow && dist < bestD) {
        best = v;
        bestD = dist;
      }
    }
  }
  vocabCache.set(tok, best);
  return best;
}

/** True when a token is a known word the parser uses, or an ordinary English word. */
export function isKnownWord(tok: string): boolean {
  return PROTECTED.has(tok) || VOCAB.includes(tok) || !!TEXTSPEAK[tok] || correctWord(tok) !== null;
}

/**
 * Lower-cases, tidies punctuation, expands text-speak ("2moro", "tmrw",
 * "w/c", "appt") and corrects misspellings of the words the rules use.
 * The result is what every date and reason rule runs against.
 */
export function normaliseForParsing(s: string): string {
  let t = (s || "").toLowerCase();
  t = t.replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  t = t.replace(/\bw\s*\/\s*c\b/g, " week commencing ").replace(/\bw\.c\.?(?=\s)/g, " week commencing ");
  t = t.replace(/\bd\s*&\s*v\b/g, " vomiting diarrhoea ").replace(/\bd\s*and\s*v\b/g, " vomiting diarrhoea ");
  t = t.replace(/\bcheck\s*-?\s*up\b/g, " check-up ");
  // "1st", "22nd" stay as they are; split "mon-wed" style joins so each side is one token
  t = t.replace(/([a-z])-([a-z])/g, "$1 - $2");
  t = t.replace(/[a-z0-9']+/g, (tok) => {
    const core = tok.replace(/^'+|'+$/g, "");
    if (!core) return tok;
    const fixed = correctWord(core);
    return fixed ?? tok;
  });
  // "check - up" joined back after the split above
  t = t.replace(/check - up/g, "check-up");
  return t.replace(/[ \t]+/g, " ");
}
