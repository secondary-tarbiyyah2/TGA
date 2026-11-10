// Writes the first draft of each "to make" resource as data, from the lessons that use it.
//   node scripts/resources/seed.mjs --term=spring-1 [--subject=mathematics[,english]] [--overwrite] [--dry]
// One file per resource: content/resources/items/<subject>/<year>/<id>.json (format: BRIEF-RESOURCES.md).
// Everything comes from the lesson itself, so answers always match the lesson: its questions and
// answers (starter, guided, independent, exit, hinge polls), key words, worked models, quotes and
// texts (Arabic and Qur'an exactly as written), tables, timelines and card sorts. Printable grids are
// read from the resource's name (number line 0 to 20, place value chart to millions, ...).
// Existing item files are never overwritten unless --overwrite: hand edits are kept.
// After seeding, read the PDFs and improve the items by hand where the lesson gave too little.
import fs from "node:fs";
import path from "node:path";
import { RES_DIR, ITEMS_DIR, clean, readJson, loadLessonFiles, yearNum } from "./lib.mjs";
import { itemQ, itemA, itemModel, itemOptions, itemMins } from "../../src/lib/learn/lessonSchema.mjs";

const args = process.argv.slice(2);
const term = (args.find((a) => a.startsWith("--term=")) || "--term=spring-1").slice(7);
const subjects = (args.find((a) => a.startsWith("--subject=")) || "").slice(10).split(",").filter(Boolean);
const overwrite = args.includes("--overwrite");
const dry = args.includes("--dry");

const files = loadLessonFiles();
const fileBy = new Map(files.map((f) => [`${f.slug}/${f.year}`, f]));
const lessonOf = (s, y, n) => (fileBy.get(`${s}/${y}`)?.data.lessons || []).find((l) => l.n === n);
const unitLessons = (s, y, unit) => (fileBy.get(`${s}/${y}`)?.data.lessons || []).filter((l) => l.unit === unit).sort((a, b) => a.n - b.n);

// ── Text helpers ─────────────────────────────────────────────────────────────────────────────
const tidyQ = (q) =>
  clean(q)
    .replace(/^(warm-up|model|we do|you do|core|extend|stretch|support|challenge|task \d+)\s*(\((teacher models first|modelled|the teacher models it first)\))?\s*:\s*/i, (m, a) => (/^(core|extend|stretch|support|challenge)$/i.test(a) ? `${a[0].toUpperCase()}${a.slice(1).toLowerCase()}: ` : ""))
    .replace(/\s*\((teacher models first|modelled first|the teacher models it first)\)\s*/gi, " ")
    .replace(/\bin the chat\b/gi, "here")
    .replace(/\s+/g, " ")
    .trim();
const marksIn = (q) => {
  const m = /\((\d{1,2}) marks?\)|\[(\d{1,2}) marks?\]|\b(\d{1,2})[- ]mark\b/i.exec(q);
  return m ? Number(m[1] || m[2] || m[3]) : null;
};
const stripMarks = (q) => q.replace(/^Q\d+\s*\((\d{1,2}) marks?\)\s*:\s*/i, "").replace(/\s*\((\d{1,2}) marks?\)\s*/i, " ").trim();
/** Marks for a question with none written: 1 for a poll or a one-word answer, more for longer answers. */
function guessMarks(q, a, opts) {
  if (opts) return 1;
  const words = clean(a).split(/\s+/).filter(Boolean).length;
  if (/\b(evaluate|assess|discuss|to what extent)\b/i.test(q)) return 6;
  if (/\b(explain|describe|justify|why|compare|analyse)\b/i.test(q)) return words > 30 ? 4 : words > 14 ? 3 : 2;
  if (/\bm1\b|\ba1\b/i.test(a)) return Math.max(2, (a.match(/\b[MAB]\d\b/g) || []).length);
  return words <= 6 ? 1 : words <= 18 ? 2 : 3;
}
/** A lesson item as a resource question (answer, model, options, marks). */
function toQ(x, withMarks) {
  const raw = itemQ(x);
  if (!clean(raw)) return null;
  const poll = itemOptions(x);
  let q = tidyQ(poll ? poll.q : raw);
  const a = itemA(x) || "";
  const out = { q: stripMarks(q), ...(a ? { a: clean(a) } : {}) };
  if (poll) out.options = poll.options.map(clean);
  const model = itemModel(x);
  if (model) out.model = clean(model);
  if (withMarks) out.marks = marksIn(raw) ?? guessMarks(q, a, poll);
  if (/response box|forms long-answer|paragraph|write (a|two|three) /i.test(q)) out.lines = Math.max(6, out.lines || 0);
  return out;
}
const uniqBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const qsFrom = (lessons, sections, withMarks) =>
  uniqBy(
    lessons.flatMap((l) => sections.flatMap((s) => (l[s] || []).map((x) => toQ(x, withMarks)))).filter(Boolean),
    (q) => q.q.toLowerCase(),
  );
