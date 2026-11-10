// A Word copy of a term resource, for staff to edit (tests, mocks, quizzes, question sets, frames).
// Text-first: questions with marks and answer lines, frames, tables and passages. Grids and
// pictures are listed as "see the PDF" so the Word copy stays simple to edit.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, yearLabel } from "./lib.mjs";
import { themeFor } from "../lessons/deck-parts.mjs";
import { totalMarks } from "./render.mjs";

const require = createRequire(import.meta.url);
const { AlignmentType, BorderStyle, Document, Footer, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = require("docx");
const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const INK = "1B1E21";
const MUTED = "5B6168";
const PAGE_W = 11906;
const MARGIN = 850;
const CW = PAGE_W - MARGIN * 2;
const AR = /[؀-ۿ]/;
const run = (s, o = {}) => new TextRun({ text: String(s ?? ""), font: AR.test(String(s ?? "")) ? "Amiri" : "Calibri", size: o.size || 22, bold: o.bold, italics: o.italics, color: o.color || INK, rightToLeft: AR.test(String(s ?? "")) && !/[A-Za-z]/.test(String(s ?? "")) });
const para = (kids, o = {}) => new Paragraph({ children: Array.isArray(kids) ? kids : [kids], spacing: { before: o.before ?? 0, after: o.after ?? 100, line: 276 }, alignment: o.align, bidirectional: o.rtl, keepNext: o.keepNext, indent: o.indent, border: o.border });
const writeLine = () => para([run("")], { after: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "B9B3A5", space: 8 } }, indent: { left: 360 } });
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D3C5" };
const table = (head, rows, accent) => {
  const n = Math.max(head?.length || 0, ...rows.map((r) => r.length));
  const w = Math.floor(CW / Math.max(1, n));
  const cell = (s, hdr) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: hdr ? { type: ShadingType.CLEAR, fill: accent, color: "auto" } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: border, bottom: border, left: border, right: border }, children: [para([run(s, hdr ? { bold: true, color: "FFFFFF", size: 20 } : { size: 20 })], { after: 20 })] });
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: Array(n).fill(w), layout: TableLayoutType.FIXED, rows: [...(head ? [new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) })] : []), ...rows.map((r) => new TableRow({ cantSplit: true, children: Array.from({ length: n }, (_, i) => cell(r[i] ?? "")) }))] });
};

