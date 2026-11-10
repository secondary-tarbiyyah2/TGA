// The lesson format's optional extras, shared by the slide builder (scripts/lessons), its
// validator, the curriculum sync (scripts/curriculum/lib.mjs) and the portal's lesson editor
// (src/components/learn/curriculum/LessonEditor.tsx), so all four agree on what is valid.
// See content/lessons/README.md for the format. Plain JavaScript with no imports, so Node
// scripts and the Next.js app can both load it.

/** Teach-slide blocks, in the order the builder looks for them (a slide carries at most one). */
export const BLOCKS = ["model", "check", "quote", "compare", "timeline", "table", "code", "misconception", "cycle", "chart", "numberline", "fraction", "diagram", "sort"];

/** Lesson sections whose items may be a string or { q, a?, mins?, model?, options? }. */
export const ITEM_SECTIONS = ["starter", "practice", "independent", "exit"];

/** Classroom routines for live online lessons (Teams). `short` goes on the slide badge. */
export const ROUTINES = {
  "show-me": { label: "Show me", how: "Write on your mini-whiteboard, then hold it up to the camera on 3." },
  "chat-waterfall": { label: "Chat waterfall", how: "Type your answer in the chat but do not press enter. Everyone presses enter together on 'go'." },
  "teams-poll": { label: "Teams poll", how: "Answer the poll in Teams; the teacher shares the results." },
  "cold-call": { label: "Cold call", how: "Everyone thinks; the teacher then names who answers. No hands up." },
  "think-pair-share": { label: "Think, pair, share", how: "Think alone, talk it through with a partner in a breakout room, then share with the class." },
  "hands-down": { label: "Hands down", how: "No hands up: everyone prepares an answer, the teacher chooses who shares." },
};
export const ROUTINE_IDS = Object.keys(ROUTINES);

/** Sections a lesson's `routines` may set. `hinge` is the check (hinge question) slide. */
export const ROUTINE_SECTIONS = ["hook", "starter", "teach", "hinge", "practice", "independent", "exit"];

/** `ponder`: one open question on the first slide, for pupils who log on early (lessons v3). */
export const HOOK_TYPES = ["ponder", "question", "image-prompt", "story", "puzzle", "odd-one-out"];

/** Subjects where "Bismillah" belongs in the starter (and the start-of-day register). */
export const ISLAMIC_SUBJECTS = ["quran", "islamic-studies", "arabic"];

/** Where an `islamicLink` goes: the foundation at the start, or the Islamic position at the end. */
export const ISLAMIC_LINK_AT = ["start", "end"];

/** Licences a picture from Wikimedia Commons may have (scripts/lessons/pictures.mjs). */
export const PICTURE_LICENCES = ["CC0", "PD", "CC BY", "CC BY-SA"];

// ── Assessment lessons (tests, mocks, quizzes) ───────────────────────────────
// `assessmentMode` on a lesson: "test", "mock" or "quiz" builds it as an assessment (questions
// labelled Question 1, 2… or Section A, B… with marks, an exam-conditions slide before them, no
// answers in the pupils' flow or PDF, and a teacher-only mark scheme at the end of the deck).
// false: never an assessment, even when the title looks like one. Left out: detected from the title.
export const ASSESSMENT_MODES = ["test", "mock", "quiz"];
export const ASSESSMENT_LABEL = { test: "Test", mock: "Mock exam", quiz: "Quiz" };