const hinges = (lessons, withMarks) =>
  lessons.flatMap((l) => (l.teach || []).filter((t) => t.check).map((t) => ({ q: clean(t.check.q), options: t.check.options.map(clean), a: `${"ABCD"[t.check.answer]}) ${clean(t.check.options[t.check.answer])}${t.check.why ? `. ${clean(t.check.why)}` : ""}`, ...(withMarks ? { marks: 1 } : {}) })));
const keywordsOf = (lessons, max = 16) => uniqBy(lessons.flatMap((l) => l.keywords || []).filter((k) => k && k.term && k.def), (k) => clean(k.term).toLowerCase()).slice(0, max).map((k) => ({ term: clean(k.term), def: clean(k.def) }));
const quotesOf = (lessons) => uniqBy(lessons.flatMap((l) => (l.teach || []).filter((t) => t.quote).map((t) => ({ text: String(t.quote.text).trim(), source: clean(t.quote.source || t.heading) }))), (q) => q.text);
const modelsOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => t.model).map((t) => ({ title: clean(t.heading), ...t.model })));
const tablesOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => t.table).map((t) => ({ heading: clean(t.heading), ...t.table })));
const sortsOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => t.sort).map((t) => ({ heading: clean(t.heading), ...t.sort })));
const timelinesOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => Array.isArray(t.timeline)).map((t) => ({ heading: clean(t.heading), items: t.timeline })));
const comparesOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => t.compare).map((t) => ({ heading: clean(t.heading), ...t.compare })));
const misconceptionsOf = (lessons) => lessons.flatMap((l) => (l.teach || []).filter((t) => t.misconception).map((t) => t.misconception));
const AR = /[\u0600-\u06FF]/;
const isQuranic = (s) => /surat|surah|qur'an|ayah|ayat|\d+:\d+/i.test(s);

function sortCards(s) {
  const cards = s.cards.map(clean);
  const answer = Array.isArray(s.answer) ? s.columns.map((c, ci) => `${clean(c)}: ${cards.filter((_, i) => s.answer[i] === ci).join("; ") || "none"}`).join(". ") : null;
  return { cards, cols: cards.length > 8 ? 4 : 3, title: `Sort into: ${s.columns.map(clean).join(" / ")}`, task: `sort them into the columns: ${s.columns.map(clean).join(", ")}.`, ...(answer ? { answer } : {}) };
}