export async function writeDocx(item, file) {
  const th = themeFor(item.subjectSlug);
  const accent = th.accent;
  const kids = [];
  kids.push(para([new ImageRun({ type: "png", data: LOGO, transformation: { width: 170, height: Math.round((170 * 241) / 810) } })], { after: 160 }));
  kids.push(para([run(`${item.subject} · ${yearLabel(item.year)}${item.unit ? ` · ${item.unit}` : ""}`, { size: 18, color: MUTED })], { after: 60 }));
  kids.push(para([run(item.title, { size: 36, bold: true })], { after: 120, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 4 } } }));
  const total = totalMarks(item);
  kids.push(para([run("Name: ____________________________    Date: ______________" + (total ? `    Marks: ____ / ${total}` : ""), { size: 20 })], { after: 160 }));
  if (item.intro || total) kids.push(para([run(`${item.intro || ""}${total ? ` Total: ${total} marks${item.time ? `. Time: ${item.time}` : ""}.` : ""}`.trim(), { italics: true })], { after: 160 }));
  let n = 0;
  for (const b of item.blocks || []) {
    if (b.h) kids.push(para([run(b.h.toUpperCase(), { bold: true, color: accent, size: 24 })], { before: 200, after: 100, keepNext: true }));
    if (b.text) kids.push(para([run(b.text)]));
    if (b.bullets) for (const x of b.bullets) kids.push(para([run(`• ${x}`)], { indent: { left: 360 } }));
    if (b.questions)
      for (const q of b.questions) {
        n++;
        const m = Number(q.marks) || 0;
        kids.push(para([run(`${n}.  `, { bold: true, color: accent }), run(q.q), ...(m ? [run(`   (${m} mark${m === 1 ? "" : "s"})`, { size: 18, color: MUTED, bold: true })] : [])], { before: 120, keepNext: true }));
        if (q.options) q.options.forEach((o, i) => kids.push(para([run(`${"ABCDEF"[i]})  ${o}`)], { indent: { left: 720 }, after: 40 })));
        for (const p of q.parts || []) {
          kids.push(para([run(p.q), ...(p.marks ? [run(`   (${p.marks})`, { size: 18, color: MUTED })] : [])], { indent: { left: 360 } }));
          for (let i = 0; i < (p.lines ?? 3); i++) kids.push(writeLine());
        }
        if (!q.options && !q.parts) for (let i = 0; i < (q.lines ?? (m ? Math.min(12, Math.max(2, Math.round(m * 1.6))) : 3)); i++) kids.push(writeLine());
        if (q.grid || q.picture) kids.push(para([run("(Diagram or grid: see the PDF copy.)", { italics: true, color: MUTED, size: 18 })]));
      }
    if (b.keywords) kids.push(table(["Key word", "What it means"], b.keywords.map((k) => [k.term, b.blank ? "" : k.def]), accent));
    if (b.panels) for (const p of b.panels) kids.push(para([run(p.title, { bold: true, color: accent })], { before: 100 }), ...(p.text ? [para([run(p.text)])] : []), ...(p.points || []).map((x) => para([run(`• ${x}`)], { indent: { left: 360 }, after: 40 })));
    if (b.table) kids.push(table(b.table.head, [...(b.table.rows || []), ...Array.from({ length: b.table.blankRows || 0 }, () => b.table.head.map(() => ""))], accent));
    if (b.tracker) kids.push(table([b.tracker.corner || "", ...b.tracker.cols], b.tracker.rows.map((r) => [r, ...b.tracker.cols.map(() => "")]), accent));
    if (b.frame)
      b.frame.forEach((f, i) => {
        kids.push(para([run(`${i + 1}. ${f.label}`, { bold: true, color: accent })], { before: 140, keepNext: true }));
        if (f.prompt) kids.push(para([run(f.prompt, { italics: true, color: MUTED })]));
        if (f.starters?.length) kids.push(para([run(`Starters: ${f.starters.join(" / ")}`, { italics: true, size: 20 })]));
        for (let k = 0; k < (f.lines ?? 4); k++) kids.push(writeLine());
      });
    if (b.starters) kids.push(para([run(b.title || "Sentence starters", { bold: true })]), ...b.starters.map((s) => para([run(`• ${s}`, { italics: true })], { indent: { left: 360 }, after: 40 })));
    if (b.arabic) kids.push(para([run(b.arabic.text, { size: 36 })], { align: AlignmentType.CENTER, rtl: true }), ...(b.arabic.ref ? [para([run(b.arabic.ref, { size: 18, color: MUTED })], { align: AlignmentType.CENTER })] : []), ...(b.arabic.translation ? [para([run(b.arabic.translation, { italics: true })], { align: AlignmentType.CENTER })] : []));
    if (b.passage) kids.push(...(b.passage.title ? [para([run(b.passage.title, { bold: true, size: 24 })])] : []), ...b.passage.paras.map((x) => para([run(x)], { align: AlignmentType.JUSTIFIED })));
    if (b.model) kids.push(...(b.model.title ? [para([run(b.model.title, { bold: true })])] : []), ...b.model.parts.map((p) => para([...(p.label ? [run(`${p.label.toUpperCase()}: `, { bold: true, color: accent, size: 18 })] : []), run(p.text)])));
    if (b.checklist) kids.push(...b.checklist.map((x) => para([run(`☐  ${x}`)], { indent: { left: 360 } })));
    if (b.timeline) kids.push(table(["When", "What happened"], b.timeline.map((x) => [x.label, x.text || ""]), accent));
    if (b.practical) {
      const p = b.practical;
      if (p.aim) kids.push(para([run("Aim: ", { bold: true }), run(p.aim)]));
      kids.push(para([run("You need", { bold: true, color: accent })]), ...(p.equipment || []).map((x) => para([run(`• ${x}`)], { indent: { left: 360 }, after: 40 })));
      kids.push(para([run("Stay safe", { bold: true, color: "8A3B0E" })]), ...(p.safety || []).map((x) => para([run(`• ${x}`)], { indent: { left: 360 }, after: 40 })));
      kids.push(para([run("What to do", { bold: true, color: accent })]), ...(p.method || []).map((x, i) => para([run(`${i + 1}. ${x}`)], { indent: { left: 360 }, after: 40 })));
    }
    if (b.box) {
      if (b.box.title) kids.push(para([run(b.box.title, { bold: true })]));
      for (let k = 0; k < (b.box.lines || 6); k++) kids.push(writeLine());
    }
    if (b.grid || b.cards || b.picture) kids.push(para([run("(Printable grid, cards or picture: see the PDF copy.)", { italics: true, color: MUTED, size: 18 })]));
  }
  const doc = new Document({
    creator: "Tarbiyyah Global Academy",
    title: item.title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 800, bottom: 800, left: MARGIN, right: MARGIN } } },
        footers: { default: new Footer({ children: [para([run(`Tarbiyyah Global Academy · ${item.title} · page `, { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED })])] }) },
        children: kids,
      },
    ],
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
}
