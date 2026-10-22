// Specification and syllabus documents (Word .docx; PDF made from them with LibreOffice).
// Laid out the way an awarding body lays out a specification: cover, qualification at a glance,
// assessment overview, assessment objectives, content by section, command words, links, sources.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, clean, yearLabel } from "./lib.mjs";
import { themeFor } from "../lessons/deck-parts.mjs";

const require = createRequire(import.meta.url);
const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = require("docx");

const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const INK = "1B1E21", MUTED = "5B6168", GOLD_DARK = "7D6428", LINE = "D9D3C4", SOFT = "F5ECD6";
const FONT = "Calibri";
const PAGE_W = 11906, MARGIN = 1000, CW = PAGE_W - 2 * MARGIN;
const STATUS = { Verified: { c: "1E5B36", f: "DDEFE3" }, Provisional: { c: "7A4B00", f: "FBE9C8" } };

const t = (s, o = {}) => new TextRun({ text: clean(s), font: o.font || FONT, size: o.size || 21, bold: o.bold, italics: o.italics, color: o.color || INK });
const p = (kids, o = {}) => new Paragraph({ children: Array.isArray(kids) ? kids : [kids], spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 276 }, alignment: o.align, numbering: o.numbering, keepNext: o.keepNext, pageBreakBefore: o.pageBreakBefore });
const h1 = (s, acc) => new Paragraph({ children: [t(s, { size: 32, bold: true, color: acc, font: "Georgia" })], spacing: { before: 360, after: 140 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: acc, space: 4 } }, pageBreakBefore: false });
const h2 = (s, acc) => new Paragraph({ children: [t(s, { size: 26, bold: true, color: INK, font: "Georgia" })], spacing: { before: 280, after: 80 }, keepNext: true, outlineLevel: 1 });
const label = (s, acc) => new Paragraph({ children: [t(s.toUpperCase(), { size: 17, bold: true, color: acc })], spacing: { before: 140, after: 40 }, keepNext: true });
const bl = (s) => p([t(s)], { numbering: { reference: "bul", level: 0 }, after: 50 });
const num = (s) => p([t(s)], { numbering: { reference: "num", level: 0 }, after: 60 });
const side = (c = LINE) => ({ style: BorderStyle.SINGLE, size: 4, color: c });

function table(head, rows, widths, acc) {
  const tot = widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => Math.round((x / tot) * CW));
  const cell = (txt, i, o = {}) => new TableCell({ width: { size: w[i], type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 90, right: 90 }, borders: { top: side(), bottom: side(), left: side(), right: side() }, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined, children: [p([t(txt, { size: 19, bold: o.bold, color: o.color })], { after: 0 })] });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows: [new TableRow({ tableHeader: true, cantSplit: true, children: head.map((x, i) => cell(x, i, { fill: acc, color: "FFFFFF", bold: true })) }), ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((x, i) => cell(x, i, { fill: ri % 2 ? undefined : "FAF7EF", bold: i === 0 })) }))] });
}

function cover(d, kind, acc, subtitle, facts) {
  const kids = [
    new Paragraph({ children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: 190, height: Math.round(190 / (393 / 120)) } })], spacing: { before: 0, after: 900 } }),
    p([t(kind.toUpperCase(), { size: 22, bold: true, color: acc })], { before: 200, after: 160 }),
    p([t(d.subject, { size: 80, bold: true, color: INK, font: "Georgia" })], { before: 240, after: 200 }),
    p([t(subtitle, { size: 30, color: GOLD_DARK })], { after: 500 }),
    ...facts.map(([k, v]) => p([t(`${k}  `, { size: 20, bold: true, color: MUTED }), t(v, { size: 22 })], { after: 60 })),
    p([t(" ")], { after: 300 }),
    p([t("This document paraphrases the official source for planning. It is not the awarding body's text: always teach and enter pupils from the board's own specification.", { size: 18, italics: true, color: MUTED })], { before: 300 }),
  ];
  return kids;
}

