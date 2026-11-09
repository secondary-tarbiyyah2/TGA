// The lesson format's optional extras, shared by the slide builder (scripts/lessons), its
// validator, the curriculum sync (scripts/curriculum/lib.mjs) and the portal's lesson editor
// (src/components/learn/curriculum/LessonEditor.tsx), so all four agree on what is valid.
// See content/lessons/README.md for the format. Plain JavaScript with no imports, so Node
// scripts and the Next.js app can both load it.

/** Teach-slide blocks, in the order the builder looks for them (a slide carries at most one). */
export const BLOCKS = ["model", "check", "quote", "compare", "timeline", "table", "code", "misconception", "cycle", "chart", "numberline", "fraction", "diagram", "sort"];

/** Lesson sections whose items may be a string or { q, a?, mins? }. */
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

export const HOOK_TYPES = ["question", "image-prompt", "story", "puzzle", "odd-one-out"];

/** Default minutes per task phase in a 50-minute lesson; scaled for shorter lessons. */
const PHASE_MINS_50 = { starter: 5, practice: 8, independent: 12, exit: 5 };

export const itemQ = (x) => (x && typeof x === "object" ? String(x.q ?? "") : String(x ?? ""));
export const itemA = (x) => (x && typeof x === "object" && typeof x.a === "string" && x.a.trim() ? x.a : null);
export const itemMins = (x) => (x && typeof x === "object" && Number.isInteger(x.mins) ? x.mins : null);
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
      return hint === "poll" ? "teams-poll" : "show-me";
    case "practice":
      return "cold-call";
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
  const extra = Object.keys(x).filter((k) => !["q", "a", "mins"].includes(k));
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
  return p;
}