// ── Grids from the resource's name ──────────────────────────────────────────────────────────
function gridFromTitle(title, year) {
  const t = title.toLowerCase();
  const y = yearNum(year);
  const out = [];
  let m;
  if ((m = /number line (?:from )?(-?\d+) to (-?\d+)/.exec(t))) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    const span = max - min;
    const step = span <= 30 ? 1 : span <= 100 ? 1 : span / 20;
    out.push({ h: `Number lines ${min} to ${max}` }, { grid: { kind: "numberline", min, max, step, labelEvery: span <= 30 ? 1 : 10, count: span <= 30 ? 4 : 3 } }, { text: "Cut out each number line, or use it on a drawing tablet." });
    if (/100 square|hundred square/.test(t)) out.push({ h: "100 square" }, { grid: { kind: "hundred" } });
    return out;
  }
  if (/number line strips?|paper number line|number line\b/.test(t)) return [{ h: "Number lines" }, { grid: { kind: "numberline", min: 0, max: 20, count: 3 } }, { h: "Blank number lines to label" }, { grid: { kind: "numberline", min: 0, max: 10, blank: true, count: 3 } }];
  if (/100 square|hundred square/.test(t)) return [{ h: "100 square" }, { grid: { kind: "hundred" } }, { h: "Blank 100 square" }, { grid: { kind: "hundred", blank: true } }];
  if (/place value chart/.test(t)) {
    const cols = /ten millions/.test(t) ? ["TM", "M", "HTh", "TTh", "Th", "H", "T", "O"] : /millions/.test(t) ? ["M", "HTh", "TTh", "Th", "H", "T", "O"] : /hundred thousands/.test(t) ? ["HTh", "TTh", "Th", "H", "T", "O"] : /thousands?/.test(t) || y >= 4 ? ["Th", "H", "T", "O"] : ["H", "T", "O"];
    const dec = /decimal|tenths|hundredths/.test(t) ? ["Tths", "Hths"] : [];
    return [{ grid: { kind: "placevalue", cols: [...cols, ...dec], rows: 5, decimals: dec.length } }, { text: "Key: " + [...cols, ...dec].map((c) => `${c} = ${{ TM: "ten millions", M: "millions", HTh: "hundred thousands", TTh: "ten thousands", Th: "thousands", H: "hundreds", T: "tens", O: "ones", Tths: "tenths", Hths: "hundredths" }[c]}`).join(", ") + "." }];
  }
  if (/times[- ]tables? grid|multiplication (grid|square)|times[- ]table (square|chart)/.test(t)) return [{ h: "Times tables grid" }, { grid: { kind: "times", size: 12 } }, { pagebreak: true }, { h: "Fill it in yourself" }, { grid: { kind: "times", size: 12, blank: true } }];
  if (/fraction wall|fraction strips/.test(t)) return [{ grid: { kind: "fractionwall" } }, { text: "Cut along the rows to make fraction strips, or compare fractions by lining up the pieces." }];
  if (/ten frame/.test(t)) return [{ grid: { kind: "tenframe", count: 4 } }];
  if ((m = /number cards (-?\d+) to (-?\d+)/.exec(t))) {
    const items = [];
    for (let i = Number(m[1]); i <= Number(m[2]); i++) items.push(String(i));
    return [{ cards: items, cols: 4, size: 12, height: 30 }];
  }
  if (/periodic table/.test(t)) return [{ grid: { kind: "periodic", ar: /ar values|relative atomic|with ar/.test(t) || true } }];
  if (/dot (grid|paper)/.test(t)) return [{ grid: { kind: "dot", size: 10, height: 230 } }];
  if (/isometric/.test(t)) return [{ grid: { kind: "isometric", size: 10, height: 230 } }];
  if (/clock/.test(t)) return [{ grid: { kind: "clock", count: 9 } }];
  if ((m = /curve y\s*=\s*([^()]+?)(?:\s*\(|$)/.exec(title))) return [{ grid: { kind: "graph", xMin: -3, xMax: 5, yMin: -5, yMax: 12, curve: m[1].trim() } }];
  if (/graph (paper|grid|template)|graph sheet|graph grid/.test(t)) return [{ grid: { kind: "squared", size: 2, height: 240 } }];
  if (/squared paper|square grid|grid paper/.test(t)) return [{ grid: { kind: "squared", size: y <= 4 ? 10 : 5, height: 240 } }];
  return null;
}

// ── Templates by type ───────────────────────────────────────────────────────────────────────
function base(entry, lessons) {
  const first = lessons[0];
  const file = fileBy.get(`${entry.subjectSlug}/${entry.year}`);
  return {
    id: entry.id,
    title: entry.title.replace(/\s*\((?:portal[^)]*|pupil pdf[^)]*|printable[^)]*)\)\s*/gi, " ").replace(/\s+/g, " ").trim(),
    type: entry.type,
    subject: entry.subject,
    subjectSlug: entry.subjectSlug,
    year: entry.year,
    ...(file?.data.boardShort && yearNum(entry.year) >= 10 ? { board: file.data.boardShort } : {}),
    unit: first?.unit || entry.units[0],
    lessons: lessons.map((l) => l.n),
    source: `Seeded from ${entry.subjectSlug}/${entry.year} lesson${lessons.length > 1 ? "s" : ""} ${lessons.map((l) => l.n).join(", ")} (${entry.wording})`,
  };
}
const forLesson = (l) => `Lesson ${l.n}: ${clean(l.title)}.`;

