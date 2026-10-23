// Revision booklets: one printable A4 booklet (Word, converted to PDF in the workflow) for every unit in content/lessons.
// Built only from the lesson JSON, so it can never disagree with the slides:
//   cover and how to revise, the big picture, key words, "know it" notes with worked examples and common mistakes,
//   "connect it" links to other subjects, retrieval practice, quiz with an answer key, and a RAG + spaced-revision tracker.
// Usage: node scripts/revision/build-booklets.mjs [outDir=out/booklets] [--only=subject/year]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { themeFor } from "../lessons/deck-parts.mjs";

const require = createRequire(import.meta.url);
const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = require("docx");

const ROOT = new URL("../../", import.meta.url).pathname;
const LESSONS = path.join(ROOT, "content/lessons");
const outDir = path.resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "out/booklets");
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const RATIO = 393 / 120;
const INK = "1B1E21", MUTED = "5B6168", LINE = "E3DED2", CREAM = "FBF7EE", GOLD = "B8892B";
const FONT = "Calibri";
const PAGE_W = 11906, MARGIN = 850, CW = PAGE_W - MARGIN * 2;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "unit";
const yl = (y) => (/^y(\d+)$/.test(y) ? `Year ${y.slice(1)}` : y === "reception" ? "Reception" : y);
const LETTERS = "ABCDEFGH";

const COMB = /[\u0300-\u036f\u20d0-\u20dc]/;
const run = (t, o = {}) => new TextRun({ text: String(t ?? "").replace(/[ \t]+/g, " "), font: COMB.test(String(t ?? "")) ? "DejaVu Sans" : o.font || FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color || INK });
const para = (kids, o = {}) => new Paragraph({ children: Array.isArray(kids) ? kids : [kids], spacing: { before: o.before ?? 0, after: o.after ?? 80, line: 270 }, alignment: o.align, numbering: o.numbering, keepNext: o.keepNext, indent: o.indent, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined, border: o.border });
const bullet = (t, o = {}) => para([run(t, o)], { numbering: { reference: "b", level: 0 }, after: 40 });
const h1 = (t, accent) => para([run(t.toUpperCase(), { size: 26, bold: true, color: accent })], { before: 280, after: 120, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: accent, space: 4 } } });
const h2 = (t, accent) => para([run(t, { size: 24, bold: true, color: accent })], { before: 200, after: 70, keepNext: true });
const box = (kids, fill, edge) => new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW], layout: TableLayoutType.FIXED, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: CW, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: edge }, bottom: { style: BorderStyle.SINGLE, size: 4, color: edge }, right: { style: BorderStyle.SINGLE, size: 4, color: edge }, left: { style: BorderStyle.SINGLE, size: 24, color: edge } }, children: kids })] })] });
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const cell = (kids, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined, margins: { top: 70, bottom: 70, left: 110, right: 110 }, borders: { top: border, bottom: border, left: border, right: border }, children: (Array.isArray(kids) ? kids : [kids]).map((k) => (typeof k === "string" ? para([run(k, o.t)], { after: 20 }) : k)) });
const tbl = (widths, rows, accent) => new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, cantSplit: true, children: r.map((c, j) => cell(c, widths[j], i === 0 ? { fill: accent, t: { bold: true, color: "FFFFFF", size: 19 } } : { fill: i % 2 ? undefined : CREAM })) })) });

// Cross-curricular hubs, matched to lessons through the spec units each hub node points at.
const HUBS = (() => {
  const out = new Map();
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/learn/syllabusIndex.json"), "utf8"));
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z]/g, "");
    for (const hub of idx.hubs || [])
      for (const node of hub.nodes) {
        const slg = Object.keys(idx.specs).find((k) => norm(idx.specs[k].subject) === norm(node.subject));
        const unit = slg && idx.specs[slg].units.find((u) => u.ref === node.ref);
        for (const id of unit?.lessons || []) {
          const k = `${slg}/${id}`;
          const l = out.get(k) || [];
          if (!l.some((h) => h.id === hub.id)) l.push({ id: hub.id, title: hub.title, hook: hub.hook, others: hub.nodes.filter((n) => n !== node) });
          out.set(k, l);
        }
      }
  } catch {
    /* optional */
  }
  return out;
})();

