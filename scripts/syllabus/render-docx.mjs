// The editable Word copy of a pack document, with the same structure as the PDF (model.mjs):
// cover, contents, numbered sections, landscape pages for the grids, running header and footer.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";
import { tocEntries } from "./render-html.mjs";

const require = createRequire(import.meta.url);
const D = require("docx");
const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, Packer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, VerticalAlign, WidthType, HeadingLevel } = D;

const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const INK = "1B1E21", BODY = "2E3338", MUTED = "5B6168", GOLD = "B08E45", GOLD_DK = "7D6428", LINE = "E3DED2", CREAM = "FBF7EE";
const FONT = "Calibri", SERIF = "Georgia";
const A4 = { w: 11906, h: 16838 };
const M = 1000;

function mix(h, t) {
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const run = (s, o = {}) => new TextRun({ text: String(s ?? ""), font: o.font || FONT, size: o.size || 19, bold: o.bold, italics: o.italics, color: o.color || BODY, allCaps: o.caps, characterSpacing: o.spacing });
const para = (kids, o = {}) => new Paragraph({ children: Array.isArray(kids) ? kids : [kids], spacing: { before: o.before ?? 0, after: o.after ?? 100, line: o.line ?? 270 }, alignment: o.align, numbering: o.numbering, keepNext: o.keepNext, keepLines: o.keepLines, heading: o.heading, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined, border: o.border, indent: o.indent, pageBreakBefore: o.pageBreakBefore, tabStops: o.tab ? [{ type: TabStopType.RIGHT, position: o.tab }] : undefined });
const bullet = (s, size = 19) => para([run(s, { size })], { numbering: { reference: "bul", level: 0 }, after: 40 });
const label = (s, acc) => para([run(s, { size: 15, bold: true, color: acc, caps: true, spacing: 20 })], { before: 120, after: 40, keepNext: true });
const side = (c = LINE, sz = 4) => ({ style: BorderStyle.SINGLE, size: sz, color: c });

function table(head, rows, widths, width, o = {}) {
  const tot = widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => Math.round((x / tot) * width));
  const cell = (val, i, c = {}) =>
    new TableCell({
      width: { size: w[i], type: WidthType.DXA },
      margins: { top: 50, bottom: 50, left: 80, right: 80 },
      verticalAlign: VerticalAlign.TOP,
      borders: { top: side(), bottom: side(), left: side(), right: side() },
      shading: c.fill ? { type: ShadingType.CLEAR, fill: c.fill, color: "auto" } : undefined,
      children: (Array.isArray(val) ? val : [val]).map((v, k, all) =>
        Array.isArray(val) && all.length > 1 && !c.plain ? bullet(v, c.size || 16) : para([run(v, { size: c.size || 16, bold: c.bold, color: c.color })], { after: k < all.length - 1 ? 40 : 0, line: 240 }),
      ),
    });
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: w,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, i, { fill: o.headFill, color: "FFFFFF", bold: true, size: 15, plain: true })) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, i, { fill: o.cellFill?.(ri, i) ?? (i === 0 && o.firstFill ? o.firstFill : undefined), bold: i === 0 && o.boldFirst, size: o.size, plain: o.plain })) })),
    ],
  });
}

