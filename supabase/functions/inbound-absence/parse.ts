// Deterministic parser for absence emails.
//
// Pure functions only (no network, no Deno APIs), so every rule is covered by
// parse_test.ts. Given the email and the sender's own children it works out:
//
//   * which child(ren): by first name, full name, nickname/short form or a
//     small typo, "both" / "all" / "the kids" / plural pronouns, or the only
//     child when the family has one. Only that family's children can match.
//   * which dates: today / tomorrow / yesterday, weekday names ("this
//     Friday", "next Monday", "last Tuesday"), UK dates ("12/11", "12 Nov",
//     "12th of November"), ranges ("Mon to Wed", "from 2/11 until 4/11"),
//     "until Thursday", "back on Thursday", "for 3 days", "this week",
//     "next week", "w/c 9 Nov". With no date at all it uses today, or the
//     next school day when the email arrives at a weekend or after 15:00.
//   * the reason category, using the Parent Portal's list, plus a short gist.
//
// Anything it cannot settle with confidence is reported in `flags`; the
// caller then sends the email to staff review instead of guessing.

import { addDays, diffDays, formatKey, fridayOf, isSchoolDay, makeKey, mondayOf, nextSchoolDay, prevSchoolDay, schoolDaysFrom, ukNow, weekdayOf } from "./dates.ts";
import { cleanEmailBody, damerauLevenshtein, isKnownWord, normaliseForParsing } from "./text.ts";

export const REASON_CATEGORIES = ["Unwell", "Medical or dental appointment", "Family emergency", "Religious observance", "Other"] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export type ChildRef = { id: string; name: string };
export type DateRange = { from: string; to: string };

export type ParseInput = {
  subject: string;
  /** Plain-text body (already converted from HTML if needed). Quoted replies and signatures are stripped here. */
  body: string;
  receivedAt: Date;
  /** The children this sender may report for. */
  children: ChildRef[];
  /** Sender's display name, so their own name in a sign-off is never taken for a child's. */
  senderName?: string;
};

export type ChildResolution = "named" | "all" | "only_child" | "none" | "ambiguous";
export type DateResolution = "explicit" | "default_today" | "default_next_school_day" | "default_previous_school_day" | "none";

export type ParseResult = {
  cleanedBody: string;
  childIds: string[];
  childHow: ChildResolution;
  /** Names written in the email that are not one of the family's children. */
  unknownNames: string[];
  ranges: DateRange[];
  dateHow: DateResolution;
  category: ReasonCategory | null;
  gist: string;
  tense: "past" | "present";
  /** Reasons this should be checked by a person. Empty = confident. */
  flags: string[];
  /** Informational notes that don't block recording (e.g. "partial_day"). */
  notes: string[];
};

// ── reason categories ────────────────────────────────────────────────────
// Checked against the normalised text (misspellings already corrected).
// Order matters: a dentist appointment for toothache is an appointment, a
// funeral is a family emergency even if someone was ill.
const REASON_RULES: { cat: ReasonCategory; re: RegExp }[] = [
  {
    cat: "Family emergency",
    re: /\b(emergency|emergencies|bereavement|bereaved|funeral|janaza|janazah|passed away|has passed|died|death in the family|inna lillahi|inna lilahi|innalillahi|mayyat|mayat|family crisis|urgent family|critically ill|rushed to hospital)\b/,
  },
  {
    cat: "Medical or dental appointment",
    re: /\b(appointment|appointments|dentist|dental|orthodontist|orthodontic|braces|optician|opticians|eye test|eye exam|hearing test|clinic|consultant|check-up|vaccination|vaccinations|vaccine|immunisation|jab|jabs|blood test|x-ray|xray|scan|physio|physiotherapy|speech therapy|therapy session|surgery|operation|camhs|paediatrician|pediatrician)\b|\b(doctor|doctors|gp|hospital)\b.{0,25}\b(appointment|visit|check)\b|\b(see|seeing|visit|visiting|to the|at the)\s+(the\s+)?(doctor|doctors|gp|dentist|hospital)\b/,
  },
  {
    cat: "Unwell",
    re: /\b(unwell|ill|illness|sick|sickness|poorly|not well|not feeling well|under the weather|fever|feverish|temperature|high temp|vomit|vomits|vomiting|vomited|being sick|throwing up|threw up|diarrhoea|diarrhea|upset stomach|stomach ache|stomach bug|tummy|bug|virus|cold|flu|cough|coughing|covid|headache|migraine|chickenpox|chicken pox|infection|tonsillitis|conjunctivitis|sore throat|earache|ear ache|asthma|rash|hand foot and mouth|injured|injury|broke (his|her) (arm|leg|wrist)|bimar|beemar|bemar|tabiyat|tabiat|tabeeat|in hospital|admitted)\b/,
  },
  {
    cat: "Religious observance",
    re: /\b(eid|eid ul fitr|eid al fitr|eid ul adha|eid al adha|religious|umrah|umra|hajj|haj|arafah|arafat|ashura|islamic festival|religious festival|religious holiday|day of arafah|laylat|lailat)\b/,
  },
  {
    cat: "Other",
    re: /\b(holiday|vacation|travel|travelling|traveling|flight|abroad|wedding|shaadi|shadi|nikah|walima|family event|moving house|move house|house move|visa|passport|embassy|court|power cut|no power|internet|wifi|wi-fi|broadband|laptop|computer|tablet|technical|connection|exam|exams|competition|tournament|trip|bad weather|snow)\b/,
  },
];

