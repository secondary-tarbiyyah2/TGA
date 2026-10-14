// Teacher lesson plan (Word .docx) for one lesson, built from the same JSON
// as the slides. Converted to PDF alongside the deck in the workflow.
//
// One or two A4 pages a teacher can print or edit: what the lesson is,
// objectives and key words, a timed run-through with slide numbers, the
// teacher script for every explanation slide, tasks with what to look for,
// adaptations and homework.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const ROOT = new URL("../../", import.meta.url).pathname;
const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const LOGO_RATIO = 393 / 120;
const INK = "1B1E21";
const MUTED = "5B6168";
const GOLD_DARK = "7D6428";
const CREAM = "FBF7EE";
const LINE = "E3DED2";
const FONT = "Calibri";
const PAGE_W = 11906; // A4 in twips
const MARGIN = 850; // ~1.5 cm
const CONTENT_W = PAGE_W - MARGIN * 2;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const run = (text, o = {}) => new TextRun({ text: String(text ?? "").replace(/\s+/g, " "), font: FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color || INK });
const para = (children, o = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { before: o.before ?? 0, after: o.after ?? 80, line: 264 }, alignment: o.align, numbering: o.numbering, keepNext: o.keepNext });

function heading(text, accent) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: 20, bold: true, color: accent, characterSpacing: 40 })],
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 3 } },
    keepNext: true,
  });
}

const bullet = (text, o = {}) => para([run(text, o)], { numbering: { reference: "bullets", level: 0 }, after: 40 });

function cell(children, o = {}) {
  return new TableCell({
    children: (Array.isArray(children) ? children : [children]).map((c) => (typeof c === "string" ? para([run(c, o.text)], { after: 40 }) : c)),
    width: { size: o.w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
    },
  });
}

function table(widths, rows) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: rows.map((r, i) => new TableRow({ children: r.map((c, j) => cell(c, { w: widths[j], fill: i === 0 && r.header !== false ? CREAM : undefined, text: i === 0 ? { bold: true, size: 19 } : undefined })), cantSplit: true })),
  });
}

/** Minutes for each phase, adding up to the lesson length. */
export function timings(duration, teachCount, breaks) {
  const starter = duration <= 30 ? 4 : 5;
  const exit = duration <= 30 ? 3 : 5;
  const close = 2;
  const rest = Math.max(10, duration - starter - exit - close);
  const teach = Math.max(teachCount * 2, Math.round(rest * 0.42)) + breaks;
  const guided = Math.round(rest * 0.2);
  const independent = Math.max(5, duration - starter - exit - close - teach - guided);
  return { starter, teach, guided, independent, exit, close };
}

const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

/**
 * @param file   { subject, year, board }
 * @param lesson the lesson JSON
 * @param meta   { yearLabel, accent, band, next, slides: { starter, teach:[n…], guided, independent, exit, close, total } }
 */