function blocks(bs, doc, width) {
  const acc = doc.accent, dark = doc.dark, soft = mix(doc.accent, 0.92);
  const out = [];
  for (const b of bs) {
    switch (b.t) {
      case "lead":
        out.push(para([run(b.text, { size: 23, font: SERIF, color: INK })], { after: 200, line: 300 }));
        break;
      case "p":
        out.push(para([run(b.text, { size: b.muted ? 17 : 19, color: b.muted ? MUTED : BODY, italics: b.muted })]));
        break;
      case "h3":
        out.push(para([run(b.text, { size: 25, bold: true, font: SERIF, color: INK })], { before: 240, after: 100, keepNext: true, heading: HeadingLevel.HEADING_3 }));
        break;
      case "bullets":
        if (b.title) out.push(label(b.title, acc));
        b.items.forEach((x) => out.push(bullet(x)));
        break;
      case "kv":
        out.push(table(["Item", "Detail"], b.rows, [1.6, 5], width, { headFill: dark, boldFirst: true, firstFill: CREAM, size: 17 }));
        out.push(para([run("")], { after: 80 }));
        break;
      case "callout":
        out.push(para([run(b.title, { size: 15, bold: true, color: GOLD_DK, caps: true })], { fill: CREAM, before: 120, after: 0, border: { left: side(GOLD, 18) }, indent: { left: 120 }, keepNext: true }));
        if (b.text) out.push(para([run(b.text, { size: 18 })], { fill: CREAM, after: b.items?.length ? 0 : 160, border: { left: side(GOLD, 18) }, indent: { left: 120 } }));
        (b.items || []).forEach((x, i, a) => out.push(para([run(`•  ${x}`, { size: 17 })], { fill: CREAM, after: i === a.length - 1 ? 160 : 0, border: { left: side(GOLD, 18) }, indent: { left: 120 } })));
        break;
      case "table":
        out.push(table(b.head, b.rows, b.widths, width, { headFill: dark, boldFirst: true }));
        out.push(para([run("")], { after: 80 }));
        break;
      case "ltp":
      case "route": {
        if (b.caption) out.push(para([run(b.caption, { size: 21, bold: true, font: SERIF, color: INK })], { after: 80, keepNext: true }));
        const fy = (i) => b.t === "ltp" && i >= 2;
        const head = ["", ...b.columns.map((c, i) => (b.t === "ltp" ? `${c}\n${fy(i) ? "Founding year" : "From Sept 2027"}` : c))];
        const rows = b.rows.map((r) => [r.label.replace(/\n/g, " "), ...r.cells.map((c) => (c.length ? c : ["No unit"]))]);
        out.push(table(head, rows, [1.1, ...b.columns.map(() => 1.6)], width, { headFill: dark, firstFill: CREAM, boldFirst: true, size: 15, plain: true, cellFill: (ri, i) => (i === 0 ? CREAM : fy(i - 1) ? soft : undefined) }));
        out.push(para([run("Shaded: taught in the founding year, January to July 2027.", { size: 15, color: MUTED, italics: true })], { before: 60 }));
        break;
      }
      case "progression":
        out.push(table(["Strand", ...b.columns], b.rows.map((r) => [r.label, ...r.cells]), [1.6, ...b.columns.map(() => 1)], width, { headFill: dark, firstFill: CREAM, boldFirst: true, size: 15 }));
        break;
      case "matrix":
        out.push(table(b.head, b.rows, [2, ...b.head.slice(1).map(() => 0.8)], width, { headFill: dark, firstFill: CREAM, boldFirst: true, size: 15 }));
        break;
      case "yearhead":
        out.push(para([run(b.count, { size: 17, color: MUTED })], { after: 80 }));
        out.push(table(b.strip.map((s) => s.label), [b.strip.map((s) => s.title || "No unit")], b.strip.map(() => 1), width, { headFill: acc, size: 15, cellFill: (_r, i) => (b.strip[i].founding ? soft : undefined) }));
        out.push(para([run("")], { after: 120 }));
        break;
      case "unit": {
        out.push(para([run(`${b.halfTerm.toUpperCase()}   `, { size: 16, bold: true, color: acc }), run(b.title, { size: 24, bold: true, font: SERIF, color: INK })], { fill: soft, before: 200, after: 60, keepNext: true, border: { left: side(acc, 24) }, indent: { left: 120 } }));
        if (b.founding) out.push(para([run(b.founding, { size: 15, color: MUTED, italics: true })], { after: 60, keepNext: true }));
        out.push(label("Key knowledge", acc));
        (b.knowledge.length ? b.knowledge : ["Not recorded"]).forEach((x) => out.push(bullet(x)));
        if (b.skills.length) {
          out.push(label("Skills", acc));
          b.skills.forEach((x) => out.push(bullet(x)));
        }
        if (b.vocabulary.length) {
          out.push(label("Vocabulary", acc));
          out.push(para([run(b.vocabulary.join("  ·  "), { size: 18 })]));
        }
        out.push(table(["Builds on", "How it is checked", "Leads to"], [[b.prior || "Not recorded", b.assess || "Not recorded", b.leadsTo || "Not recorded"]], [1, 1, 1], width, { headFill: dark, size: 16 }));
        if (b.resources) out.push(para([run("Resources: ", { bold: true, color: acc, size: 17 }), run(b.resources, { size: 17 })], { before: 80 }));
        if (b.foundingYear) out.push(para([run("Founding year: ", { bold: true, color: acc, size: 17 }), run(b.foundingYear, { size: 17 })], { before: 40 }));
        if (b.weeks.length) {
          out.push(label("Week by week", acc));
          out.push(table(["Week", "Lessons", "Key vocabulary", "Home activity"], b.weeks.map((w) => [w.week, w.lessons, w.vocabulary.join(", "), w.home]), [0.6, 3.2, 1.8, 2.2], width, { headFill: acc, size: 16 }));
        }
        out.push(para([run("")], { after: 120 }));
        break;
      }
      case "specunit":
        out.push(para([run(`${b.ref}   `, { size: 19, bold: true, color: acc }), run(b.title, { size: 22, bold: true, font: SERIF, color: INK })], { fill: soft, before: 200, after: 40, keepNext: true, border: { left: side(acc, 24) }, indent: { left: 120 } }));
        out.push(para([run(b.meta, { size: 15, color: MUTED })], { after: 60, keepNext: true }));
        b.points.forEach((x, i) => out.push(para([run(`${i + 1}  `, { bold: true, color: acc, size: 17 }), run(x, { size: 18 })], { after: 40, indent: { left: 280, hanging: 280 } })));
        if (b.keyTerms.length) out.push(para([run("Key terms: ", { bold: true, color: acc, size: 17 }), run(b.keyTerms.join(" · "), { size: 17 })], { before: 60, after: 30 }));
        out.push(para([run(`Taught in our lessons${b.covered ? ` (${b.covered})` : ""}: `, { bold: true, color: acc, size: 17 }), run(b.lessons.join(", ") || "No lesson matched yet", { size: 17 })], { after: 30 }));
        if (b.links.length) out.push(para([run("Connects to: ", { bold: true, color: acc, size: 17 }), run(b.links.join("; "), { size: 17 })], { after: 30 }));
        if (b.weeks.length) out.push(table(["Week", "Lessons", "Key vocabulary", "Home activity"], b.weeks.map((w) => [w.week, w.lessons, w.vocabulary.join(", "), w.home]), [0.6, 3.2, 1.8, 2.2], width, { headFill: acc, size: 16 }));
        out.push(para([run("")], { after: 80 }));
        break;
      case "terms":
        out.push(label(b.title, acc));
        out.push(table(["Word", "What it asks for"], b.items, [1.2, 5], width, { headFill: dark, boldFirst: true, size: 16 }));
        out.push(para([run("")], { after: 80 }));
        break;
      case "sources":
        out.push(label("Official sources opened", acc));
        b.items.forEach(([t, u]) => out.push(para([run(`${t}: `, { bold: true, size: 17 }), run(u, { size: 16, color: MUTED })], { after: 40 })));
        break;
      default:
    }
  }
  return out;
}