function worksheet(entry, lessons) {
  const t = entry.title.toLowerCase();
  const it = base(entry, lessons);
  const L = lessons;
  const blocks = [];
  const kws = keywordsOf(L, 8);
  const grid = gridFromTitle(entry.title, entry.year);
  it.intro = `${L.length === 1 ? forLesson(L[0]) : ""} ${clean(L[0].objectives?.[0] || "")}`.trim();
  if (grid) blocks.push(...grid);
  // Texts pupils read, annotate or learn (Arabic and Qur'an exactly as in the lesson).
  const quotes = quotesOf(L);
  if (quotes.length && /text|read|ayat|ayah|surah|words spaced|extract|source|passage|poem|article|annotat|hadith|quotation/i.test(t + " " + entry.wording)) {
    blocks.push({ h: "Read" });
    for (const q of quotes) blocks.push(AR.test(q.text) ? { arabic: { text: q.text, ref: q.source, spaced: /spaced/i.test(entry.wording), quran: isQuranic(q.source) } } : { passage: { title: q.source, paras: q.text.split(/\n+/).map(clean) } });
    const meaning = tablesOf(L).find((x) => /translation|meaning/i.test(x.head.join(" ")));
    if (meaning) blocks.push({ table: { head: meaning.head, rows: meaning.rows } });
  }
  // Diagrams to label: the lesson's own picture where there is one.
  if (/label|diagram|annotat/i.test(t)) {
    const pic = (L[0].pictures || []).find((p) => /teach|keywords/.test(p.for || "")) || (L[0].pictures || [])[0];
    blocks.push({ h: "Label the diagram" }, { picture: { ...(pic ? { find: pic.find, ...(pic.file ? { file: pic.file } : {}) } : {}), alt: pic?.alt || entry.title, labels: Math.min(8, Math.max(4, kws.length)), draw: `Draw and label: ${entry.title.replace(/\s*\(.*$/, "")}` } });
    if (kws.length) blocks.push({ starters: kws.map((k) => k.term), title: "Word bank" });
  }
  if (/rule card|card and examples|key ?words? (card|mat)|formula|units card|ion charges|command words/i.test(t) && kws.length) blocks.push({ h: "Key words" }, { keywords: kws });
  const models = modelsOf(L);
  if (models.length && /rule card|example|method|worked|practice|calculation|sheet/i.test(t)) {
    blocks.push({ h: models.length > 1 ? "Worked examples" : "Worked example" });
    for (const m of models.slice(0, 3)) blocks.push({ model: { title: clean(m.problem || m.title), parts: [...(m.steps || []).map((s, i) => ({ label: `Step ${i + 1}`, text: clean(s) })), ...(m.answer ? [{ label: "Answer", text: clean(m.answer) }] : [])] } });
  }
  for (const s of sortsOf(L)) if (/sort|cards|classif|group/i.test(t)) blocks.push({ h: clean(s.heading) || "Card sort" }, sortCards(s));
  for (const tb of tablesOf(L)) if (/table|compar|chart|data|record/i.test(t) && !/translation|meaning/i.test(tb.head.join(" "))) blocks.push({ h: tb.heading || "Table" }, { table: { head: tb.head, rows: tb.rows } });
  for (const c of comparesOf(L)) if (/compar|venn|table/i.test(t)) blocks.push({ h: c.heading || "Compare" }, { table: { head: [clean(c.left.title), clean(c.right.title)], rows: Array.from({ length: Math.max(c.left.points.length, c.right.points.length) }, (_, i) => [clean(c.left.points[i] || ""), clean(c.right.points[i] || "")]), blankRows: 2 } });
  for (const tl of timelinesOf(L)) if (/timeline/i.test(t)) blocks.push({ h: tl.heading || "Timeline" }, { timeline: tl.items.map((x) => ({ label: clean(x.label), text: clean(x.text) })) });
  if (/results|record|survey|diary|log|tally/i.test(t)) blocks.push({ h: "My results" }, { table: { head: resultsHead(t), rows: [], blankRows: 8 } });
  // Questions: guided, independent, exit (as in the lesson), each with the lesson's answer.
  const guided = qsFrom(L, ["practice"], false);
  const indep = qsFrom(L, ["independent"], false);
  const exit = qsFrom(L, ["exit"], false);
  const early = yearNum(entry.year) <= 2;
  if (guided.length) blocks.push({ h: early ? "Together" : "We do" }, { questions: guided });
  if (indep.length) blocks.push({ h: early ? "My turn" : "You do" }, { questions: indep });
  if (exit.length) blocks.push({ h: "Exit ticket" }, { questions: exit });
  if (/homework/i.test(entry.via) && L[0].homework) blocks.push({ h: "Homework" }, { text: clean(L[0].homework) });
  it.blocks = blocks.length ? blocks : [{ h: "Questions" }, { questions: qsFrom(L, ["starter", "practice", "independent", "exit"], false) }];
  return it;
}
function resultsHead(t) {
  if (/heart rate|pulse|breathing/.test(t)) return ["Activity", "Beats or breaths in 1 minute (try 1)", "Try 2", "Try 3", "Mean"];
  if (/weather/.test(t)) return ["Day", "Temperature (°C)", "Rain (mm)", "Cloud", "Wind"];
  if (/survey|recycling|tally/.test(t)) return ["Item", "Tally", "Total"];
  if (/mould|diary|observation/.test(t)) return ["Day", "Date", "What I see", "Changes"];
  return ["Test", "What I changed", "What I measured", "Result", "Notes"];
}