function sourcesSection(d, acc) {
  const out = [h1("Sources and open items", acc)];
  out.push(p([t(d.statusNote)]));
  out.push(label("Official sources opened", acc));
  (d.sources || []).forEach((s) => out.push(p([t(`${s.title}: `, { bold: true, size: 19 }), t(s.url, { size: 18, color: MUTED })], { after: 40 })));
  if (!(d.sources || []).length) out.push(p([t("None recorded.")]));
  out.push(label("Open items", acc));
  (d.gaps || ["No open items recorded."]).forEach((g) => out.push(bl(g)));
  return out;
}

function build(children, d, kind, acc) {
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [t(`Tarbiyyah Global Academy · ${d.subject} · ${kind}   ·   Page `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] });
  return new Document({
    creator: "Tarbiyyah Global Academy", title: `${d.subject} ${kind}`, description: `${d.subject} ${kind}`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: { config: [
      { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 260 } } } }] },
      { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 360 } } } }] },
    ] },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1000, bottom: 1000, left: MARGIN, right: MARGIN } }, titlePage: true }, footers: { default: footer, first: new Footer({ children: [new Paragraph("")] }) }, children }],
  });
}

export function specDocument(d, extra = {}) {
  const acc = themeFor(d.slug).accent || GOLD_DARK;
  const kids = [];
  kids.push(...cover(d, "Specification", acc, `${d.board} ${clean(d.qualification)}${d.code ? ` (${clean(d.code)})` : ""}`, [["Years", d.years], ["Tiers", clean(d.tiers)], ["Specification issue", clean(d.specVersion)]]));
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  // contents
  kids.push(h1("Contents", acc));
  const sections = ["1  Qualification at a glance", "2  Assessment overview", "3  Assessment objectives", `4  Content: ${d.units.length} units`, "5  Command words", "6  Skills and prior learning", "7  Cross-curricular links"];
  if (d.contextNote) sections.push("8  Teaching note");
  if (extra.internationalNote) sections.push(`${sections.length + 1}  International and EAL learners`);
  if (extra.coverage) sections.push(`${sections.length + 1}  Tarbiyyah course map and teacher sign-off`);
  sections.push(`${sections.length + 1}  Sources, verification and open items`);
  sections.forEach((s) => kids.push(p([t(s, { size: 22 })], { after: 80 })));

  kids.push(h1("1  Qualification at a glance", acc));
  kids.push(table(["Item", "Detail"], [["Awarding body", d.board], ["Qualification", clean(d.qualification)], ["Code", clean(d.code)], ["Course length", d.years], ["Tiers", clean(d.tiers)], ["Grading", "9 to 1 (9 is the highest grade)"], ["Specification issue", clean(d.specVersion)]], [1.4, 3.6], acc));

  kids.push(h1("2  Assessment overview", acc));
  kids.push(table(["Paper", "Title", "Time", "Marks", "Weight", "What is examined, and how"], (d.assessment || []).map((a) => [a.paper, a.title, a.duration, String(a.marks), a.weight, `${a.content}${a.format ? `. ${a.format}` : ""}`]), [1.2, 1.6, 1, 0.7, 0.8, 4], acc));
  kids.push(label("Non-examined component", acc));
  kids.push(p([t(d.nonExam || "None")]));

  kids.push(h1("3  Assessment objectives", acc));
  kids.push(table(["Objective", "What it assesses", "Weighting"], (d.aos || []).map((a) => [a.code, a.desc, a.weight || ""]), [1, 5, 1.5], acc));

  kids.push(h1(`4  Content: ${d.units.length} units`, acc));
  kids.push(p([t("Points are paraphrased from the board. Point numbers are this document's own, not the board's references. Year and term show a recommended teaching order, not a board requirement.", { italics: true, size: 19, color: MUTED })]));
  // overview table
  kids.push(table(["Ref", "Unit", "Paper", "Year", "Term", "Points"], d.units.map((u) => [u.ref, u.title, u.paper, u.year, u.term || "", String((u.points || []).length)]), [1, 4.2, 1.5, 0.7, 1, 0.8], acc));
  for (const u of d.units) {
    kids.push(h2(`${u.ref}  ${u.title}`, acc));
    kids.push(p([t(`${u.paper} · ${u.year}${u.term ? ` · ${u.term}` : ""}`, { size: 19, color: MUTED, bold: true })], { after: 60, keepNext: true }));
    kids.push(label("What the specification requires", acc));
    (u.points || []).forEach((pt, i) => kids.push(p([t(`${u.ref}.${i + 1}  `, { bold: true, color: acc, size: 19 }), t(pt)], { after: 50 })));
    const cu = extra.coverage?.units?.find((x) => x.ref === u.ref);
    if (cu) {
      kids.push(label("Taught in our lessons", acc));
      kids.push(p([t(cu.lessons.length ? cu.lessons.map((id) => id.replace("y", "Y").replace("/", " lesson ")).join(" · ") : "No lesson matched yet", { size: 20 })]));
      const missing = cu.points.filter((x) => !x.lessons.length).map((x) => `${u.ref}.${x.n}`);
      if (missing.length) kids.push(p([t(`Points with no lesson matched yet: ${missing.join(", ")}`, { size: 19, color: "B42318", bold: true })]));
    }
    if ((u.keyTerms || []).length) { kids.push(label("Key terms", acc)); kids.push(p([t(u.keyTerms.join(" · "), { size: 20 })])); }
    const rel = (d.links || []).filter((l) => l.unitRef && clean(l.unitRef) === clean(u.ref));
    if (rel.length) { kids.push(label("Connects to", acc)); rel.forEach((l) => kids.push(bl(`${l.with}: ${l.topic}`))); }
  }

  kids.push(h1("5  Command words", acc));
  if ((d.commandWords || []).length) kids.push(table(["Command word", "What it asks for"], d.commandWords.map((c) => [c.word, c.meaning]), [1.5, 5], acc));
  else kids.push(p([t("No command-word list recorded; see open items.")]));

  kids.push(h1("6  Skills and prior learning", acc));
  kids.push(label("Examined skills", acc));
  (d.skills || []).forEach((s) => kids.push(bl(s)));
  if ((d.prerequisites || []).length) { kids.push(label("Builds on", acc)); kids.push(table(["Earlier learning", "Supports unit"], d.prerequisites.map((x) => [x.from, x.to]), [4, 1.5], acc)); }

  kids.push(h1("7  Cross-curricular links", acc));
  if ((d.links || []).length) kids.push(table(["Subject", "Topic", "Unit", "How the subjects connect"], d.links.map((l) => [l.with, l.topic, l.unitRef || "", l.how]), [1.4, 1.8, 0.8, 3.8], acc));
  else kids.push(p([t("No links recorded.")]));

  let n = 8;
  if (d.contextNote) { kids.push(h1(`${n++}  Teaching note`, acc)); kids.push(p([t(d.contextNote)])); }
  if (extra.internationalNote) {
    kids.push(h1(`${n++}  International and EAL learners`, acc));
    extra.internationalNote.forEach((x) => (x.startsWith("- ") ? kids.push(bl(x.slice(2))) : kids.push(p([t(x)]))));
  }
  if (extra.coverage) {
    const c = extra.coverage;
    kids.push(h1(`${n++}  Tarbiyyah course map and teacher sign-off`, acc));
    kids.push(p([t(`This is our own course, built to teach every point of the ${d.board} specification. ${c.covered} of ${c.points} points are matched to one or more of our ${c.lessonCount} lessons. Lessons are matched to points from their wording, and each unit is signed off by a teacher in the portal. The source files in the school portal are the single source of truth; this document is generated from them, so a correction made there reaches every document, deck and screen.`)]));
    kids.push(table(["Ref", "Unit", "Year", "Points", "Lessons", "Checked by", "Date"], c.units.map((u) => [u.ref, u.title, u.year || "", `${u.covered}/${u.total}`, u.lessons.length ? u.lessons.map((id) => id.replace("y", "Y").replace("/", " L")).join(", ") : "none yet", "", ""]), [0.8, 2.8, 0.6, 0.7, 2.0, 1.2, 0.9], acc));
    kids.push(p([t("Sign-off: a teacher writes their name and the date once they have checked the unit's points against the board's own document and the lessons against the points. Record the result in the portal Lesson library too, so it is kept with the lesson.", { italics: true, size: 19, color: MUTED })]));
  }
  kids.push(...sourcesSection(d, acc));
  return build(kids, d, "Specification", acc);
}