export function categorise(norm: string): ReasonCategory | null {
  for (const r of REASON_RULES) if (r.re.test(norm)) return r.cat;
  return null;
}

// ── tense ────────────────────────────────────────────────────────────────
const PRESENT_RE = /\b(will|won't|is going to|going to|gonna|is unwell|is ill|is sick|is poorly|is not well|isn't well|not be|be off|be away|be absent|unable to|can't|cannot|not attending|not coming|not come|won't be in|off school|staying (at )?home|keeping (him|her|them) (at )?home|keep (him|her|them) (at )?home|is off|are off|is away|are away|has a|has got|have got|is feeling|are feeling|today|tomorrow|this morning|please excuse|please accept|would like to request|request)\b/;
const PAST_RE = /\b(was|wasn't|were|weren't|missed|had|has been|have been|been off|didn't|did not|stayed (at )?home|kept (him|her|them) (at )?home|couldn't|could not|yesterday|last)\b/;

function tenseOf(s: string): "past" | "present" {
  if (PRESENT_RE.test(s)) return "present";
  if (PAST_RE.test(s)) return "past";
  return "present";
}

// ── dates ────────────────────────────────────────────────────────────────
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = MONTHS.join("|");
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, "a couple of": 2, "couple of": 2, couple: 2 };

type Role = "plain" | "start" | "end" | "return" | "since";
type Atom = {
  s: number;
  e: number;
  from: string;
  to: string;
  /** "range" atoms (this week, w/c ...) already cover several days. */
  kind: "day" | "range";
  role: Role;
  durationDays?: number;
  flags: string[];
};

/** Closest-to-today year for a day and month with no year given. */
function nearestYear(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4));
  let best: string | null = null;
  for (const yy of [y - 1, y, y + 1]) {
    const k = makeKey(yy, m, d);
    if (!k) continue;
    if (!best || Math.abs(diffDays(today, k)) < Math.abs(diffDays(today, best))) best = k;
  }
  return best;
}

function fullYear(y: string | undefined, today: string): number | null {
  if (!y) return null;
  const n = Number(y);
  if (y.length === 2) return 2000 + n;
  if (y.length === 4) return n;
  return Number(today.slice(0, 4));
}

/** The sentence around position i (for local tense). */
function sentenceAt(t: string, s: number, e: number): string {
  const a = Math.max(t.lastIndexOf(".", s - 1), t.lastIndexOf("\n", s - 1), t.lastIndexOf("!", s - 1), t.lastIndexOf("?", s - 1));
  const ends = [".", "\n", "!", "?"].map((c) => t.indexOf(c, e)).filter((x) => x >= 0);
  const b = ends.length ? Math.min(...ends) : t.length;
  return t.slice(a + 1, b);
}

function resolveWeekday(today: string, target: number, qualifier: string, tense: "past" | "present", flags: string[]): string {
  const wT = weekdayOf(today);
  const ahead = (target - wT + 7) % 7; // 0..6 days until the next one (0 = today)
  const back = (wT - target + 7) % 7; // 0..6 days since the last one (0 = today)
  if (qualifier === "last") return addDays(today, -(back === 0 ? 7 : back));
  if (qualifier === "next") {
    const d = ahead === 0 ? 7 : ahead;
    const k = addDays(today, d);
    // Still ahead in this same Monday-to-Sunday week: "next Friday" said on a
    // Monday could mean this Friday or the one after. Take the week after (the
    // usual British meaning) but have a person check.
    if (mondayOf(k) === mondayOf(today)) {
      flags.push("next_weekday_ambiguous");
      return addDays(k, 7);
    }
    return k;
  }
  if (qualifier === "this" || qualifier === "this coming" || qualifier === "coming") {
    if (qualifier === "this" && tense === "past" && back < ahead) return addDays(today, -back);
    return addDays(today, ahead);
  }
  // Bare "Friday" / "on Friday": the coming one, or the last one when the
  // sentence is in the past tense ("he was off on Monday").
  return tense === "past" ? addDays(today, -back) : addDays(today, ahead);
}

type Span = { s: number; e: number };
const overlaps = (a: Span, list: Span[]) => list.some((b) => a.s < b.e && b.s < a.e);