function revisionSet(entry, lessons, { type = "revision set", sections = ["independent", "practice", "exit"], max = 14 } = {}) {
  const it = base(entry, lessons);
  it.type = type;
  let qs = qsFrom(lessons, sections, true).filter((q) => !/^(which question|how confident|what will you|one thing)/i.test(q.q));
  const n = Number((/\((\d+) questions?\)/i.exec(entry.wording) || [])[1]) || max;
  qs = qs.slice(0, n);
  if (qs.length < 4) qs = [...qs, ...hinges(lessons, true)].slice(0, n);
  if (qs.length < 4) qs = uniqBy([...qs, ...qsFrom(lessons, ["starter"], true)], (q) => q.q).slice(0, n);
  const mins = lessons.flatMap((l) => sections.flatMap((s) => (l[s] || []).map(itemMins))).filter(Boolean).reduce((a, b) => a + b, 0);
  const timed = /\(timed: (\d+) minutes\)/i.exec(entry.wording);
  it.intro = `${lessons.length === 1 ? forLesson(lessons[0]) : ""} Answer every question. Show your working. Mark it with the mark scheme and log any errors in your repair list.`.trim();
  if (timed) it.time = `${timed[1]} minutes`;
  else if (mins) it.time = `${Math.max(10, Math.round(mins / 5) * 5)} minutes`;
  it.blocks = [{ questions: qs }];
  if (/formulae|formula/i.test(entry.wording)) it.blocks.unshift({ text: "You may use the formulae sheet." });
  return it;
}

function quiz(entry, lessons) {
  const unit = lessons.length === 1 && /unit|end-of|half-term|retrieval|quiz/i.test(entry.title) ? unitLessons(entry.subjectSlug, entry.year, lessons[0].unit) : lessons;
  const it = base(entry, lessons);
  it.lessons = lessons.map((l) => l.n);
  const polls = [...hinges(unit, true), ...qsFrom(unit, ["starter", "exit"], true).filter((q) => q.options)];
  const short = qsFrom(unit, ["starter", "exit", "practice"], true).filter((q) => !q.options && q.a && q.marks <= 2);
  const qs = uniqBy([...polls, ...short], (q) => q.q.toLowerCase()).slice(0, 20);
  it.intro = `${unit.length > 1 ? `Covers lessons ${unit[0].n} to ${unit[unit.length - 1].n} of ${clean(unit[0].unit).replace(/^(spring|summer) \d:\s*/i, "")}.` : forLesson(unit[0])} Answer every question. For multiple choice, fill in one circle.`;
  it.time = `${Math.max(10, Math.min(30, qs.length * 1.5)) | 0} minutes`;
  it.blocks = [{ questions: qs }];
  return it;
}

function testPaper(entry, lessons, type = "test paper") {
  const unit = lessons.length === 1 ? unitLessons(entry.subjectSlug, entry.year, lessons[0].unit) : lessons;
  const it = base(entry, lessons);
  it.type = type;
  // A paper written into the lesson itself (Q1 (2 marks): ...) is used exactly as written.
  const own = lessons.flatMap((l) => (l.independent || []).filter((x) => /^Q\d+\s*\(\d+ marks?\)/i.test(itemQ(x))).map((x) => toQ(x, true)));
  let qs;
  if (own.length >= 4) qs = own;
  else {
    const mc = hinges(unit, true).slice(0, 6);
    const longer = qsFrom(unit, ["independent", "practice"], true).filter((q) => q.a);
    qs = uniqBy([...mc, ...longer], (q) => q.q.toLowerCase());
    let total = 0;
    const target = type === "mock paper" ? 60 : 40;
    qs = qs.filter((q) => (total += q.marks) <= target + 4);
  }
  const mins = own.length ? lessons.flatMap((l) => (l.independent || []).map(itemMins)).filter(Boolean).reduce((a, b) => a + b, 0) : 0;
  const tm = /(\d+)\s*hours?/i.exec(entry.wording);
  it.time = tm ? `${tm[1]} hours` : mins ? `${mins} minutes` : `${Math.round(qs.reduce((a, q) => a + q.marks, 0) * 1.1)} minutes`;
  it.intro = `${type === "mock paper" ? "Mock paper." : "Test."} Answer every question in the spaces provided. Show your working: marks are given for method. The marks for each question are shown in brackets.`;
  it.blocks = [{ questions: qs }];
  return it;
}