function build(subjectSlug, file, year, unit, lessons) {
  const th = themeFor(subjectSlug);
  const accent = th.accent;
  const board = clean(lessons.find((l) => l.board)?.boardShort || lessons.find((l) => l.board)?.board || file.boardShort || file.board || "");
  const ks4 = /^y1[01]$/.test(year);
  const kids = [];

  // Cover
  kids.push(
    para([new ImageRun({ type: "png", data: LOGO, transformation: { width: 200, height: Math.round(200 / RATIO) } })], { after: 700 }),
    para([run("REVISION BOOKLET", { size: 22, bold: true, color: GOLD })], { after: 120 }),
    para([run(clean(unit), { size: 56, bold: true, color: INK, font: th.head || "Georgia" })], { after: 160 }),
    para([run(`${clean(file.subject)}  ·  ${yl(year)}${ks4 && board ? `  ·  ${board}` : ""}`, { size: 28, color: accent })], { after: 400 }),
  );
  const kwAll = [];
  const seen = new Set();
  for (const l of lessons) for (const k of l.keywords || []) if (k.term && !seen.has(k.term.toLowerCase())) (seen.add(k.term.toLowerCase()), kwAll.push(k));
  const nCheck = lessons.reduce((n, l) => n + (l.teach || []).filter((t) => t.check).length, 0);
  kids.push(box([para([run(`${lessons.length} lesson${lessons.length === 1 ? "" : "s"}  ·  ${kwAll.length} key words  ·  ${nCheck} quiz questions`, { bold: true })], { after: 40 }), para([run("Everything here is taken from your lessons, so it matches your slides.", { color: MUTED, size: 19 })], { after: 0 })], CREAM, accent));

  kids.push(h1("How to revise with this booklet", accent));
  [
    ["1  Read, then cover.", "Read a section. Cover it and write what you remember. Check, then fix the gaps in a different colour."],
    ["2  Test yourself.", "Do the quiz at the back without notes. Mark it with the answer key and note the questions you missed."],
    ["3  Come back.", "Return after 1 day, 1 week and 1 month. Tick the tracker on the last page. Spacing it out makes it stick."],
  ].forEach(([a, b]) => kids.push(para([run(a + " ", { bold: true, color: accent }), run(b)], { after: 80 })));

  // Big picture
  kids.push(new Paragraph({ children: [new PageBreak()] }), h1("The big picture", accent));
  for (const l of lessons) {
    kids.push(h2(`Lesson ${l.n}: ${l.title}`, accent));
    if (l.bigQuestion) kids.push(para([run("Big question  ", { bold: true, color: GOLD }), run(l.bigQuestion, { italics: true })], { after: 60 }));
    (l.successCriteria?.length ? l.successCriteria : l.objectives || []).forEach((s) => kids.push(bullet(/^i can/i.test(s) ? s : `I can ${s.charAt(0).toLowerCase()}${s.slice(1)}`)));
  }

  // Key words
  if (kwAll.length) {
    kids.push(h1("Key words", accent));
    kids.push(tbl([2600, CW - 2600], [["Word", "What it means"], ...kwAll.map((k) => [[para([run(k.term, { bold: true })], { after: 0 })], k.def])], accent));
  }

  // Know it
  kids.push(new Paragraph({ children: [new PageBreak()] }), h1("Know it", accent));
  for (const l of lessons) {
    kids.push(h2(`Lesson ${l.n}: ${l.title}`, accent));
    for (const t of l.teach || []) {
      if (t.check) continue;
      if (t.heading) kids.push(para([run(t.heading, { bold: true })], { after: 30, keepNext: true }));
      (t.bullets || []).forEach((b) => kids.push(bullet(b)));
      if (t.model) {
        const m = t.model;
        kids.push(box([para([run("Worked example  ", { bold: true, color: accent }), run(m.problem, { bold: true })], { after: 40 }), ...(m.steps || []).map((s) => para([run(`${s}`, { size: 20 })], { after: 20, indent: { left: 240 } })), ...(m.answer ? [para([run(`Answer: ${m.answer}`, { bold: true, color: accent })], { before: 40, after: 0 })] : [])], "F4F8FC", accent), para([run("")], { after: 60 }));
      }
      if (t.misconception) kids.push(box([para([run("Common mistake  ", { bold: true, color: "A23B2A" }), run(t.misconception.wrong)], { after: 30 }), para([run("Correct  ", { bold: true, color: "14663A" }), run(t.misconception.right)], { after: 0 })], "FDF4F1", "A23B2A"), para([run("")], { after: 60 }));
      if (t.quote?.text) kids.push(para([run(`“${t.quote.text}”`, { italics: true }), run(t.quote.source ? `  ${t.quote.source}` : "", { color: MUTED, size: 19 })], { after: 70, indent: { left: 240 } }));
      if (t.table?.rows?.length) kids.push(tbl(Array(t.table.rows[0].length).fill(Math.floor(CW / t.table.rows[0].length)), [t.table.head || t.table.header || t.table.rows[0].map(() => ""), ...t.table.rows].filter((r, i) => i > 0 || (t.table.head || t.table.header)), accent), para([run("")], { after: 60 }));
    }
  }

  // Connect it
  const links = [];
  for (const l of lessons) {
    const hub = (HUBS.get(`${subjectSlug}/${year}/${l.n}`) || [])[0];
    if (hub && !links.some((x) => x.id === hub.id)) links.push(hub);
  }
  const cc = lessons.filter((l) => l.crossCurricular);
  if (links.length || cc.length) {
    kids.push(h1("Connect it", accent), para([run("Ideas stick when you meet them more than once. Where else will you see this?", { italics: true, color: MUTED })], { after: 80 }));
    links.slice(0, 3).forEach((h) => {
      kids.push(h2(h.title, accent), para([run(h.hook)], { after: 50 }));
      h.others.slice(0, 4).forEach((n) => kids.push(bullet(`${n.subject}: ${n.note}`)));
    });
    cc.slice(0, 5).forEach((l) => kids.push(para([run(`Lesson ${l.n}  `, { bold: true, color: accent }), run(l.crossCurricular)], { after: 50 })));
    kids.push(para([run("Challenge: pick one link and explain it to someone at home in two sentences.", { bold: true })], { before: 100 }));
  }

  // Retrieval practice
  kids.push(new Paragraph({ children: [new PageBreak()] }), h1("Recall it", accent), para([run("Cover the notes. Write everything you remember about each lesson. Then check.", { italics: true, color: MUTED })], { after: 100 }));
  for (const l of lessons) {
    kids.push(box([para([run(`Lesson ${l.n}: ${l.title}`, { bold: true })], { after: 30 }), ...(l.practice || []).slice(0, 3).map((q) => para([run(`•  ${q}`, { size: 20 })], { after: 20 })), para([run(" ")], { after: 0 }), para([run(" ")], { after: 0 }), para([run(" ")], { after: 0 })], "FFFFFF", LINE), para([run("")], { after: 60 }));
  }

  // Quiz + answers
  const qs = [];
  for (const l of lessons) for (const t of l.teach || []) if (t.check && Array.isArray(t.check.options) && Number.isInteger(t.check.answer)) qs.push({ l, c: t.check });
  for (const l of lessons) for (const q of l.exit || []) qs.push({ l, open: q });
  if (qs.length) {
    kids.push(new Paragraph({ children: [new PageBreak()] }), h1("Quiz yourself", accent), para([run("Choose the best answer, or write your answer on the line. Total: ", { color: MUTED }), run(`${qs.length} questions.`, { bold: true })], { after: 100 }));
    qs.forEach((q, i) => {
      if (q.c) {
        kids.push(para([run(`${i + 1}.  `, { bold: true, color: accent }), run(q.c.q, { bold: true })], { before: 100, after: 40, keepNext: true }));
        q.c.options.forEach((o, j) => kids.push(para([run(`${LETTERS[j]}   ${o}`)], { after: 20, indent: { left: 360 }, keepNext: j < q.c.options.length - 1 })));
      } else kids.push(para([run(`${i + 1}.  `, { bold: true, color: accent }), run(q.open, { bold: true })], { before: 100, after: 40, keepNext: true }), para([run("_______________________________________________________________")], { after: 20, indent: { left: 360 } }));
    });
    kids.push(new Paragraph({ children: [new PageBreak()] }), h1("Answers", accent));
    qs.forEach((q, i) => {
      if (q.c) kids.push(para([run(`${i + 1}.  ${LETTERS[q.c.answer]}  `, { bold: true, color: accent }), run(q.c.options[q.c.answer], { bold: true }), run(q.c.why ? `  ${q.c.why}` : "", { size: 20 })], { after: 50 }));
      else kids.push(para([run(`${i + 1}.  `, { bold: true, color: accent }), run(`Open question: check your answer against Lesson ${q.l.n} (${q.l.title}).`, { size: 20, color: MUTED })], { after: 50 }));
    });
  }

  // Tracker
  kids.push(h1("My tracker", accent), para([run("Colour each lesson Red, Amber or Green after each revision session.", { italics: true, color: MUTED })], { after: 80 }));
  kids.push(tbl([CW - 4 * 1500, 1500, 1500, 1500, 1500], [["Lesson", "Day 1", "Week 1", "Month 1", "Exam"], ...lessons.map((l) => [`${l.n}. ${l.title}`, "", "", "", ""])], accent));

  return new Document({
    creator: "Tarbiyyah Global Academy",
    title: `${unit}: revision booklet`,
    numbering: { config: [{ reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1000, bottom: 900, left: MARGIN, right: MARGIN } } },
      headers: { default: new Header({ children: [para([run(`${clean(file.subject)} · ${yl(year)} · ${clean(unit)}`, { size: 17, color: MUTED })], { after: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 3 } } })] }) },
      footers: { default: new Footer({ children: [para([run("Tarbiyyah Global Academy · Revision booklet   ", { size: 17, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: MUTED })], { align: AlignmentType.RIGHT, after: 0 })] }) },
      children: kids,
    }],
  });
}

let n = 0;
const manifest = [];
for (const subjectSlug of fs.readdirSync(LESSONS).sort()) {
  const dir = path.join(LESSONS, subjectSlug);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const year = f.replace(/\.json$/, "");
    if (only && only !== `${subjectSlug}/${year}`) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const units = new Map();
    (j.lessons || []).forEach((l, i) => {
      const u = l.unit || "Lessons";
      if (!units.has(u)) units.set(u, []);
      units.get(u).push({ ...l, n: l.n || i + 1 });
    });
    for (const [unit, lessons] of units) {
      const rel = path.join(subjectSlug, year, `${slug(unit)}.docx`);
      fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
      fs.writeFileSync(path.join(outDir, rel), await Packer.toBuffer(build(subjectSlug, j, year, unit, lessons)));
      manifest.push({ subject_slug: subjectSlug, year, unit, file: rel });
      n++;
    }
  }
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest));
console.log(`Built ${n} revision booklets into ${outDir}`);