export async function buildPlan(file, lesson, meta) {
  const accent = meta.accent;
  const duration = lesson.duration || 45;
  const teach = lesson.teach || [];
  const t = timings(duration, teach.length, meta.breaks || 0);
  const S = meta.slides;
  const kids = meta.band === "early" ? "children" : "pupils";
  const children = [];

  // Title block
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `${clean(file.subject).toUpperCase()}  ·  ${meta.yearLabel.toUpperCase()}${file.board && /^y1[01]$/.test(file.year) ? `  ·  ${clean(file.board).toUpperCase()}` : ""}`, font: FONT, size: 19, bold: true, color: accent, characterSpacing: 30 })],
      spacing: { after: 40 },
    }),
    para([run(`Lesson ${lesson.n}: ${lesson.title}`, { size: 36, bold: true })], { after: 40 }),
    para([run(`${clean(lesson.unit)}  ·  ${duration} minutes  ·  ${S.total} slides`, { color: MUTED, size: 20 })], { after: 160 }),
  );

  // Objectives + key words side by side
  const objs = (lesson.objectives || []).map((o) => para([run(`•  ${o}`)], { after: 50 }));
  const kws = (lesson.keywords || []).length
    ? lesson.keywords.slice(0, 8).map((k) => para([run(`${k.term}: `, { bold: true, color: accent }), run(k.def, { size: 19 })], { after: 40 }))
    : [para([run("No new key words this lesson.", { color: MUTED, italics: true })])];
  children.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [Math.round(CONTENT_W * 0.55), CONTENT_W - Math.round(CONTENT_W * 0.55)],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            cell([para([run("Objectives", { bold: true, color: GOLD_DARK, size: 19 })], { after: 60 }), ...objs], { w: Math.round(CONTENT_W * 0.55) }),
            cell([para([run("Key words", { bold: true, color: GOLD_DARK, size: 19 })], { after: 60 }), ...kws], { w: CONTENT_W - Math.round(CONTENT_W * 0.55), fill: CREAM }),
          ],
        }),
      ],
    }),
  );

  // Big question, success criteria, links (the school's planning format)
  const sc = (lesson.successCriteria || []).map(clean).filter(Boolean);
  if (lesson.bigQuestion || sc.length || lesson.crossCurricular || lesson.smsc) {
    children.push(heading("Big question and success criteria", accent));
    if (lesson.bigQuestion) children.push(para([run("Enquiry question: ", { bold: true }), run(lesson.bigQuestion, { italics: true })]));
    sc.forEach((x, i) => children.push(para([run(`${["All", "Most", "Some"][i] || "•"} pupils: `, { bold: true, color: accent }), run(x)], { after: 40 })));
    if (lesson.crossCurricular) children.push(para([run("Cross-curricular links: ", { bold: true }), run(lesson.crossCurricular)], { before: 60 }));
    if (lesson.smsc) children.push(para([run("SMSC: ", { bold: true }), run(lesson.smsc)]));
  }

  // Run-through
  children.push(heading("Lesson run-through", accent));
  const w = [1500, 1000, 1100, CONTENT_W - 3600];
  let clock = 0;
  const at = (mins) => {
    const from = clock;
    clock += mins;
    return `${from}–${clock} min`;
  };
  const list = (items) => (items || []).map((x, i) => para([run(`${i + 1}. ${x}`, { size: 19 })], { after: 30 }));
  children.push(
    table(w, [
      ["Phase", "Time", "Slides", "What happens"],
      ["Starter", at(t.starter), String(S.starter), [para([run(meta.band === "senior" ? "Do now: retrieval, in silence, from memory." : "Warm-up: settle, bismillah, quick recall.", { size: 19, italics: true, color: MUTED })], { after: 40 }), ...list(lesson.starter)]],
      ["Explain", at(t.teach), range(S.teach[0], S.teach[S.teach.length - 1]), teach.map((x, i) => para([run(`${i + 1}. ${x.heading}`, { size: 19 })], { after: 30 }))],
      ["Guided practice", at(t.guided), String(S.guided), [para([run("We do it together. Check every pupil before moving on.", { size: 19, italics: true, color: MUTED })], { after: 40 }), ...list(lesson.practice)]],
      ["Independent", at(t.independent), String(S.independent), [para([run(meta.band === "early" ? "Children work on their own with adult support." : meta.band === "junior" ? "Bronze, silver, gold: pupils choose where to start." : "Core, extend, stretch: pupils start where they can.", { size: 19, italics: true, color: MUTED })], { after: 40 }), ...list(lesson.independent)]],
      ["Exit ticket", at(t.exit), String(S.exit), [...list(lesson.exit), para([run("Then a 1-2-3 confidence check.", { size: 19, italics: true, color: MUTED })], { after: 30 })]],
      ["Close", at(t.close), String(S.close), [para([run(`Homework: ${clean(lesson.homework)}`, { size: 19 })], { after: 30 }), ...(meta.next ? [para([run(`Next lesson: ${meta.next.title}`, { size: 19, color: MUTED })], { after: 30 })] : [])]],
    ]),
  );
  if (meta.breaks) children.push(para([run(`Includes a one-minute ${meta.band === "early" ? "wiggle" : "brain"} break during the explanation (no music needed).`, { size: 18, italics: true, color: MUTED })], { before: 60 }));

  // Teacher script
  children.push(heading("Teacher script for each explanation", accent));
  teach.forEach((x, i) => {
    children.push(para([run(`Slide ${S.teach[i]}  ·  ${x.heading}`, { bold: true, size: 22 })], { before: 100, after: 40, keepNext: true }));
    (x.bullets || []).forEach((b) => children.push(bullet(b, { size: 19, color: MUTED })));
    if (x.model) {
      children.push(para([run("Worked example (I do): ", { bold: true, color: accent, size: 20 }), run(x.model.problem, { size: 20 })], { before: 40, after: 30 }));
      (x.model.steps || []).forEach((st, k) => children.push(para([run(`${k + 1}. ${st}`, { size: 19 })], { after: 20 })));
      if (x.model.answer) children.push(para([run("Answer: ", { bold: true, size: 19 }), run(x.model.answer, { size: 19 })], { after: 40 }));
    }
    if (x.check) {
      const c = x.check;
      children.push(para([run("Hinge question (mini-whiteboards): ", { bold: true, color: accent, size: 20 }), run(c.q, { size: 20 })], { before: 40, after: 30 }));
      (c.options || []).forEach((o, k) => children.push(para([run(`${"ABCD"[k]}  ${o}`, { size: 19, bold: k === Number(c.answer) })], { after: 20 })));
      children.push(para([run(`Answer: ${"ABCD"[Number(c.answer)] || "?"}. `, { bold: true, size: 19 }), run(c.why || "", { size: 19 }), run(" If fewer than about 80% are right, reteach before moving on.", { size: 19, color: MUTED })], { after: 40 }));
    }
    if (x.misconception) children.push(para([run("Misconception: ", { bold: true, color: "C0392B", size: 19 }), run(x.misconception.wrong, { size: 19 }), run("  →  ", { size: 19 }), run(x.misconception.right, { size: 19 })], { after: 40 }));
    if (x.note) children.push(para([run("Say and ask: ", { bold: true, color: accent, size: 20 }), run(x.note, { size: 20 })], { before: 40, after: 60 }));
  });

  // Adaptations + checks
  children.push(heading("Adapt and check", accent));
  if (lesson.send) children.push(para([run("SEND, EAL and stretch: ", { bold: true }), run(lesson.send)]));
  children.push(
    para([run("Look for: ", { bold: true }), run(`can ${kids} meet each objective unaided at the exit ticket? Note anyone at 3 ("not yet") and start next lesson's warm-up with them in mind.`)]),
    para([run("Notes after the lesson: ", { bold: true }), run("______________________________________________________________", { color: LINE })], { before: 120 }),
    para([run("______________________________________________________________________________________", { color: LINE })], { before: 120 }),
  );

  const doc = new Document({
    creator: "Tarbiyyah Global Academy",
    title: `${file.subject} ${meta.yearLabel} – Lesson ${lesson.n} plan`,
    description: lesson.title,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }] },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1000, bottom: 900, left: MARGIN, right: MARGIN, header: 450, footer: 400 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({ type: "png", data: LOGO, transformation: { width: Math.round(28 * LOGO_RATIO), height: 28 } }),
                  new TextRun({ text: "\tLESSON PLAN", font: FONT, size: 17, bold: true, color: GOLD_DARK, characterSpacing: 40 }),
                ],
                tabStops: [{ type: "right", position: CONTENT_W }],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${file.subject} · ${meta.yearLabel} · Lesson ${lesson.n}\t`, font: FONT, size: 16, color: MUTED }),
                  new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: MUTED }),
                ],
                tabStops: [{ type: "right", position: CONTENT_W }],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