// Words that make a lesson an assessment, strongest first (a "mock" beats a "test" beats a "quiz").
const ASSESS_TERMS = [
  { re: /\bmocks?\b/gi, mode: "mock" },
  { re: /\bpractice papers?\b/gi, mode: "mock" },
  { re: /\btimed sections?\b/gi, mode: "mock" },
  { re: /\bend[- ]of[- ]year papers?\b/gi, mode: "test" },
  { re: /\b(?:mini-)?tests?\b/gi, mode: "test" },
  { re: /\bassessments?\b/gi, mode: "test" },
  { re: /\bquiz(?:zes)?\b/gi, mode: "quiz" },
  { re: /\bend[- ]of[- ](?:block|unit) checks?\b/gi, mode: "quiz" },
];
// A match is not an assessment when it is about one (feedback, review, preparation…) rather than the
// sitting itself, or is another kind of "test" (a fair test, food tests, a risk assessment…).
const NOT_AFTER = /^\s*(?:point \d+\s*)?[:,]?\s*(?:feedback|review|repair|gap analysis|preparation|prep\b|week\s*:|-week|conditions|and (?:debug|improve|record)|data\b|for\b|technique)/i;
const NOT_BEFORE = /(?:\b(?:fair|food|soil|shake|cress|stretch|growing|measured|physical|flame|starch|chemical|insulation|risk|self|peer|life-cycle|interviews)[- ]?|\b(?:after|from|for|before|under) the (?:[\w'-]+ ){0,2})$/i;
// "Make and test", "Predict, test and improve", "(test and record)": testing something, not a test.
const NOT_BEFORE_TEST = /(?:\band |, |\()$/i;
// "Mock feedback: what the mock tells me": a lesson about an assessment, wherever the word comes again.
const NOT_ANYWHERE = /walking-talking|\b(?:mocks?|tests?|assessments?|quiz(?:zes)?)\s+(?:feedback|review|repair|gap analysis)\b/i;
// A unit counts only when the unit itself is the assessment (e.g. "Summer 2: Mock exams"), not a teaching unit that ends in one.
const UNIT_ONLY = /^(?:(?:autumn|spring|summer)\s*\d\s*:\s*)?(?:year \d+ )?(?:mock exams?|mocks|assessment week|tests?|end[- ]of[- ]year (?:papers?|tests?|assessments?)|practice papers?|timed sections?)\s*$/i;

/**
 * The assessment a lesson's title (or an assessment-only unit) names: { mode, matched, from } or null.
 * `matched` is the words that matched, for checking the detection.
 */
export function detectAssessment(l) {
  const title = String((l && l.title) || "");
  const unit = String((l && l.unit) || "").trim();
  if (UNIT_ONLY.test(unit)) {
    const t = ASSESS_TERMS.find((x) => new RegExp(x.re.source, "i").test(unit));
    return { mode: t ? t.mode : "test", matched: unit, from: "unit" };
  }
  if (NOT_ANYWHERE.test(title)) return null;
  for (const t of ASSESS_TERMS) {
    for (const m of title.matchAll(new RegExp(t.re.source, "gi"))) {
      const before = title.slice(0, m.index);
      const after = title.slice(m.index + m[0].length);
      if (NOT_BEFORE.test(before) || NOT_AFTER.test(after)) continue;
      if (/^(?:mini-)?tests?$/i.test(m[0]) && NOT_BEFORE_TEST.test(before)) continue;
      return { mode: t.mode, matched: m[0], from: "title" };
    }
  }
  return null;
}

/** The lesson's assessment mode ("test", "mock", "quiz") or null: its own `assessmentMode`, else detected. */
export function assessmentModeOf(l) {
  if (!l) return null;
  if (l.assessmentMode === false) return null;
  if (ASSESSMENT_MODES.includes(l.assessmentMode)) return l.assessmentMode;
  const d = detectAssessment(l);
  return d ? d.mode : null;
}

/**
 * Marks for an assessment item, read from its text: "Q1 Rivers (16): …" (the total after the name),
 * "a 30-mark paper" (the total), "(8 marks)" (added up), else the part marks "(a) … (1) (b) … (3)" added up. Null when none.
 */
export function itemMarks(x) {
  if (x && typeof x === "object" && Number.isInteger(x.marks)) return x.marks;
  const q = itemQ(x);
  const head = q.match(/^[^:()]{0,60}\((\d{1,3})(?:\s*marks?)?\)\s*:/i);
  if (head) return Number(head[1]);
  // "a 30-mark paper" names the total; "Section A 20 marks, Section B 10 marks" adds up.
  const total = [...q.matchAll(/(\d{1,3})-mark\b/gi)].map((m) => Number(m[1]));
  if (total.length) return Math.max(...total);
  const named = [...q.matchAll(/(\d{1,3})\s*marks?\b/gi)].map((m) => Number(m[1]));
  if (named.length) return named.reduce((a, b) => a + b, 0);
  const parts = [...q.matchAll(/\((\d{1,2})\)/g)].map((m) => Number(m[1]));
  if (parts.length >= 2) return parts.reduce((a, b) => a + b, 0);
  return null;
}

/**
 * Labels for an assessment's questions: the item's own "Section B…" or "Q2…", else "Section A, B, C"
 * for a mock and "Question 1, 2, 3" otherwise. Returns [{ label, short, rest }] (rest: the text without its label).
 */
export function assessmentLabels(items, mode) {
  // "Q1 (2 marks): …" leaves "(2 marks): …" after the label: the marks are shown on their own.
  const unmark = (t) => t.replace(/^\(\d{1,3}(?:\s*marks?)?\)\s*[:.\-–]?\s*/i, "").replace(/^([^:()]{1,40}?)\s*\(\d{1,3}(?:\s*marks?)?\)\s*:/i, "$1:");
  const own = (q) => /^(?:Section\s+[A-H]\b|(?:Q|Question)\s*\d{1,2}\b)/i.test(q.trim());
  const someOwn = (items || []).some((x) => own(itemQ(x)));
  const anyMarks = (items || []).some((x) => itemMarks(x) != null);
  let section = 0;
  return (items || []).map((x, i) => {
    const q = itemQ(x).trim();
    const sec = q.match(/^Section\s+([A-H])\b\s*[:.\-–]?\s*/i);
    if (sec) return { label: `Section ${sec[1].toUpperCase()}`, short: sec[1].toUpperCase(), rest: unmark(q.slice(sec[0].length)) };
    const qn = q.match(/^(?:Q|Question)\s*(\d{1,2})\b\s*[:.\-–]?\s*/i);
    if (qn) return { label: `Question ${qn[1]}`, short: qn[1], rest: unmark(q.slice(qn[0].length)) };
    // Tasks written for the usual lesson often start with their level ("Core: …"); an assessment does not use levels.
    const rest = q.replace(/^(core|extend|extension|stretch|challenge|bronze|silver|gold)\s*(?:\([^)]*\))?\s*[:\-–]\s*/i, "").replace(/^check\s*:\s*/i, "");
    // Beside numbered questions ("Q1 (2 marks): …"), an unnumbered item is a warm-up or a follow-up task.
    if (someOwn) return /^warm-?up/i.test(q) ? { label: "Warm-up", short: "W", rest: q.replace(/^warm-?up\s*(?:\([^)]*\))?\s*[:\-–]?\s*/i, "") } : { label: "Extra", short: "+", rest };
    if (mode === "mock" && (items || []).length > 1) {
      // A follow-on task after the paper ("Extend: self-mark", or an unmarked task beside marked ones) is not a new section.
      if (i > 0 && (/^(extend|extension|stretch|challenge)\b/i.test(q) || (anyMarks && itemMarks(x) == null))) return { label: "Extra", short: "+", rest };
      const letter = "ABCDEFGH"[section++];
      return { label: `Section ${letter}`, short: letter, rest };
    }
    return { label: `Question ${i + 1}`, short: String(i + 1), rest };
  });
}

/** Default minutes per task phase in a 50-minute lesson; scaled for shorter lessons. */
const PHASE_MINS_50 = { starter: 5, practice: 8, independent: 12, exit: 5 };

export const itemQ = (x) => (x && typeof x === "object" ? String(x.q ?? "") : String(x ?? ""));
export const itemA = (x) => (x && typeof x === "object" && typeof x.a === "string" && x.a.trim() ? x.a : null);
export const itemMins = (x) => (x && typeof x === "object" && Number.isInteger(x.mins) ? x.mins : null);
/** The teacher's worked model for an item ("I do"), or null. */
export const itemModel = (x) => (x && typeof x === "object" && typeof x.model === "string" && x.model.trim() ? x.model : null);
/** Poll options for an item: its own `options`, else "A) … B) …" written into the question. Null when it has none. */
export function itemOptions(x) {
  if (x && typeof x === "object" && Array.isArray(x.options) && x.options.length >= 2) return { q: itemQ(x), options: x.options.map(String) };
  const q = itemQ(x);
  const m = q.match(/^(.*?)\s*\(?A[).:]\s+(.+?)\s+\(?B[).:]\s+(.+?)(?:\s+\(?C[).:]\s+(.+?))?(?:\s+\(?D[).:]\s+(.+?))?\s*$/s);
  if (!m || !m[1].trim()) return null;
  return { q: m[1].trim(), options: m.slice(2).filter(Boolean).map((o) => o.trim().replace(/[;,]$/, "")) };
}
export const hasAnswers = (list) => Array.isArray(list) && list.some((x) => itemA(x));

/** Minutes for a task slide: the items' own `mins` added up, or the phase default for the lesson length. */
export function phaseMinutes(phase, items, duration) {
  const own = (items || []).map(itemMins).filter((m) => m != null);
  if (own.length) return own.reduce((a, b) => a + b, 0);
  const base = PHASE_MINS_50[phase];
  if (!base) return null;
  return Math.max(2, Math.round((base * (duration || 50)) / 50));
}

/** The routine for a section: the lesson's choice, else a sensible default for live online lessons. */
export function routineFor(lesson, section, hint) {
  const set = lesson && lesson.routines && typeof lesson.routines === "object" ? lesson.routines[section] : null;
  if (set && ROUTINES[set]) return set;
  switch (section) {
    case "starter":
      return "show-me";
    case "hinge":
      // Lessons v3: polls, not cold calls. A hinge question has its options, so it is a Teams poll.
      return "teams-poll";
    case "practice":
      return "show-me";
    case "independent":
      return null;
    case "exit":
      return "chat-waterfall";
    case "hook":
      return hint === "puzzle" || hint === "odd-one-out" ? "show-me" : "chat-waterfall";
    default:
      return null;
  }
}

// ── Checks ──────────────────────────────────────────────────────────────────
const str = (v) => typeof v === "string" && v.trim().length > 0;
const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every((x) => typeof x === "string" && x.trim());
const num = (v) => typeof v === "number" && Number.isFinite(v);

/** Problems with one item of starter / practice / independent / exit, in plain English. */
export function itemProblem(x) {
  if (typeof x === "string") return x.trim() ? null : "an item is empty";
  if (!x || typeof x !== "object" || Array.isArray(x)) return "an item must be text or { q, a, mins }";
  if (!str(x.q)) return "an item has no question (q)";
  if (x.a != null && typeof x.a !== "string") return "an answer (a) must be text";
  if (x.mins != null && (!Number.isInteger(x.mins) || x.mins < 1 || x.mins > 30)) return "mins must be a whole number from 1 to 30";
  if (x.model != null && !str(x.model)) return "a model (the teacher's worked answer) must be text";
  if (x.options != null && (!strs(x.options, 2) || x.options.length > 4)) return "poll options: 2 to 4 short lines";
  if (x.marks != null && (!Number.isInteger(x.marks) || x.marks < 1 || x.marks > 200)) return "marks must be a whole number from 1 to 200";
  const extra = Object.keys(x).filter((k) => !["q", "a", "mins", "model", "options", "marks"].includes(k));
  if (extra.length) return `an item has unknown field(s): ${extra.join(", ")}`;
  return null;
}

/** Problems with a teach slide's block. Returns { kind, problems[] } (kind null when there is no block). */
export function blockProblems(t) {
  const kinds = BLOCKS.filter((k) => t && t[k] != null);
  const p = [];
  if (kinds.length > 1) p.push(`has more than one block (${kinds.join(", ")})`);
  const k = kinds[0];
  if (!k) return { kind: null, problems: p };
  const v = t[k];
  switch (k) {
    case "model":
      if (!v.problem || !strs(v.steps, 2) || v.steps.length > 6) p.push("model needs problem and 2-6 steps");
      break;
    case "check":
      if (!v.q || !strs(v.options, 3) || v.options.length > 4 || !Number.isInteger(v.answer) || v.answer < 0 || v.answer >= v.options.length) p.push("check needs q, 3-4 options and a valid answer index");
      if (!v.why) p.push("check needs why (explains the answer and the trap in the distractors)");
      break;
    case "quote":
      if (!v.text) p.push("quote needs text");
      break;
    case "compare":
      if (!v.left?.title || !v.right?.title || !strs(v.left.points) || !strs(v.right.points)) p.push("compare needs left/right {title, points[]}");
      break;
    case "timeline":
    case "cycle":
      if (!Array.isArray(v) || v.length < 3 || v.length > 6) p.push(`${k} needs 3-6 items`);
      else if (k === "timeline" && !v.every((e) => e && e.label && e.text)) p.push("timeline items need label and text");
      else if (k === "cycle" && !strs(v, 3)) p.push("cycle items are strings");
      break;
    case "table":
      if (!strs(v.head, 2) || !Array.isArray(v.rows) || !v.rows.length || v.rows.length > 8 || !v.rows.every((r) => Array.isArray(r) && r.length === v.head.length)) p.push("table needs head and 1-8 rows of the same width");
      break;
    case "code":
      if (!v.text || String(v.text).split("\n").length > 16) p.push("code needs text of at most 16 lines");
      break;
    case "misconception":
      if (!v.wrong || !v.right) p.push("misconception needs wrong and right");
      break;
    case "chart": {
      if (!["bar", "line", "pie"].includes(v.kind)) p.push('chart kind must be "bar", "line" or "pie"');
      if (!strs(v.labels, 2) || v.labels.length > 8) p.push("chart needs 2-8 labels");
      if (!Array.isArray(v.values) || v.values.length !== (v.labels || []).length || !v.values.every(num)) p.push("chart needs one number in values for each label");
      else if (v.kind === "pie" && (v.values.some((x) => x < 0) || !v.values.some((x) => x > 0))) p.push("a pie chart needs values of 0 or more (at least one above 0)");
      if (v.title != null && !str(v.title)) p.push("chart title must be text");
      if (v.unit != null && !str(v.unit)) p.push("chart unit must be text");
      break;
    }
    case "numberline": {
      if (!num(v.min) || !num(v.max) || !num(v.step) || v.step <= 0 || v.max <= v.min) p.push("numberline needs min < max and a step above 0");
      else {
        const ticks = (v.max - v.min) / v.step;
        if (ticks > 20 || Math.abs(ticks - Math.round(ticks)) > 1e-6) p.push("numberline: (max - min) / step must be a whole number of at most 20");
      }
      if (v.marks != null && (!Array.isArray(v.marks) || v.marks.length > 6 || !v.marks.every((m) => m && num(m.at) && m.at >= v.min && m.at <= v.max && (m.label == null || typeof m.label === "string")))) p.push("numberline marks: up to 6 of { at, label } with at between min and max");
      break;
    }
    case "fraction": {
      const list = Array.isArray(v) ? v : [v];
      if (!list.length || list.length > 4) p.push("fraction is one bar { parts, shaded } or a list of 1-4 bars");
      else if (!list.every((f) => f && Number.isInteger(f.parts) && f.parts >= 1 && f.parts <= 24 && Number.isInteger(f.shaded) && f.shaded >= 0 && f.shaded <= f.parts && (f.label == null || typeof f.label === "string"))) p.push("fraction bars need whole numbers: parts 1-24 and shaded 0 to parts");
      break;
    }
    case "diagram":
      if (!str(v.centre) || !strs(v.items, 3) || v.items.length > 8) p.push("diagram needs a centre and 3-8 items");
      break;
    case "sort":
      if (!strs(v.columns, 2) || v.columns.length > 4) p.push("sort needs 2-4 columns");
      if (!strs(v.cards, 4) || v.cards.length > 12) p.push("sort needs 4-12 cards");
      if (v.answer != null && (!Array.isArray(v.answer) || v.answer.length !== (v.cards || []).length || !v.answer.every((i) => Number.isInteger(i) && i >= 0 && i < (v.columns || []).length))) p.push("sort answer: one column number (0 = first column) for each card");
      break;
  }
  return { kind: k, problems: p };
}

/** Problems with a lesson's optional extras (answers, minutes, hook, routines, resources). */
export function extrasProblems(l) {
  const p = [];
  for (const k of ITEM_SECTIONS) {
    if (!Array.isArray(l[k])) continue;
    l[k].forEach((x, i) => {
      const e = itemProblem(x);
      if (e) p.push(`${k} ${i + 1}: ${e}`);
    });
  }
  (Array.isArray(l.teach) ? l.teach : []).forEach((t, i) => {
    if (t && t.routine != null && !ROUTINES[t.routine]) p.push(`teach slide ${i + 1}: routine must be one of ${ROUTINE_IDS.join(", ")}`);
  });
  if (l.hook != null) {
    const h = l.hook;
    if (!h || typeof h !== "object" || !HOOK_TYPES.includes(h.type)) p.push(`hook type must be one of ${HOOK_TYPES.join(", ")}`);
    if (!h || !str(h.text) || h.text.length > 240) p.push("hook needs text (at most 240 characters)");
    if (h && h.options != null && (!strs(h.options, 2) || h.options.length > 5)) p.push("hook options: 2-5 short lines");
    if (h && h.type === "odd-one-out" && !strs(h.options, 3)) p.push("an odd-one-out hook needs 3-5 options");
    if (h && h.a != null && !str(h.a)) p.push("hook a (the answer or what to draw out) must be text");
  }
  if (l.routines != null) {
    if (typeof l.routines !== "object" || Array.isArray(l.routines)) p.push("routines must be an object, e.g. { \"starter\": \"show-me\" }");
    else
      for (const [k, v] of Object.entries(l.routines)) {
        if (!ROUTINE_SECTIONS.includes(k)) p.push(`routines: unknown section "${k}" (use ${ROUTINE_SECTIONS.join(", ")})`);
        if (!ROUTINES[v]) p.push(`routines.${k}: "${v}" is not one of ${ROUTINE_IDS.join(", ")}`);
      }
  }
  if (l.resources != null && (!strs(l.resources) || l.resources.length > 10)) p.push("resources: 1-10 lines of text");
  if (l.assessmentMode != null && l.assessmentMode !== false && !ASSESSMENT_MODES.includes(l.assessmentMode)) p.push(`assessmentMode must be ${ASSESSMENT_MODES.map((m) => `"${m}"`).join(", ")} or false (not an assessment)`);
  if (l.islamicLink != null) {
    const x = l.islamicLink;
    if (!x || typeof x !== "object" || !str(x.text)) p.push("islamicLink needs text");
    else if (x.text.length > 600) p.push("islamicLink text: at most 600 characters");
    if (x && !ISLAMIC_LINK_AT.includes(x.at)) p.push('islamicLink at must be "start" or "end"');
  }
  if (l.pictures != null) {
    if (!Array.isArray(l.pictures) || l.pictures.length > 8) p.push("pictures: a list of up to 8");
    else
      l.pictures.forEach((x, i) => {
        const w = `picture ${i + 1}`;
        if (!x || typeof x !== "object" || !str(x.find)) return p.push(`${w}: needs find (what to search Wikimedia Commons for)`);
        if (!str(x.alt)) p.push(`${w}: needs alt (what it shows)`);
        const m = /^teach:(\d+)$/.exec(String(x.for || ""));
        if (!(x.for === "hook" || x.for === "keywords" || (m && Number(m[1]) >= 1 && Number(m[1]) <= (Array.isArray(l.teach) ? l.teach.length : 7)))) p.push(`${w}: for must be "hook", "keywords" or "teach:N" (a teach slide number)`);
        for (const k of ["file", "credit", "licence"]) if (x[k] != null && !str(x[k])) p.push(`${w}: ${k} must be text`);
        const extra = Object.keys(x).filter((k) => !["find", "alt", "for", "file", "credit", "licence"].includes(k));
        if (extra.length) p.push(`${w}: unknown field(s): ${extra.join(", ")}`);
      });
  }
  return p;
}

const words = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/^\s*(all|most|some)\s*[:\-–]\s*/, "")
    .replace(/^(to|i can|we can|pupils can)\s+/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
/** True when a success criterion just says the objective again (instead of a step towards it). */
export function repeatsObjective(criterion, objective) {
  const A = new Set(words(criterion));
  const B = new Set(words(objective));
  if (!A.size || !B.size) return false;
  const both = [...A].filter((w) => B.has(w)).length;
  return both / Math.min(A.size, B.size) >= 0.85 && Math.abs(A.size - B.size) <= 2;
}

/**
 * Advice on a lesson (lessons v3), shown by the validator and the portal editor. Never blocks a
 * build, so older lessons still build. `subject` is the subject slug; `duration` the lesson length.
 */
export function lessonWarnings(l, subject, duration) {
  const w = [];
  const objs = Array.isArray(l.objectives) ? l.objectives : [];
  if (objs.length > 1) w.push(`has ${objs.length} objectives: give one high-level objective (the destination)`);
  const sc = Array.isArray(l.successCriteria) ? l.successCriteria : [];
  if (sc.length > 3) w.push(`has ${sc.length} success criteria: at most 3 (All, Most, Some)`);
  sc.forEach((c, i) => {
    if (objs.some((o) => repeatsObjective(c, o))) w.push(`success criterion ${i + 1} repeats the objective: make it a checkable step towards it`);
  });
  const routines = [...Object.values(l.routines && typeof l.routines === "object" ? l.routines : {}), ...(Array.isArray(l.teach) ? l.teach.map((t) => t && t.routine) : [])];
  if (routines.includes("cold-call")) w.push("uses cold call: use a Teams poll (or show me) instead");
  if (subject && !ISLAMIC_SUBJECTS.includes(subject) && (Array.isArray(l.starter) ? l.starter : []).some((x) => /bismillah/i.test(itemQ(x)))) w.push('says "Bismillah" in the starter: keep it to Qur\'an, Islamic Studies and Arabic');
  const mins = ITEM_SECTIONS.flatMap((k) => (Array.isArray(l[k]) ? l[k] : []).map(itemMins)).filter((m) => m != null);
  const total = mins.reduce((a, b) => a + b, 0);
  const len = duration || l.duration;
  if (len && total > len - 3) w.push(`item minutes add up to ${total}, more than the ${len}-minute lesson less 3 minutes slack`);
  return w;
}