function findAtoms(t: string, today: string, globalTense: "past" | "present", flags: string[]): Atom[] {
  const atoms: Atom[] = [];
  const add = (a: Omit<Atom, "role" | "flags"> & { flags?: string[] }) => {
    if (overlaps(a, atoms)) return;
    atoms.push({ role: "plain", flags: [], ...a });
  };
  const localTense = (s: number, e: number) => {
    const sent = sentenceAt(t, s, e);
    return PRESENT_RE.test(sent) || PAST_RE.test(sent) ? tenseOf(sent) : globalTense;
  };
  let m: RegExpExecArray | null;

  // 1. Explicit dates first: "12th of November 2026", "November 12th", "12/11/26".
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_RE})\\b(?:,?\\s+(\\d{4}))?`, "g");
  while ((m = dayMonth.exec(t))) {
    const mon = MONTHS.indexOf(m[2]) + 1;
    const d = Number(m[1]);
    const y = fullYear(m[3], today);
    const k = y ? makeKey(y, mon, d) : nearestYear(today, mon, d);
    if (k) add({ s: m.index, e: m.index + m[0].length, from: k, to: k, kind: "day" });
    else flags.push("invalid_date");
  }
  const monthDay = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "g");
  while ((m = monthDay.exec(t))) {
    if (m[1] === "may" && !/(st|nd|rd|th)\b|,?\s+\d{4}/.test(m[0]) && !/\b(on|from|until|till|to)\s+$/.test(t.slice(Math.max(0, m.index - 8), m.index))) continue; // "may 2 of them..." is not a date
    const mon = MONTHS.indexOf(m[1]) + 1;
    const d = Number(m[2]);
    const y = fullYear(m[3], today);
    const k = y ? makeKey(y, mon, d) : nearestYear(today, mon, d);
    if (k) add({ s: m.index, e: m.index + m[0].length, from: k, to: k, kind: "day" });
    else flags.push("invalid_date");
  }
  const numeric = /\b(\d{1,2})\s?[/\-.]\s?(\d{1,2})(?:\s?[/\-.]\s?(\d{4}|\d{2}))?\b(?!\s*(?:days?|weeks?|hours?|hrs?|mins?|minutes?|am|pm|lessons?|times?|kids?|children|year|yrs?|%|:))/g;
  while ((m = numeric.exec(t))) {
    const sep = m[0].replace(/[\d\s]/g, "");
    if (sep.startsWith(".") && !m[3]) continue; // "9.30" is a time; "12.11.26" is a date
    if (/^\d/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 1))) continue;
    // "3-4 days", "1-2pm": the guard above, plus "between 9-10"
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3], today);
    let k: string | null = null;
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      k = y ? makeKey(y, b, a) : nearestYear(today, b, a); // UK order: day/month
      if (!k) flags.push("invalid_date");
    } else if (a >= 1 && a <= 12 && b >= 13 && b <= 31) {
      // "11/25": impossible as day/month, so probably US month/day.
      k = y ? makeKey(y, a, b) : nearestYear(today, a, b);
      flags.push("us_date_order");
    } else if (sep.includes("/")) {
      flags.push("invalid_date");
    }
    if (k) add({ s: m.index, e: m.index + m[0].length, from: k, to: k, kind: "day" });
  }

  // 2. Week phrases.
  const restOfWeek = /\b((?:for )?(?:the )?rest of (?:the|this) week|(?:for )?(?:the )?(?:whole|entire) week|all (?:of )?(?:this |the )?week|for the week|this week)\b/g;
  while ((m = restOfWeek.exec(t))) {
    // Anchored later to the start date (or default start) of the absence.
    add({ s: m.index, e: m.index + m[0].length, from: "", to: "", kind: "range" });
    atoms[atoms.length - 1].flags.push("to_friday");
  }

  // 3. Weekday names, with "this" / "next" / "last" / "on".
  const wd = /\b(?:(this coming|coming|this|next|last|on)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/g;
  while ((m = wd.exec(t))) {
    const q = m[1] || "";
    const k = resolveWeekday(today, WEEKDAYS.indexOf(m[2]), q === "on" ? "" : q, localTense(m.index, m.index + m[0].length), flags);
    const span = { s: m.index + (q === "on" ? 3 : 0), e: m.index + m[0].length };
    // "Monday 2nd November" / "2/11 (Monday)": keep the explicit date, check they agree.
    const near = atoms.find((a) => a.kind === "day" && a2s(a, span, t));
    if (near) {
      if (weekdayOf(near.from) !== WEEKDAYS.indexOf(m[2])) flags.push("weekday_date_mismatch");
      near.s = Math.min(near.s, span.s);
      near.e = Math.max(near.e, span.e);
      continue;
    }
    add({ ...span, from: k, to: k, kind: "day", flags: [`weekday:${WEEKDAYS.indexOf(m[2])}`] });
  }

  // "next week", including "Mon to Wed next week" / "next week on Tuesday",
  // which move those weekdays into next week instead of covering it all.
  const nextWeek = /\bnext week\b/g;
  while ((m = nextWeek.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    const mon = addDays(mondayOf(today), 7);
    const ns = m.index;
    const ne = m.index + m[0].length;
    const near = atoms.filter((a) => a.flags.some((f) => f.startsWith("weekday:")) && ((a.e <= ns && ns - a.e <= 30 && !/[.!?\n]/.test(t.slice(a.e, ns))) || (a.s >= ne && a.s - ne <= 20 && !/[.!?\n]/.test(t.slice(ne, a.s)))));
    if (near.length) {
      for (const a of near) {
        const w = Number(a.flags.find((f) => f.startsWith("weekday:"))!.slice(8));
        a.from = a.to = addDays(mon, (w + 6) % 7);
      }
      const i = flags.indexOf("next_weekday_ambiguous");
      if (i >= 0) flags.splice(i, 1);
      continue;
    }
    if (/\b(back|return|returning|returns|be in|coming in|come in|in school|rejoin)\b[^.]*$/.test(before) && !/\b(not|won't|wont|n't|unable to|cannot|can't)\s+(be\s+)?(back|in|coming|come|return|returning|attend|attending|rejoin|at school|in school)\b[^.,]*$/.test(before)) {
      add({ s: ns, e: ne, from: mon, to: mon, kind: "day" });
      atoms[atoms.length - 1].role = "return";
    } else {
      add({ s: ns, e: ne, from: mon, to: addDays(mon, 4), kind: "range" });
    }
  }

  // 4. "the 12th" with no month: the nearest such date.
  const ord = /\b(?:the|on)\s+(\d{1,2})(st|nd|rd|th)\b/g;
  while ((m = ord.exec(t))) {
    const d = Number(m[1]);
    const y = Number(today.slice(0, 4));
    const mo = Number(today.slice(5, 7));
    const cands = [-1, 0, 1].map((off) => {
      const mm = ((mo - 1 + off + 12) % 12) + 1;
      const yy = y + Math.floor((mo - 1 + off) / 12);
      return makeKey(yy, mm, d);
    }).filter((k): k is string => !!k);
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(diffDays(today, a)) - Math.abs(diffDays(today, b)) || (b > a ? 1 : -1));
    add({ s: m.index, e: m.index + m[0].length, from: cands[0], to: cands[0], kind: "day" });
  }

  const wc = new RegExp(`\\bweek (?:commencing|beginning|starting)(?: on)?(?: the)?\\s*`, "g");
  while ((m = wc.exec(t))) {
    // Applied to the date that follows (handled after all atoms are found).
    const after = atoms.find((a) => a.s >= m!.index + m![0].length - 1 && a.s <= m!.index + m![0].length + 2);
    if (after) {
      const mon = mondayOf(after.from);
      after.from = mon;
      after.to = addDays(mon, 4);
      after.kind = "range";
      after.s = m.index;
    }
  }

  // 5. Relative days.
  const rel = /\b(the day after tomorrow|day after tomorrow|today|this morning|this afternoon|tomorrow|yesterday)\b/g;
  while ((m = rel.exec(t))) {
    const w = m[1];
    const k = w.includes("after tomorrow") ? addDays(today, 2) : w === "tomorrow" ? addDays(today, 1) : w === "yesterday" ? addDays(today, -1) : today;
    add({ s: m.index, e: m.index + m[0].length, from: k, to: k, kind: "day" });
  }

  atoms.sort((a, b) => a.s - b.s);
  return atoms;
}

/** True when the weekday span sits right next to the explicit date atom. */
function a2s(a: Atom, span: Span, t: string): boolean {
  return (a.s >= span.e && /^[\s,(]*(the\s+)?$/.test(t.slice(span.e, a.s))) || (a.e <= span.s && /^[\s,(]*$/.test(t.slice(a.e, span.s)));
}

function assignRoles(t: string, atoms: Atom[]) {
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.role === "return") continue;
    const prev = atoms[i - 1];
    const gap = prev ? t.slice(prev.e, a.s) : "";
    const before = t.slice(Math.max(0, a.s - 40), a.s);
    if (prev && /^\s*(to|till|til|until|untill|-|through|thru|up to|upto|up until)\s*(and including\s*)?(the\s+)?$/.test(gap)) {
      if (prev.role === "plain") prev.role = "start";
      a.role = "end";
    } else if (prev && prev.role === "start" && /\bbetween\s*(the\s+)?$/.test(t.slice(Math.max(0, prev.s - 12), prev.s)) && /^\s*and\s*(the\s+)?$/.test(gap)) {
      a.role = "end";
    } else if (/\b(until|till|til|untill|up to|up until|through|thru)\s*(and including\s*)?(the\s+)?$/.test(before)) {
      a.role = "end";
    } else if (/\bsince\s*(the\s+)?(last\s+)?$/.test(before)) {
      a.role = "since";
    } else if (/\b(from|starting|beginning|between)\s*(on\s+)?(the\s+)?$/.test(before)) {
      a.role = "start";
    } else if (/\b(back|return|returning|returns|be in|coming in|come in|come back|coming back|in school|rejoin|rejoining|resume|resuming|attend|attending|be at school|be in school)\s+(to school\s+)?(on|from|by)?\s*(the\s+)?$/.test(before) && !/\b(not|won't|wont|n't|unable to|cannot|can't)\s+(be\s+)?(back|in|coming|come|return|returning|attend|attending|rejoin|at school|in school)\b[^.,]*$/.test(before)) {
      a.role = "return";
    }
  }
}

function attachDurations(t: string, atoms: Atom[], flags: string[]): { days: number; s: number }[] {
  const loose: { days: number; s: number }[] = [];
  const re = /\bfor\s+(?:the\s+)?(?:next\s+)?(\d+|a couple of|couple of|a few|few|several|one|two|three|four|five|six|seven|eight|nine|ten|an|a)\s+(?:more\s+)?(?:school\s+)?(days?|weeks?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const word = m[1];
    if (/few|several/.test(word)) {
      flags.push("vague_duration");
      continue;
    }
    const n = /^\d+$/.test(word) ? Number(word) : NUM_WORDS[word] ?? 0;
    if (!n) continue;
    const days = m[2].startsWith("week") ? n * 5 : n;
    if (days > 40) {
      flags.push("too_long");
      continue;
    }
    // Attach to the nearest start/plain day atom: before it in the same sentence, or just after.
    const s = m.index;
    const sentStart = Math.max(t.lastIndexOf(".", s), t.lastIndexOf("\n", s));
    const cands = atoms.filter((a) => a.kind === "day" && (a.role === "plain" || a.role === "start") && a.durationDays === undefined);
    const beforeA = cands.filter((a) => a.e <= s && a.s > sentStart).pop();
    const afterA = cands.find((a) => a.s >= m!.index + m![0].length && a.s - (m!.index + m![0].length) <= 25);
    const target = beforeA || afterA;
    if (target) target.durationDays = days;
    else loose.push({ days, s });
  }
  return loose;
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = ranges.filter((r) => r.from && r.to).map((r) => (r.to < r.from ? { from: r.to, to: r.from } : r)).sort((a, b) => a.from.localeCompare(b.from));
  const out: DateRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    // Merge overlapping, touching, or only split by a weekend (Fri + Mon).
    if (last && (r.from <= addDays(last.to, 1) || (!isSchoolDay(addDays(last.to, 1)) && r.from <= nextSchoolDay(last.to)))) {
      if (r.to > last.to) last.to = r.to;
    } else out.push({ ...r });
  }
  return out;
}

/** Trims weekend days off the ends of a range; null if nothing is left. */
function trimToSchoolDays(r: DateRange): DateRange | null {
  let { from, to } = r;
  while (from <= to && !isSchoolDay(from)) from = addDays(from, 1);
  while (to >= from && !isSchoolDay(to)) to = addDays(to, -1);
  return from <= to ? { from, to } : null;
}

// ── children ─────────────────────────────────────────────────────────────
const NICKNAMES: Record<string, string[]> = {
  mo: ["muhammad", "mohammed", "mohammad", "mohamed", "muhammed", "mohamad"],
  moe: ["muhammad", "mohammed", "mohammad", "mohamed", "muhammed"],
  moh: ["muhammad", "mohammed", "mohammad", "mohamed"],
  zak: ["zakariya", "zakaria", "zakariyya", "zakariyah", "zakir", "zakary"],
  zack: ["zakariya", "zakaria", "zakariyya", "zakariyah"],
  ibby: ["ibrahim"],
  ibi: ["ibrahim"],
  abdi: ["abdullah", "abdirahman", "abdirizak"],
  sully: ["sulaiman", "suleiman", "sulayman", "sulaimaan"],
  izzy: ["ismail", "isa", "isaac", "izaan", "izzah"],
  fati: ["fatima", "fatimah"],
  zee: ["zainab", "zaynab", "zayn", "zain"],
  yus: ["yusuf", "yousuf", "yusef", "yousef"],
  hamz: ["hamza", "hamzah"],
  musty: ["mustafa"],
  ayo: ["ayoub", "ayyub"],
  khadi: ["khadija", "khadijah"],
  sumi: ["sumayya", "sumaiya", "sumayyah"],
  ruqi: ["ruqayya", "ruqayyah"],
  hafs: ["hafsa", "hafsah"],
};

/** Transliteration-tolerant key: "Mohammed" and "Muhammad" end up one letter apart, "Aishah" = "Ayesha" ... */
export function nameKey(s: string): string {
  let k = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  k = k.replace(/ph/g, "f").replace(/ck/g, "k").replace(/q/g, "k").replace(/ou|oo/g, "u").replace(/ee|ei|ie/g, "i");
  k = k.replace(/e/g, "i").replace(/y/g, "i").replace(/o/g, "u");
  k = k.replace(/(.)\1+/g, "$1");
  k = k.replace(/([aiu])h$/, "$1");
  return k;
}

function givenNames(name: string): string[] {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, -1) : parts;
}

/** How well a written word matches one of a child's given names: 3 exact, 2 spelling variant/nickname, 1 typo/short form, 0 no. */
function matchLevel(tok: string, child: ChildRef, isCommonWord: boolean): number {
  let best = 0;
  for (const g of givenNames(child.name)) {
    if (tok === g) return 3;
    if (isCommonWord) continue; // "will", "may", "hope": exact only
    const kt = nameKey(tok);
    const kg = nameKey(g);
    if (kt.length >= 3 && kt === kg) best = Math.max(best, 2);
    if ((NICKNAMES[tok] || []).some((n) => nameKey(n) === kg)) best = Math.max(best, 2);
    if (tok.length >= 4 && kt.length >= 4 && kg.length >= 4 && damerauLevenshtein(kt, kg) <= 1) best = Math.max(best, 2);
    if (tok.length >= 4 && damerauLevenshtein(tok, g) <= (g.length >= 7 ? 2 : 1)) best = Math.max(best, 1);
    if (tok.length >= 3 && g.length >= 5 && g.startsWith(tok) && tok.length < g.length) best = Math.max(best, 1);
  }
  return best;
}

const ATTENDING_RE = /\b(will be in|be in as normal|as normal|as usual|is fine|is well|is ok|is okay|is coming in|will come in|will attend|is attending|will be attending|is in school|will be at school|still coming|still attending)\b/;
// "both", "all my children", "the kids" ...
const ALL_RE = /\b(all (of )?(my|our|the|them|three|four|five|of them|\d)|all my|my (children|kids|three|four|boys and girls)|our (children|kids)|the (children|kids)|my kids|both of them|both|the twins|my twins|siblings|all the children|all of them)\b/;
// Plural pronouns used about the absence itself ("they are both ill", "keeping them home"), not "please let them know".
const PRONOUN_ALL_RE = /\b(they('re| are| were| have| will| won't| both| all| woke| feel| have both| are both| aren't| can't| cannot)|(keeping|keep|kept|keeping) them)\b/;
const NON_NAMES = new Set(
  "i he she they it we you my our his her their this that these those today tomorrow yesterday please hope unfortunately sadly also and but so who which everyone mum mom dad mother father grandma grandad nan nana granny baby teacher teachers ustadh ustadha sister brother doctor dr mr mrs ms miss sir madam dear hi hello salaam assalamu asalamu as-salamu alaikum allah alhamdulillah inshallah mashallah thanks thank kind regards best the a an just as if when he's she's i'm we're they're it's there here sorry morning afternoon evening good apologies".split(" "),
);

function resolveChildren(rawText: string, norm: string, children: ChildRef[], senderName: string | undefined, flags: string[]): { ids: string[]; how: ChildResolution; unknown: string[] } {
  const sender = new Set((senderName || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  const childNameWords = new Set(children.flatMap((c) => givenNames(c.name)));
  const words = rawText.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'-]*/g) || [];
  const definite = new Set<string>();
  const attending = new Set<string>();
  const multi: Set<string>[] = [];
  for (const w of words) {
    const tok = w.toLowerCase().replace(/'s$/, "").replace(/'$/, "");
    if (tok.length < 2) continue;
    if (sender.has(tok) && !childNameWords.has(tok)) continue;
    const common = NON_NAMES.has(tok) || isKnownWord(tok);
    if (common && (!childNameWords.has(tok) || /^[a-z]/.test(w))) continue; // a child called "Will" only counts when written "Will"
    const levels = children.map((c) => matchLevel(tok, c, common && /^[a-z]/.test(w)));
    const top = Math.max(0, ...levels);
    if (top === 0) continue;
    const hits = children.filter((_, i) => levels[i] === top).map((c) => c.id);
    if (hits.length === 1) definite.add(hits[0]);
    else multi.push(new Set(hits));
  }
  // Full names settle shared given names ("Muhammad Ali" vs "Muhammad Umar").
  const lowerRaw = rawText.toLowerCase();
  for (const c of children) if (c.name.trim().split(/\s+/).length >= 2 && lowerRaw.includes(c.name.trim().toLowerCase())) definite.add(c.id);
  // A child mentioned only as attending ("Maryam will be in as normal") is not absent.
  for (const clause of rawText.split(/[.!?\n;]+|\b(?:but|while|whereas|however)\b/i)) {
    const c = clause.toLowerCase();
    if (!ATTENDING_RE.test(c) || /\b(not|won't|wont|n't|off|absent|away|miss|missing|unwell|ill|sick|poorly|appointment)\b/.test(normaliseForParsing(c))) continue;
    for (const ch of children) {
      if (!definite.has(ch.id)) continue;
      const toks = (clause.match(/[A-Za-z\u00C0-\u024F'-]+/g) || []).map((w) => w.toLowerCase().replace(/'s$/, ""));
      if (toks.some((tok) => matchLevel(tok, ch, false) >= 2)) {
        definite.delete(ch.id);
        attending.add(ch.id);
      }
    }
  }
  const unresolved = multi.filter((s) => ![...s].some((id) => definite.has(id) || attending.has(id)));

  // Names of people who aren't this family's children ("Bilal is unwell" from a family whose children are Yusuf and Maryam).
  const unknown: string[] = [];
  const unknownRe = /\b([A-Z][a-zÀ-ɏ'-]{1,20})\s+(?:is|was|has|had|will|won't|wont|isn't|wasn't|can't|cannot|couldn't|woke|felt|feels|needs|got|are|were)\b/g;
  const ownerRe = /\bmy (?:son|daughter|child|boy|girl)\s+([A-Z][a-zÀ-ɏ'-]{1,20})\b/g;
  for (const re of [unknownRe, ownerRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText))) {
      const tok = m[1].toLowerCase();
      if (NON_NAMES.has(tok) || isKnownWord(tok) || sender.has(tok) || WEEKDAYS.includes(tok) || MONTHS.includes(tok)) continue;
      if (children.some((c) => matchLevel(tok, c, false) > 0)) continue;
      if (!unknown.includes(m[1])) unknown.push(m[1]);
    }
  }

  const allPhrase = ALL_RE.exec(norm);
  const pronounAll = PRONOUN_ALL_RE.test(norm);
  if (definite.size > 0) {
    if (unresolved.length) return { ids: [...definite], how: "ambiguous", unknown };
    // "both Yusuf and Maryam" is fine; "all my children ... Yusuf" when there are three is not.
    if (allPhrase && definite.size < children.length && !(allPhrase[1] === "both" && definite.size === 2)) flags.push("children_conflict");
    return { ids: children.filter((c) => definite.has(c.id)).map((c) => c.id), how: "named", unknown };
  }
  if (unresolved.length) return { ids: [], how: "ambiguous", unknown };
  if ((allPhrase || pronounAll) && children.length > 1 && attending.size === 0) {
    if (allPhrase && allPhrase[1] === "both" && children.length !== 2) return { ids: [], how: "ambiguous", unknown };
    return { ids: children.map((c) => c.id), how: "all", unknown };
  }
  if (children.length === 1 && attending.size === 0) return { ids: [children[0].id], how: "only_child", unknown };
  return { ids: [], how: "none", unknown };
}

// ── gist ─────────────────────────────────────────────────────────────────
const GREETING_RE = /^\s*(dear\b[^\n,]*|hi\b[^\n,]*|hello\b[^\n,]*|good (morning|afternoon|evening)\b[^\n,]*|(as-?)?sa?lam+u?\s*(alaikum|alaykum|alaikom|aleikum|aleykum|alykm)?(\s+wa\s*rahmatullah\w*)?(\s+wa\s*barakatuh\w*)?|salaam|salam|aoa|assalam\w*)(\s*\b(sister|brother|sir\/madam|sir|madam|ustadh|ustadha|ustaza|all|team|everyone|there)\b)?[\s,.!:-]*/i;
const FILLER_RE = /^(i am|i'm|we are|we're|just)?\s*(writing|emailing|messaging|contacting you)?\s*(to\s+)?(let you know|inform you|say|tell you|notify you|confirm)\s*(that\s+)?/i;

export function makeGist(cleaned: string, norm: (s: string) => string): string {
  const body = cleaned.replace(GREETING_RE, "").trim();
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(thank|thanks|jazak|please (let|contact|call)|many thanks|kind regards|regards|any questions|let me know)/i.test(s))
    .filter((s) => !GREETING_RE.test(s) || s.replace(GREETING_RE, "").trim().length > 0)
    .map((s) => s.replace(GREETING_RE, "").replace(FILLER_RE, "").trim())
    .filter(Boolean);
  if (!sentences.length) return "";
  const withReason = sentences.filter((s) => categorise(norm(s)) !== null);
  const picked = withReason.length ? withReason : sentences;
  let gist = "";
  for (const s of picked) {
    const next = gist ? `${gist} ${s}` : s;
    if (gist && next.length > 180) break;
    gist = next;
  }
  gist = gist.replace(/\s+/g, " ").replace(/—|–/g, "-");
  if (gist.length > 200) gist = `${gist.slice(0, 197).replace(/\s+\S*$/, "")}...`;
  return gist.charAt(0).toUpperCase() + gist.slice(1);
}

// ── main entry ───────────────────────────────────────────────────────────
export function parseAbsenceEmail(input: ParseInput): ParseResult {
  const flags: string[] = [];
  const notes: string[] = [];
  const cleaned = cleanEmailBody(input.body);
  const subject = (input.subject || "").replace(/^\s*((re|fw|fwd|aw)\s*:\s*)+/i, "").trim();
  const raw = `${subject}\n${cleaned}`;
  const norm = normaliseForParsing(raw);
  const { today, hour } = ukNow(input.receivedAt);
  const tense = tenseOf(norm);

  // Corrections and cancellations ("ignore my last email", "he's coming in after all").
  if (/\b(ignore|disregard) (my|the|our) (previous|last|earlier|other)|\bcancel(led)? (the|my|his|her|this)? ?(absence|note)|\bno longer (be )?(off|absent|away|sick|unwell)|\b(is|are) (now )?(coming|back) (in|to school)|\bafter all\b|\bwrong date\b|\bsorry,? i meant\b/.test(norm)) {
    flags.push("correction_or_cancellation");
  }
  if (/\b(late|arrive late|arriving late|running late|leave early|leaving early|pick (him|her|them) up early|collect (him|her|them) early|half day|part of the day|after lunch|before lunch|miss (the )?(first|last|morning|afternoon))\b/.test(norm)) notes.push("partial_day");

  // Children
  const kids = resolveChildren(raw, norm, input.children, input.senderName, flags);
  if (kids.unknown.length) flags.push("unknown_name");

  // Dates
  const atoms = findAtoms(norm, today, tense, flags);
  assignRoles(norm, atoms);
  const loose = attachDurations(norm, atoms, flags);
  const schoolToday = isSchoolDay(today);
  const defaultStart = (): { key: string; how: DateResolution } => {
    if (tense === "past") {
      if (schoolToday) return { key: today, how: "default_today" };
      flags.push("past_absence_no_date_at_weekend");
      return { key: prevSchoolDay(today), how: "default_previous_school_day" };
    }
    if (schoolToday && hour < 15) return { key: today, how: "default_today" };
    return { key: nextSchoolDay(today), how: "default_next_school_day" };
  };
  // Start of an open-ended "until Thursday" / "back on Thursday": today if it's a school day (a note covering a day they then attend is harmless).
  const openStart = () => (schoolToday ? today : nextSchoolDay(today));

  const ranges: DateRange[] = [];
  let dateHow: DateResolution = atoms.length ? "explicit" : "none";
  let pending: Atom | null = null;
  const closePending = () => {
    if (!pending) return;
    if (pending.role === "since") ranges.push({ from: pending.from, to: schoolToday ? today : prevSchoolDay(today) });
    else if (pending.durationDays) ranges.push(schoolDaysFrom(pending.from, pending.durationDays));
    else {
      ranges.push({ from: pending.from, to: pending.to });
      if (pending.role === "start") flags.push("open_ended");
    }
    pending = null;
  };
  for (const a of atoms) {
    if (a.flags.includes("to_friday")) {
      // "for the rest of the week": from the start so far (or the default) to that Friday
      const start: string = pending ? pending.from : ranges.length ? ranges[ranges.length - 1].from : defaultStart().key;
      if (pending) pending = null;
      else if (ranges.length) ranges.pop();
      const s2 = isSchoolDay(start) ? start : nextSchoolDay(start);
      ranges.push({ from: s2, to: fridayOf(s2) });
      continue;
    }
    if (a.kind === "range") {
      closePending();
      ranges.push({ from: a.from, to: a.to });
      continue;
    }
    switch (a.role) {
      case "start":
      case "since":
        closePending();
        pending = a;
        if (a.durationDays) closePending();
        break;
      case "end": {
        const from: string = pending ? pending.from : openStart();
        pending = null;
        ranges.push({ from, to: a.from });
        break;
      }
      case "return": {
        const from: string = pending ? pending.from : openStart();
        pending = null;
        const to = prevSchoolDay(a.from);
        if (to < from) flags.push("return_before_start");
        else ranges.push({ from, to });
        break;
      }
      default:
        closePending();
        if (a.durationDays) ranges.push(schoolDaysFrom(a.from, a.durationDays));
        else ranges.push({ from: a.from, to: a.to });
    }
  }
  closePending();
  if (loose.length) {
    const d = defaultStart();
    for (const l of loose) ranges.push(schoolDaysFrom(d.key, l.days));
    if (!atoms.length) dateHow = d.how;
  }
  if (!ranges.length && !atoms.length && !loose.length) {
    const d = defaultStart();
    ranges.push({ from: d.key, to: d.key });
    dateHow = d.how;
  }

  // Tidy: drop weekend-only days, merge, sanity-check the window.
  const tidied: DateRange[] = [];
  for (const r of mergeRanges(ranges)) {
    const t = trimToSchoolDays(r);
    if (t) tidied.push(t);
    else flags.push("non_school_day");
  }
  const finalRanges = mergeRanges(tidied);
  for (const r of finalRanges) {
    if (diffDays(today, r.from) < -14 || diffDays(today, r.to) > 60) flags.push("date_out_of_window");
    if (diffDays(r.from, r.to) > 31) flags.push("too_long");
  }
  if (!finalRanges.length && !flags.includes("non_school_day")) flags.push("no_dates");

  // Reason
  const category = categorise(norm);
  const gist = makeGist(cleaned, normaliseForParsing) || (category ?? "");
  if (!category) flags.push("no_reason");

  // Children checks
  if (kids.how === "ambiguous") flags.push("children_ambiguous");
  if (kids.how === "none") flags.push("children_unknown");

  return {
    cleanedBody: cleaned,
    childIds: kids.ids,
    childHow: kids.how,
    unknownNames: kids.unknown,
    ranges: finalRanges,
    dateHow,
    category,
    gist,
    tense,
    flags: [...new Set(flags)],
    notes,
  };
}

/** "Thu 29 Oct 2026" style helper re-exported for the reply emails. */
export { formatKey };