function knowledgeOrganiser(entry, lessons) {
  const unit = /this topic|this unit|for this|organiser:?$|knowledge organiser$/i.test(entry.title) || lessons.length === 1 ? unitLessons(entry.subjectSlug, entry.year, lessons[0].unit) : lessons;
  const L = unit.length ? unit : lessons;
  const it = base(entry, lessons);
  it.intro = `${clean(L[0].unit).replace(/^(spring|summer) \d:\s*/i, "")}: the big ideas, key words and examples on one sheet. Keep it in your book and use it to revise (cover, write, check).`;
  const blocks = [];
  const bq = uniqBy(L.map((l) => clean(l.bigQuestion || "")).filter(Boolean), (x) => x).slice(0, 4);
  const link = L.map((l) => l.islamicLink).find((x) => x && x.text && x.at === "start");
  if (bq.length) blocks.push({ panels: [{ title: "Big questions", points: bq }, ...(link ? [{ title: "Islamic foundation", text: clean(link.text) }] : [])], cols: link ? 2 : 1 });
  const kws = keywordsOf(L, 18);
  if (kws.length) blocks.push({ h: "Key words" }, { keywords: kws });
  const panels = L.slice(0, 9).map((l) => {
    const pts = uniqBy(
      (l.teach || []).flatMap((t) => (t.bullets || []).map(clean)).filter((b) => b.length > 12 && !/^(listen|follow|mics|look|watch|think|talk|write|turn to|say|now try|let'?s|on your)/i.test(b)),
      (x) => x.toLowerCase(),
    ).slice(0, 4);
    return { title: clean(l.title).replace(/^(lesson \d+:\s*)/i, ""), points: pts.length ? pts : (l.successCriteria || []).map((s) => clean(s).replace(/^(all|most|some):\s*/i, "")).slice(0, 3) };
  });
  if (panels.length) blocks.push({ h: "What we learn" }, { panels, cols: 2 });
  const models = modelsOf(L).slice(0, 4);
  if (models.length) blocks.push({ h: "Worked examples" }, { panels: models.map((m) => ({ title: clean(m.problem || m.title).slice(0, 120), points: [...(m.steps || []).map(clean).slice(0, 4), ...(m.answer ? [`Answer: ${clean(m.answer)}`] : [])] })), cols: 2 });
  const tls = timelinesOf(L);
  if (tls.length) blocks.push({ h: tls[0].heading || "Timeline" }, { timeline: tls[0].items.map((x) => ({ label: clean(x.label), text: clean(x.text) })) });
  const mis = misconceptionsOf(L).slice(0, 4);
  if (mis.length) blocks.push({ h: "Common mistakes" }, { table: { head: ["Not this", "This"], rows: mis.map((m) => [clean(m.wrong), clean(m.right)]) } });
  it.blocks = blocks;
  it.name = false;
  return it;
}

const FRAMES = [
  [/peel|peedl|point.*evidence|paragraph frame|analysis paragraph/i, ["Point", "Evidence", "Explain", "Link"]],
  [/story mountain/i, ["Opening", "Build-up", "Problem", "Resolution", "Ending"]],
  [/story map/i, ["Beginning: where are we?", "What happens first", "What happens next", "The problem", "How it ends"]],
  [/letter/i, ["Address and date", "Greeting", "Why I am writing", "Point 1 with evidence", "Point 2 with evidence", "What I would like to happen", "Sign-off"]],
  [/diary/i, ["Date and greeting", "What happened", "How I felt and why", "What I am thinking about now"]],
  [/recipe/i, ["Title", "Ingredients", "Method (numbered steps)"]],
  [/instruction/i, ["Title (How to ...)", "You will need", "Step 1", "Step 2", "Step 3", "Step 4", "Final tip"]],
  [/explanation/i, ["Title", "Introduction: what it is", "Step 1: how it starts", "Step 2: what happens next", "Step 3: the result", "Diagram box", "Conclusion"]],
  [/report/i, ["Title", "Introduction", "Section 1 with sub-heading", "Section 2 with sub-heading", "Section 3 with sub-heading", "Conclusion"]],
  [/fact file/i, ["Name", "Where it is found", "Key facts", "Amazing fact", "Questions I still have"]],
  [/script/i, ["Title and cast", "Scene heading (where and when)", "Lines (name: words)", "Stage directions (in brackets)"]],
  [/evaluat/i, ["What I set out to do", "What went well", "What I would improve", "What I learned"]],
  [/method|write-up|investigation/i, ["Question", "Prediction", "Equipment", "Method", "Results", "Conclusion", "Evaluation"]],
  [/12-mark|evaluate frame|discuss frame|justify frame/i, ["Point (knowledge)", "Analysis: because ... this leads to ...", "Counter-point", "Analysis of the counter-point", "Judgement: on balance ... because ... it depends on ..."]],
  [/analyse frame|9-mark|6-mark|answer frame|answer planner|planner/i, ["Point", "Because (analysis)", "This means that (chain of reasoning)", "Therefore (conclusion)"]],
  [/conclusion/i, ["Summary", "Why it matters", "Reflection", "Final thought"]],
  [/advert/i, ["Product name", "Slogan", "Features", "Ingredients", "Call to action"]],
  [/riddle/i, ["I am ...", "I can ...", "I feel ...", "What am I?"]],
  [/venn/i, ["Only in the first", "In both", "Only in the second"]],
  [/food chain|flow (chart|diagram)/i, ["1", "2", "3", "4", "5"]],
  [/timeline/i, ["First", "Then", "Next", "After that", "Finally"]],
  [/notes/i, ["Heading 1", "Heading 2", "Heading 3", "Key words I used"]],
  [/scene/i, ["Box 1", "Box 2", "Box 3", "Box 4"]],
];
function writingFrame(entry, lessons) {
  const it = base(entry, lessons);
  const L = lessons;
  const title = entry.wording;
  const model = L.map((l) => (l.practice || []).map(itemModel).find(Boolean)).find(Boolean);
  let labels = null;
  const colon = /frame[^:]*:\s*(.+)$/i.exec(title) || /scaffold[^:]*:\s*(.+)$/i.exec(title);
  if (colon) labels = colon[1].split(/,\s*|\s+and\s+(?=[a-z])/i).map((s) => clean(s).replace(/^[a-z]/, (c) => c.toUpperCase())).filter((s) => s.length > 1 && s.length < 60);
  if (!labels && model && /\b[A-Z][a-z]+( [a-z]+)?:\s/.test(model)) {
    const parts = model.split(/(?=\b(?:Point|Evidence|Explain|Explanation|Link|Development|Analysis|Analyse|Evaluate|Evaluation|Judgement|Counter|Context|Effect|Technique|Introduction|Conclusion|Hook|Topic sentence|Because|Therefore|However|Example):\s)/);
    const ls = parts.map((p) => /^([A-Z][A-Za-z -]{2,20}):/.exec(p)?.[1]).filter(Boolean);
    if (ls.length >= 3) labels = ls;
  }
  if (!labels) for (const [re, ls] of FRAMES) if (re.test(title)) {
    labels = ls;
    break;
  }
  if (!labels) labels = ["Plan", "First part", "Second part", "Third part", "Check"];
  const early = yearNum(entry.year) <= 2;
  const lines = Math.max(3, Math.min(7, Math.round(24 / labels.length)));
  const starters = (s) => STARTERS[s.toLowerCase().split(/[ :(]/)[0]] || [];
  it.intro = `${L.length === 1 ? forLesson(L[0]) : ""} Plan or write in each box.${/arabic/.test(entry.subjectSlug) ? " Write in Arabic; use the word bank." : ""}`.trim();
  const blocks = [{ frame: labels.map((label) => ({ label, starters: starters(label), lines: early ? 3 : lines })) }];
  if (model) blocks.unshift({ h: "Model" }, { model: { parts: model.split(/(?=\b(?:Point|Evidence|Explain|Link|Analysis|Evaluation|Judgement|Counter-point|Because|Therefore):\s)/).map((p) => { const m = /^([A-Z][A-Za-z -]{2,20}):\s*(.*)$/s.exec(p.trim()); return m ? { label: m[1], text: clean(m[2]) } : { text: clean(p) }; }) } }, { h: "Your turn" });
  const kws = keywordsOf(L, 10);
  if (kws.length) blocks.push({ starters: kws.map((k) => k.term), title: "Word bank" });
  it.blocks = blocks;
  return it;
}
const STARTERS = {
  point: ["The writer suggests that", "One reason is", "Firstly,"],
  evidence: ["This is shown when", "For example,", "The text says"],
  explain: ["This shows that", "This suggests", "This means that"],
  link: ["Therefore,", "This links to the question because", "Overall,"],
  analysis: ["This leads to", "As a result,", "This means that"],
  because: ["because", "This leads to", "As a result,"],
  judgement: ["On balance,", "It depends on", "Overall, the most important factor is"],
  "counter-point": ["However,", "On the other hand,"],
  counter: ["However,", "On the other hand,"],
  conclusion: ["In conclusion,", "Overall,"],
  introduction: ["This report is about", "Have you ever wondered"],
  opening: ["Once,", "Long ago,", "On a cold morning,"],
  problem: ["Suddenly,", "Without warning,"],
  ending: ["At last,", "In the end,"],
};

function modelText(entry, lessons) {
  const it = base(entry, lessons);
  const quotes = quotesOf(lessons);
  const blocks = [];
  const name = /'([^']+)'/.exec(entry.wording)?.[1];
  for (const q of quotes) blocks.push(AR.test(q.text) && !/[a-z]{4,}/i.test(q.text) ? { arabic: { text: q.text, ref: q.source, quran: isQuranic(q.source) } } : { passage: { title: q.source, paras: q.text.split(/\n+/).map(clean), lineNumbers: false } });
  if (!quotes.length) {
    const models = lessons.flatMap((l) => [...(l.practice || []), ...(l.independent || [])].map(itemModel)).filter(Boolean);
    for (const m of models.slice(0, 2)) blocks.push({ model: { parts: [{ text: clean(m) }] } });
  }
  it.intro = `${name ? `'${name}'. ` : ""}Read the text carefully. Annotate it: underline key words and write your ideas in the margin.`;
  it.blocks = blocks.length ? blocks : [{ text: "See the lesson slides." }];
  const qs = qsFrom(lessons, ["practice", "independent"], false).filter((q) => q.a).slice(0, 6);
  if (qs.length) it.blocks.push({ h: "Questions on the text" }, { questions: qs });
  return it;
}

function printable(entry, lessons) {
  const it = base(entry, lessons);
  const grid = gridFromTitle(entry.wording, entry.year);
  it.intro = lessons.length === 1 ? forLesson(lessons[0]) : `Used in lessons ${lessons.map((l) => l.n).join(", ")}.`;
  if (grid) {
    it.blocks = grid;
    it.name = /cards|chart|wall|frame|line/i.test(entry.wording) ? undefined : false;
    return it;
  }
  // Templates named in the lesson: a table or frame shaped by the name, plus the lesson's own data.
  return { ...worksheet(entry, lessons), type: entry.type };
}

function practicalGuide(entry, lessons) {
  const it = base(entry, lessons);
  const l = lessons[0];
  const safetyIn = /\(([^)]*)\)/.exec(entry.wording)?.[1] || "";
  const safety = safetyIn.split(";").map(clean).filter((s) => s && !/^portal|printable|worksheet$/i.test(s)).map((s) => s.replace(/^[a-z]/, (c) => c.toUpperCase()));
  const kit = (l.resources || []).map(clean).filter((r) => !/slides|mini-?whiteboard|exercise book|portal|pupil pdf|scheme|kerboodle|school|textbook|teams|workbook|calculator$/i.test(r));
  const method = uniqBy(
    (l.teach || []).filter((t) => /method|practical|how to|steps|investigat|set up|try it|experiment|demo|test/i.test(t.heading || "")).flatMap((t) => (t.bullets || []).map(clean)).concat((l.teach || []).filter((t) => Array.isArray(t.cycle)).flatMap((t) => t.cycle.map(clean))),
    (x) => x.toLowerCase(),
  );
  it.intro = `${forLesson(l)} A practical to do at home with an adult nearby. Read it all first.`;
  it.blocks = [
    { practical: { aim: clean(l.objectives?.[0] || l.bigQuestion || ""), equipment: kit.length ? kit : ["Household items listed on the slides"], safety: [...safety, "An adult knows what you are doing and is nearby", "Clear a space and tidy up afterwards; wash your hands"], method: method.length ? method : qsFrom([l], ["practice", "independent"], false).map((q) => q.q).slice(0, 6), adult: /adult (cuts|pours|disposes|lights)/i.test(entry.wording) ? "Some steps are for an adult only (see Stay safe)." : undefined } },
    { h: "My results" },
    { table: { head: resultsHead(entry.wording.toLowerCase()), rows: [], blankRows: 6 } },
    ...(qsFrom([l], ["exit"], false).length ? [{ h: "What did I find out?" }, { questions: qsFrom([l], ["exit", "independent"], false).slice(0, 4) }] : []),
  ];
  if (!it.blocks[0].practical.adult) delete it.blocks[0].practical.adult;
  return it;
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
export function seedItem(entry) {
  const lessons = entry.lessons.map((x) => lessonOf(entry.subjectSlug, entry.year, x.n)).filter(Boolean);
  if (!lessons.length) return null;
  switch (entry.type) {
    case "revision set":
      return revisionSet(entry, lessons);
    case "quiz":
      return quiz(entry, lessons);
    case "test paper":
    case "mark scheme":
      return testPaper(entry, lessons, "test paper");
    case "mock paper":
      return testPaper(entry, lessons, "mock paper");
    case "knowledge organiser":
      return knowledgeOrganiser(entry, lessons);
    case "writing frame":
      return writingFrame(entry, lessons);
    case "model text":
      return modelText(entry, lessons);
    case "printable graph/grid":
      return printable(entry, lessons);
    case "practical guide":
      return practicalGuide(entry, lessons);
    default:
      return worksheet(entry, lessons);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reg = readJson(path.join(RES_DIR, `${term}.json`), null);
  if (!reg) throw new Error(`No register for ${term}: run node scripts/resources/register.mjs`);
  let made = 0;
  let kept = 0;
  let skipped = 0;
  for (const e of reg.resources) {
    if (e.source !== "generated") continue;
    if (subjects.length && !subjects.includes(e.subjectSlug)) continue;
    const file = path.join(ITEMS_DIR, e.subjectSlug, e.year, `${e.id}.json`);
    if (fs.existsSync(file) && !overwrite) {
      kept++;
      continue;
    }
    const item = seedItem(e);
    if (!item || !item.blocks?.length) {
      skipped++;
      console.log(`skipped (no lesson content): ${e.id}`);
      continue;
    }
    made++;
    if (dry) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(item, null, 1)}\n`);
  }
  console.log(`${term}${subjects.length ? ` (${subjects.join(", ")})` : ""}: ${made} items written, ${kept} kept (already there), ${skipped} skipped`);
}