export async function writeDocx(doc, file, { generated }) {
  const header = new Header({ children: [para([run("TARBIYYAH GLOBAL ACADEMY", { size: 14, bold: true, color: GOLD_DK, spacing: 20 }), run(`\t${doc.header}`, { size: 14, color: MUTED })], { border: { bottom: side(LINE, 4) }, after: 0, tab: 9900 })] });
  const footer = new Footer({ children: [para([run(`${doc.title} · Generated ${generated} from the portal's Curriculum planner\tPage `, { size: 14, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: MUTED })], { tab: 9900 })] });
  const portrait = { page: { size: { width: A4.w, height: A4.h }, margin: { top: M + 200, bottom: M, left: M, right: M, header: 500, footer: 500 } } };
  const landscape = { page: { size: { width: A4.h, height: A4.w, orientation: PageOrientation.LANDSCAPE }, margin: { top: M, bottom: M - 100, left: M - 200, right: M - 200, header: 450, footer: 450 } } };
  const wPortrait = A4.w - 2 * M;
  const wLandscape = A4.h - 2 * (M - 200);

  const cover = [
    para([new ImageRun({ type: "png", data: LOGO, transformation: { width: 200, height: Math.round(200 / (393 / 120)) } })], { after: 1600 }),
    para([run(doc.kind === "subject" ? "SUBJECT CURRICULUM" : "CURRICULUM", { size: 20, bold: true, color: doc.accent, spacing: 40 })], { after: 160 }),
    para([run(doc.title, { size: 84, bold: true, font: SERIF, color: INK })], { after: 200, line: 240 }),
    para([run(doc.subtitle, { size: 28, color: GOLD_DK })], { after: 500 }),
    ...doc.facts.map(([k, v]) => para([run(`${k.toUpperCase()}   `, { size: 15, bold: true, color: MUTED }), run(v, { size: 21, color: INK })], { after: 80 })),
    para([run(`${doc.kicker} · Generated ${generated}`, { size: 16, color: MUTED, italics: true })], { before: 1400 }),
  ];
  const toc = tocEntries(doc);
  const contents = [
    para([run("Contents", { size: 40, bold: true, font: SERIF, color: INK })], { after: 240, pageBreakBefore: true }),
    ...toc.map((e) => para([run(e.num ? `${e.num}   ` : "", { bold: true, color: doc.accent, size: 21 }), run(e.title, { size: e.level === 1 ? 21 : 19, color: e.level === 1 ? INK : BODY })], { after: 60, indent: { left: e.level === 2 ? 600 : 0 } })),
    para([run("Page numbers: see the PDF copy, or use the Navigation pane in Word (View, Navigation Pane).", { size: 16, color: MUTED, italics: true })], { before: 240 }),
  ];

  const nums = new Map();
  toc.forEach((e) => e.level === 1 && !nums.has(e.target) && nums.set(e.target, e.num));
  let groupNum = "";
  const sections = [{ properties: { ...portrait, titlePage: true }, headers: { default: header, first: new Header({ children: [para("")] }) }, footers: { default: footer, first: new Footer({ children: [para("")] }) }, children: [...cover, ...contents] }];
  doc.sections.forEach((s, i) => {
    let num = nums.get(i) || "";
    if (s.group) {
      if (num) groupNum = num;
      num = groupNum;
    }
    const width = s.wide ? wLandscape : wPortrait;
    const kids = [];
    if (s.group) kids.push(para([run(s.group.toUpperCase(), { size: 14, bold: true, color: MUTED, spacing: 30 })], { after: 0 }));
    kids.push(para([run(`${num}  `, { size: 40, color: doc.accent, font: SERIF }), run(s.title, { size: 36, bold: true, font: SERIF, color: INK })], { after: 200, keepNext: true, heading: HeadingLevel.HEADING_1, border: { bottom: side(doc.accent, 10) } }));
    kids.push(...blocks(s.blocks, doc, width));
    sections.push({ properties: s.wide ? landscape : portrait, headers: { default: header }, footers: { default: footer }, children: kids });
  });

  const d = new Document({
    creator: "Tarbiyyah Global Academy",
    title: `${doc.title}: Tarbiyyah Global Academy`,
    description: doc.subtitle,
    styles: {
      default: { document: { run: { font: FONT, size: 19, color: BODY } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: SERIF, size: 36, bold: true, color: INK } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { font: SERIF, size: 25, bold: true, color: INK } },
      ],
    },
    numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }] }] },
    sections,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await Packer.toBuffer(d));
}
