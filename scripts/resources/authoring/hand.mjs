// Shared helpers for writing resource items by hand or by script (see README.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/** The repo root (this file sits in scripts/resources/authoring). */
export const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const TERM = process.env.TERM_ID || "spring-1";
export const reg = JSON.parse(fs.readFileSync(path.join(WT, `content/resources/${TERM}.json`), "utf8")).resources;
const lessonFiles = new Map();
export const lessonsOf = (s, y) => {
  const k = `${s}/${y}`;
  if (!lessonFiles.has(k)) lessonFiles.set(k, JSON.parse(fs.readFileSync(path.join(WT, "content/lessons", s, `${y}.json`), "utf8")));
  return lessonFiles.get(k);
};
export const lesson = (s, y, n) => lessonsOf(s, y).lessons.find((l) => l.n === n);
export const gen = (s, y) => reg.filter((e) => e.subjectSlug === s && (!y || e.year === y) && e.source === "generated");
export function find(subject, year, pred) {
  const list = gen(subject, year).filter(pred);
  if (list.length !== 1) throw new Error(`${subject}/${year}: ${list.length} matches: ${list.map((e) => e.id).join(", ")}`);
  return list[0];
}
export const itemPath = (e) => path.join(WT, "content/resources/items", e.subjectSlug, e.year, `${e.id}.json`);
export const readItem = (e) => {
  try {
    return JSON.parse(fs.readFileSync(itemPath(e), "utf8"));
  } catch {
    return null;
  }
};
/** Write an item for a register entry (or a predicate). content overrides the defaults. */
export function put(subject, year, pred, content) {
  const e = typeof pred === "object" && pred.id ? pred : find(subject, year, pred);
  const prev = readItem(e) || {};
  const f = lessonsOf(e.subjectSlug, e.year);
  const item = {
    id: e.id,
    title: content.title || prev.title || e.title,
    type: content.type || prev.type || e.type,
    subject: e.subject,
    subjectSlug: e.subjectSlug,
    year: e.year,
    ...((f.examShort || f.boardShort) && /^y1[01]$/.test(e.year) ? { board: f.examShort || f.boardShort } : {}),
    unit: e.units[0],
    lessons: e.lessons.map((l) => l.n),
    source: `Written for ${e.subjectSlug}/${e.year} lesson${e.lessons.length > 1 ? "s" : ""} ${e.lessons.map((l) => l.n).join(", ")} (${e.wording})`,
    ...content,
  };
  fs.mkdirSync(path.dirname(itemPath(e)), { recursive: true });
  fs.writeFileSync(itemPath(e), `${JSON.stringify(item, null, 1)}\n`);
  return e.id;
}
export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const AR = /[؀-ۿ]/;
// Lesson pieces
export const qOf = (x) => (typeof x === "string" ? x : x.q);
export function qs(l, secs, marks) {
  const out = [];
  for (const s of secs)
    for (const x of l[s] || []) {
      if (typeof x === "string") continue;
      let q = clean(x.q).replace(/^(i do|we do|you do|model)\s*:\s*/i, "").replace(/\bin the chat\b/gi, "here");
      if (/^back to our ponder/i.test(q)) q = q.replace(/^back to our ponder:\s*/i, "Think again: ");
      const o = { q, ...(x.a ? { a: clean(x.a) } : {}) };
      if (x.options) o.options = x.options.map(clean);
      if (marks) o.marks = x.options ? 1 : Math.min(4, Math.max(1, Math.round(clean(x.a).split(" ").length / 8)));
      out.push(o);
    }
  return out;
}
export const hingesOf = (l, marks) =>
  (l.teach || []).filter((t) => t.check).map((t) => ({ q: clean(t.check.q), options: t.check.options.map(clean), a: `${"ABCD"[t.check.answer]}) ${clean(t.check.options[t.check.answer])}${t.check.why ? `. ${clean(t.check.why)}` : ""}`, ...(marks ? { marks: 1 } : {}) }));
export const kwOf = (l) => (l.keywords || []).map((k) => ({ term: clean(k.term), def: clean(k.def) }));

export const isMeaning = (t) => /translation|meaning/i.test((t.table?.head || []).join(" "));
export const ROUTINE = /^(listen and repeat|listening turns|read with me|reading turns|quick check|mics|sign-off turns)/i;