export function syllabusDocument(d) {
  const acc = themeFor(d.slug).accent || GOLD_DARK;
  const yrs = Object.keys(d.yearMap || {});
  const span = `${yearLabel(yrs[0])} to ${yearLabel(yrs[yrs.length - 1])}`;
  const kids = [...cover(d, "Syllabus", acc, d.framework, [["Years", span], ["Key stages", (d.keyStages || []).map((k) => k.ks).join(", ")]])];
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(h1("Contents", acc));
  ["1  Purpose", "2  Statutory content by key stage", "3  Year-by-year units", "4  Progression across the years", "5  Looking ahead", "6  Cross-curricular links", "7  Sources, verification and open items"].forEach((s) => kids.push(p([t(s, { size: 22 })], { after: 80 })));
  kids.push(h1("1  Purpose", acc));
  (d.purpose || []).forEach((x) => kids.push(bl(x)));
  kids.push(h1("2  Statutory content by key stage", acc));
  for (const ks of d.keyStages || []) {
    kids.push(h2(`${ks.ks} · ${ks.years}`, acc));
    for (const st of ks.strands) { kids.push(label(st.strand, acc)); st.statements.forEach((s) => kids.push(bl(s))); }
  }
  kids.push(h1("3  Year-by-year units", acc));
  kids.push(p([t("Year allocation is a recommended sequence unless the framework fixes it.", { italics: true, size: 19, color: MUTED })]));
  for (const y of yrs) {
    kids.push(h2(yearLabel(y), acc));
    for (const u of d.yearMap[y]) {
      kids.push(p([t(u.unit, { bold: true, size: 22 })], { after: 40, keepNext: true }));
      (u.focus || []).forEach((f) => kids.push(bl(f)));
      const meta = [["Key terms", (u.keyTerms || []).join(" · ")], ["Check", u.assess], ["Builds on", u.prereq], ["Leads to", u.leadsTo]].filter(([, v]) => v);
      meta.forEach(([k, v]) => kids.push(p([t(`${k}: `, { bold: true, size: 19, color: acc }), t(v, { size: 19 })], { after: 30 })));
      kids.push(p([t(" ")], { after: 80 }));
    }
  }
  kids.push(h1("4  Progression across the years", acc));
  for (const th of d.progression || []) {
    kids.push(h2(th.thread, acc));
    Object.entries(th.steps || {}).forEach(([k, v]) => kids.push(p([t(`${/^\d/.test(k) ? `Year ${k}` : k}: `, { bold: true, color: acc }), t(v)], { after: 40 })));
  }
  kids.push(h1("5  Looking ahead", acc));
  kids.push(p([t(d.toKS4 || "Not recorded.")]));
  kids.push(h1("6  Cross-curricular links", acc));
  if ((d.links || []).length) kids.push(table(["Subject", "Topic", "Years", "How the subjects connect"], d.links.map((l) => [l.with, l.topic, l.years || "", l.how]), [1.4, 1.8, 0.9, 3.7], acc));
  kids.push(...sourcesSection(d, acc).map((x, i) => x));
  return build(kids, d, "Syllabus", acc);
}

export async function writeDoc(doc, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
}