/** A lesson chart ({kind: bar|line|pie, title, labels, values, unit}) as a drawn grid block. */
export function chartBlock(c) {
  const labels = (c.labels || []).map(clean);
  const values = c.values.map(Number);
  if (c.kind === "pie") return { grid: { kind: "pie", cols: 1, charts: [{ title: clean(c.title), data: labels.map((l, i) => [l, values[i]]) }] } };
  const max = Math.max(...values, 0);
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  const yStep = steps.find((s) => max / s <= 10) || 10000;
  const yMax = Math.max(yStep, Math.ceil(max / yStep) * yStep);
  return { grid: { kind: "barchart", cats: labels, yMax, yStep, yLabel: clean(c.unit || ""), xLabel: clean(c.title), values, line: c.kind === "line" } };
}

/** The lesson's teaching as printable blocks: rules as panels, the lesson's tables, Qur'an quotes exactly. */
export function teachBlocks(l, { skipQuotes = false, keepMeaning = false } = {}) {
  const out = [];
  let panels = [];
  const flush = () => {
    if (panels.length) out.push({ panels, cols: panels.length === 1 ? 1 : 2 });
    panels = [];
  };
  for (const t of l.teach || []) {
    if (t.check || t.cycle || ROUTINE.test(t.heading || "")) continue;
    const head = clean(t.heading);
    const bullets = (t.bullets || []).map(clean).filter((b) => b && !/^(mics|listen first|follow each word|camera)/i.test(b));
    if (t.table && (keepMeaning || !isMeaning(t))) {
      flush();
      out.push({ h: head }, { table: { head: t.table.head.map(clean), rows: t.table.rows.map((r) => r.map(clean)) } });
      if (bullets.length) out.push({ bullets });
      continue;
    }
    if (t.chart && Array.isArray(t.chart.values) && t.chart.values.length) {
      flush();
      out.push({ h: head }, chartBlock(t.chart));
      if (bullets.length) out.push({ bullets });
      continue;
    }
    if (t.quote && !skipQuotes) {
      flush();
      const src = clean(t.quote.source || "");
      if (AR.test(t.quote.text)) out.push({ h: head }, { arabic: { text: String(t.quote.text).trim(), ref: src, quran: /surah|surat|\d+:\d+/i.test(src) } });
      else out.push({ h: head }, { passage: { title: src, paras: String(t.quote.text).split(/\n+/).map(clean) } });
      continue;
    }
    if (t.misconception) {
      flush();
      out.push({ h: head || "Mistakes to avoid" }, { table: { head: ["Not this", "This"], rows: [[clean(t.misconception.wrong), clean(t.misconception.right)]] } });
      continue;
    }
    if (t.compare) {
      flush();
      const c = t.compare;
      out.push({ h: head }, { table: { head: [clean(c.left.title), clean(c.right.title)], rows: Array.from({ length: Math.max(c.left.points.length, c.right.points.length) }, (_, i) => [clean(c.left.points[i] || ""), clean(c.right.points[i] || "")]) } });
      continue;
    }
    if (t.model && (t.model.steps || t.model.problem)) {
      flush();
      out.push({ h: head }, { model: { title: clean(t.model.problem || ""), parts: [...(t.model.steps || []).map((s) => ({ text: clean(s) })), ...(t.model.answer ? [{ label: "Why it works", text: clean(t.model.answer) }] : [])] } });
      continue;
    }
    if (t.diagram && t.diagram.items) {
      if (bullets.length) panels.push({ title: head, points: bullets });
      panels.push({ title: clean(t.diagram.centre || head), points: t.diagram.items.map((x) => clean(typeof x === "string" ? x : x.text || x.label)) });
      continue;
    }
    if (t.timeline) {
      flush();
      out.push({ h: head }, { timeline: t.timeline.map((x) => ({ label: clean(x.label), text: clean(x.text) })) });
      continue;
    }
    if (t.sort) {
      flush();
      out.push({ h: head }, { cards: t.sort.cards.map(clean), cols: 3, title: `Sort into: ${t.sort.columns.map(clean).join(" / ")}`, task: `sort them into the columns: ${t.sort.columns.map(clean).join(", ")}.`, ...(Array.isArray(t.sort.answer) ? { answer: t.sort.columns.map((c, ci) => `${clean(c)}: ${t.sort.cards.filter((_, i) => t.sort.answer[i] === ci).map(clean).join("; ")}`).join(". ") } : {}) });
      continue;
    }
    if (bullets.length) panels.push({ title: head, points: bullets });
  }
  flush();
  return out;
}

export const qBlocks = (l, early) => {
  const out = [];
  const p = qs(l, ["practice"]);
  const i = qs(l, ["independent"]);
  const ex = [...hingesOf(l), ...qs(l, ["exit"])];
  if (p.length) out.push({ h: early ? "Together" : "We do" }, { questions: p });
  if (i.length) out.push({ h: early ? "My turn" : "You do" }, { questions: i });
  if (ex.length) out.push({ h: "Check" }, { questions: ex });
  return out;
};
