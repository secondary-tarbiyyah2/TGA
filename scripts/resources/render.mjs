// Term resources: an item (content/resources/items/<subject>/<year>/<id>.json) as branded A4 HTML,
// printed to PDF with Chromium (Playwright). Two documents per item when it has answers: the pupil
// copy (space to write, printable or for a drawing tablet) and a separate mark scheme for staff.
// Item format: docs/agent-briefs/BRIEF-RESOURCES.md ("Item format").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { gridSvg, esc } from "./grids.mjs";
import { ROOT, yearLabel, yearNum } from "./lib.mjs";
import { themeFor } from "../lessons/deck-parts.mjs";

const require = createRequire(import.meta.url);
const FONTS = path.join(ROOT, "src/app/fonts");
// The vector wordmark keeps each PDF small (a bitmap logo adds about 50 KB to every file).
const LOGO = `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, "public/brand/tga-logo.svg")).toString("base64")}`;
const font = (family, file, weight, range) => {
  const p = path.join(FONTS, file);
  return fs.existsSync(p) ? `@font-face{font-family:"${family}";src:url("file://${p}") format("woff2");font-weight:${weight};font-display:block;${range ? `unicode-range:${range};` : ""}}` : "";
};
const ARABIC_RANGE = "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF";
const FACES = [
  font("Amiri Pack", "amiri-arabic-400.woff2", "400", ARABIC_RANGE),
  font("Amiri Pack", "amiri-arabic-700.woff2", "700", ARABIC_RANGE),
  font("Amiri Pack", "amiri-latin-400.woff2", "400"),
  font("Amiri Pack", "amiri-latin-700.woff2", "700"),
].join("");

const TYPE_LABEL = {
  worksheet: "Worksheet",
  quiz: "Quiz",
  "test paper": "Test paper",
  "mock paper": "Mock paper",
  "mark scheme": "Mark scheme",
  "knowledge organiser": "Knowledge organiser",
  "writing frame": "Writing frame",
  "model text": "Reading text",
  "revision set": "Revision questions",
  "printable graph/grid": "Printable",
  "practical guide": "Practical guide",
};
const AR = /[؀-ۿ]/;
/** Text with any Arabic run wrapped so it gets the Arabic font and right-to-left order. */
const t = (s) =>
  esc(s)
    .replace(/([؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿\sً-ْـ،؛؟]*)/g, '<span class="ar" dir="rtl" lang="ar">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\uFDFA/g, '<span class="sws">\uFDFA</span>')
    .replace(/\n/g, "<br>");

const marksOf = (q) => Number(q.marks) || 0;
export const allQuestions = (item) => (item.blocks || []).flatMap((b) => b.questions || []);
export const totalMarks = (item) => allQuestions(item).reduce((n, q) => n + marksOf(q), 0);
export const hasAnswers = (item) => allQuestions(item).some((q) => q.a) || (item.blocks || []).some((b) => b.answers || (b.cards && b.answer) || (b.keywords && b.blank)) || (item.markScheme || []).length > 0;

function lines(n, early) {
  return `<div class="lines${early ? " wide" : ""}">${'<div class="ln"></div>'.repeat(Math.max(0, n))}</div>`;
}
const linesFor = (q, early) => {
  if (q.lines != null) return Number(q.lines);
  if (q.options) return 0;
  const m = marksOf(q);
  if (m) return Math.min(16, Math.max(2, Math.round(m * 1.6)));
  return /explain|describe|evaluate|justify|paragraph|why|compare|discuss/i.test(q.q) ? 5 : early ? 2 : 3;
};

function questionHtml(q, n, ctx) {
  const m = marksOf(q);
  const opts = Array.isArray(q.options) && q.options.length ? `<ol class="opts" type="A">${q.options.map((o) => `<li><span class="bubble"></span>${t(o)}</li>`).join("")}</ol>` : "";
  const extra = q.grid ? `<div class="fig">${gridSvg(q.grid)}</div>` : q.picture ? pictureHtml(q.picture, ctx) : "";
  const space = q.space === "box" ? `<div class="workbox" style="height:${q.height || 40}mm"></div>` : q.space === "none" ? "" : lines(linesFor(q, ctx.early), ctx.early);
  const sub = Array.isArray(q.parts) ? `<ol class="parts" type="a">${q.parts.map((p) => `<li><div class="qline"><span>${t(p.q)}</span>${marksOf(p) ? `<span class="mk">(${marksOf(p)})</span>` : ""}</div>${p.space === "box" ? `<div class="workbox" style="height:${p.height || 30}mm"></div>` : lines(linesFor(p, ctx.early), ctx.early)}</li>`).join("")}</ol>` : "";
  return `<div class="q"><div class="qline"><span class="qn">${n}</span><span class="qt">${t(q.q)}</span>${m && !q.parts ? `<span class="mk">(${m} mark${m === 1 ? "" : "s"})</span>` : ""}</div>${extra}${opts}${sub || space}${ctx.total && m && !q.parts ? "" : ""}</div>`;
}

function pictureHtml(p, ctx) {
  const pic = ctx.pictures?.(p);
  if (pic) return `<figure class="pic"><img src="${pic.src}" alt="${esc(p.alt || "")}">${p.labels ? `<div class="labels">${Array.from({ length: p.labels }, (_, i) => `<div class="lab"><b>${i + 1}</b><span></span></div>`).join("")}</div>` : ""}<figcaption>${esc(p.alt || "")}${pic.credit ? ` <span class="credit">${esc(pic.credit)}</span>` : ""}</figcaption></figure>`;
  return `<figure class="pic none"><div class="drawbox" style="height:${p.height || 70}mm"><span>${esc(p.draw || `Draw: ${p.alt || "the diagram from the lesson"}`)}</span></div>${p.labels ? `<div class="labels">${Array.from({ length: p.labels }, (_, i) => `<div class="lab"><b>${i + 1}</b><span></span></div>`).join("")}</div>` : ""}</figure>`;
}

function blockHtml(b, ctx) {
  if (b.h) return `<h2>${t(b.h)}</h2>${b.sub ? `<p class="sub">${t(b.sub)}</p>` : ""}`;
  if (b.text) return `<p class="txt">${t(b.text)}</p>`;
  if (b.caption && !b.grid) return `<p class="caption">${t(b.caption)}</p>`;
  if (b.bullets) return `<ul class="bul">${b.bullets.map((x) => `<li>${t(x)}</li>`).join("")}</ul>`;
  if (b.questions) {
    return `<div class="qs">${b.questions.map((q) => questionHtml(q, ++ctx.qn, ctx)).join("")}</div>`;
  }
  if (b.keywords) return `<table class="kw"><thead><tr><th>Key word</th><th>What it means</th></tr></thead><tbody>${b.keywords.map((k) => `<tr><td class="term">${t(k.term)}</td><td>${b.blank ? '<div class="ln"></div>' : t(k.def)}</td></tr>`).join("")}</tbody></table>`;
  if (b.panels) return `<div class="panels c${b.cols || 2}">${b.panels.map((p) => `<section class="panel"><h3>${t(p.title)}</h3>${p.text ? `<p>${t(p.text)}</p>` : ""}${p.points ? `<ul>${p.points.map((x) => `<li>${t(x)}</li>`).join("")}</ul>` : ""}${p.arabic ? `<p class="ar big" dir="rtl" lang="ar">${esc(p.arabic)}</p>` : ""}</section>`).join("")}</div>`;
  if (b.table) {
    const tb = b.table;
    const blank = Array.from({ length: tb.blankRows || 0 }, () => `<tr>${tb.head.map(() => "<td class=\"blank\"></td>").join("")}</tr>`).join("");
    return `<table class="tbl${tb.tall ? " tall" : ""}">${tb.head ? `<thead><tr>${tb.head.map((h, i) => `<th${tb.widths ? ` style="width:${tb.widths[i]}%"` : ""}>${t(h)}</th>`).join("")}</tr></thead>` : ""}<tbody>${(tb.rows || []).map((r) => `<tr>${r.map((c) => `<td${c === "" ? ' class="blank"' : ""}>${t(c)}</td>`).join("")}</tr>`).join("")}${blank}</tbody></table>`;
  }
  if (b.frame)
    return `<div class="frame">${b.frame.map((f, i) => `<section class="fbox"><div class="fhead"><span class="fnum">${i + 1}</span><span class="flabel">${t(f.label)}</span></div>${f.prompt ? `<p class="fprompt">${t(f.prompt)}</p>` : ""}${f.starters?.length ? `<p class="fstart">${f.starters.map((s) => `<span>${t(s)}</span>`).join("")}</p>` : ""}${lines(f.lines ?? 4, ctx.early)}</section>`).join("")}</div>`;
  if (b.starters) return `<div class="starters"><h3>${t(b.title || "Sentence starters")}</h3><ul>${b.starters.map((s) => `<li>${t(s)}</li>`).join("")}</ul></div>`;
  if (b.arabic) {
    const a = b.arabic;
    const text = a.spaced ? esc(a.text).split(/\s+/).join('<span class="gap"> </span>') : esc(a.text);
    return `<div class="arabic-block${a.quran ? " quran" : ""}"><p class="ar" dir="rtl" lang="ar" style="font-size:${a.size || (a.quran ? 22 : 18)}pt">${text}</p>${a.ref ? `<p class="ref">${t(a.ref)}</p>` : ""}${a.translation ? `<p class="tr">${t(a.translation)}</p>` : ""}</div>`;
  }
  if (b.trace) {
    // Arabic letters or words, large: pale to trace over (trace: true) or dark to read and colour, each with an empty box to copy into.
    const tr = b.trace;
    const cells = (tr.items || []).map((w) => `<td class="tr-cell${tr.trace === false ? " read" : ""}"><span class="ar" dir="rtl" lang="ar">${esc(w)}</span></td>${tr.copy === false ? "" : '<td class="tr-cell empty"></td>'}`);
    const perRow = tr.cols || (tr.copy === false ? 4 : 2);
    const rows = [];
    for (let i = 0; i < cells.length; i += perRow) rows.push(`<tr>${cells.slice(i, i + perRow).join("")}</tr>`);
    return `${tr.title ? `<h3>${t(tr.title)}</h3>` : ""}<table class="trace">${rows.join("")}</table>`;
  }
  if (b.grid) return `<div class="fig${b.grid.kind === "periodic" ? " wide" : ""}">${gridSvg(b.grid)}</div>${b.caption ? `<p class="caption">${t(b.caption)}</p>` : ""}`;
  if (b.cards) return `${b.title ? `<h3>${t(b.title)}</h3>` : ""}<div class="fig">${gridSvg({ kind: "cards", items: b.cards, cols: b.cols || 3, height: b.height || 26, size: b.size || 4.6 })}</div><p class="caption">Cut out the cards along the dashed lines${b.task ? `, then ${t(b.task)}` : "."}</p>`;
  if (b.picture) return pictureHtml(b.picture, ctx);
  if (b.practical) {
    const p = b.practical;
    return `<div class="practical">${p.aim ? `<p class="aim"><b>Aim:</b> ${t(p.aim)}</p>` : ""}<div class="pcols"><section><h3>You need</h3><ul>${(p.equipment || []).map((x) => `<li>${t(x)}</li>`).join("")}</ul></section><section class="safety"><h3>Stay safe</h3><ul>${(p.safety || []).map((x) => `<li>${t(x)}</li>`).join("")}</ul>${p.adult ? `<p class="adult">${t(p.adult)}</p>` : ""}</section></div><h3>What to do</h3><ol class="method">${(p.method || []).map((x) => `<li>${t(x)}</li>`).join("")}</ol></div>`;
  }
  if (b.passage) {
    const p = b.passage;
    let ln = 0;
    const paras = p.paras.map((x) => (p.lineNumbers ? `<p><span class="pn">${++ln}</span>${t(x)}</p>` : `<p>${t(x)}</p>`)).join("");
    return `<article class="passage">${p.title ? `<h3>${t(p.title)}</h3>` : ""}${p.byline ? `<p class="byline">${t(p.byline)}</p>` : ""}${paras}${p.source ? `<p class="src">${t(p.source)}</p>` : ""}</article>`;
  }
  if (b.model) return `<article class="model">${b.model.title ? `<h3>${t(b.model.title)}</h3>` : ""}${b.model.parts.map((p) => `<p>${p.label ? `<span class="tag">${t(p.label)}</span>` : ""}${t(p.text)}</p>`).join("")}</article>`;
  if (b.box) return `<section class="box">${b.box.title ? `<h3>${t(b.box.title)}</h3>` : ""}${b.box.lines ? lines(b.box.lines, ctx.early) : `<div class="workbox" style="height:${b.box.height || 60}mm"></div>`}</section>`;
  if (b.timeline) return `<ol class="timeline">${b.timeline.map((x) => `<li><span class="when">${t(x.label)}</span><span>${x.text ? t(x.text) : '<span class="ln inline"></span>'}</span></li>`).join("")}</ol>`;
  if (b.checklist) return `<ul class="check">${b.checklist.map((x) => `<li><span class="tick"></span>${t(x)}</li>`).join("")}</ul>`;
  if (b.tracker) {
    const tr = b.tracker;
    return `<table class="tbl tracker"><thead><tr><th>${t(tr.corner || "")}</th>${tr.cols.map((c) => `<th>${t(c)}</th>`).join("")}</tr></thead><tbody>${tr.rows.map((r) => `<tr><td class="term">${t(r)}</td>${tr.cols.map(() => '<td class="blank"></td>').join("")}</tr>`).join("")}</tbody></table>`;
  }
  if (b.note) return ""; // teacher notes go in the mark scheme only
  if (b.pagebreak) return '<div class="pb"></div>';
  if (b.answers) return "";
  return "";
}

const CSS = (accent, soft, early) => `${FACES}
@page{size:A4;margin:14mm 14mm 16mm 14mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Carlito,Calibri,"Liberation Sans",Arial,sans-serif;font-size:${early ? 13.5 : 10.5}pt;line-height:1.42;color:#1B1E21}
.ar{font-family:"Amiri Pack",Amiri,"Noto Naskh Arabic",serif;font-size:1.25em;line-height:1.9}
.top{display:flex;align-items:center;justify-content:space-between;border-bottom:2pt solid ${accent};padding-bottom:3mm;margin-bottom:4mm}
.top img{height:11mm}
.top .meta{text-align:right;font-size:8.5pt;color:#5B6168;line-height:1.35}
.top .kind{display:inline-block;background:${accent};color:#fff;border-radius:3mm;padding:.6mm 3mm;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:7.5pt;margin-bottom:1mm}
h1{font-size:${early ? 22 : 18}pt;line-height:1.15;margin:0 0 2mm;color:#1B1E21}
h1:after{content:"";display:block;width:16mm;border-bottom:2.2pt solid #B8892B;margin-top:2mm}
.who{display:flex;gap:6mm;margin:3mm 0 4mm;font-size:${early ? 12 : 9.5}pt;color:#3A3F45}
.who span{flex:1;border-bottom:.6pt solid #8C877C;padding-bottom:1mm;white-space:nowrap}
.who span.short{flex:.55}
.intro{background:${soft};border-left:3pt solid ${accent};padding:2.5mm 4mm;margin:0 0 4mm;border-radius:0 2mm 2mm 0}
.intro p{margin:0}
.marks-total{font-weight:700;color:${accent}}
h2{font-size:${early ? 15 : 12.5}pt;color:${accent};text-transform:uppercase;letter-spacing:.08em;border-bottom:1pt solid ${accent};padding-bottom:1mm;margin:5mm 0 3mm;break-after:avoid}
h3{font-size:${early ? 13 : 11}pt;margin:2mm 0 1.5mm;color:#1B1E21}
p.sub{margin:-1.5mm 0 3mm;color:#5B6168}
.txt{margin:0 0 3mm}
.bul{margin:0 0 3mm 5mm;padding:0}
.q{margin:0 0 4mm;break-inside:avoid}
.qline{display:flex;gap:2.5mm;align-items:baseline}
.qn{font-weight:700;color:${accent};min-width:6mm}
.qt{flex:1}
.mk{white-space:nowrap;font-size:8.5pt;color:#5B6168;font-weight:600}
.lines .ln{border-bottom:.5pt solid #B9B3A5;height:${early ? 11 : 8.5}mm}
.lines{margin-left:8.5mm}
.ln.inline{display:inline-block;width:60mm;height:5mm;border-bottom:.5pt solid #B9B3A5}
.workbox{border:.6pt solid #B9B3A5;border-radius:2mm;margin:2mm 0 0 8.5mm;background:repeating-linear-gradient(0deg,transparent 0 4.8mm,#F1EDE3 4.8mm 5mm),repeating-linear-gradient(90deg,transparent 0 4.8mm,#F1EDE3 4.8mm 5mm)}
.opts{list-style:upper-alpha;margin:2mm 0 0 8.5mm;padding-left:6mm;display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 6mm}
.opts .bubble{display:inline-block;width:3.6mm;height:3.6mm;border:.6pt solid #1B1E21;border-radius:50%;margin-right:2mm;vertical-align:-0.6mm}
.parts{margin:2mm 0 0 8.5mm;padding-left:5mm}
.parts li{margin-bottom:2mm}
.fig{margin:2mm 0 3mm;text-align:center;break-inside:avoid}
.fig svg{max-width:100%;height:auto}
.caption{font-size:8.5pt;color:#5B6168;text-align:center;margin:-1mm 0 3mm}
table{border-collapse:collapse;width:100%;margin:0 0 4mm;break-inside:auto}
th{background:${accent};color:#fff;text-align:left;padding:1.6mm 2.5mm;font-size:9pt}
td{border:.5pt solid #D9D3C5;padding:1.8mm 2.5mm;vertical-align:top}
tr{break-inside:avoid}
tbody tr:nth-child(even) td{background:#FBF7EE}
td.term{font-weight:700;width:30%}
td.blank{height:10mm;background:#fff!important}
.tbl.tall td.blank{height:18mm}
.tracker td.blank{height:9mm}
.kw td .ln{border-bottom:.5pt solid #B9B3A5;height:7mm}
.panels{display:grid;gap:3mm;margin-bottom:4mm}
.panels.c2{grid-template-columns:1fr 1fr}
.panels.c3{grid-template-columns:1fr 1fr 1fr}
.panels.c1{grid-template-columns:1fr}
.panel{border:.7pt solid ${accent};border-radius:2.5mm;padding:2.5mm 3.5mm;break-inside:avoid;background:#fff}
.panel h3{color:${accent};margin-top:0;font-size:10.5pt;text-transform:uppercase;letter-spacing:.05em}
.panel ul{margin:0;padding-left:4.5mm}
.panel li{margin-bottom:.8mm}
.panel p{margin:0 0 1mm}
.frame .fbox{border:.7pt solid #D9D3C5;border-left:3pt solid ${accent};border-radius:0 2mm 2mm 0;padding:2mm 3.5mm 1mm;margin-bottom:3mm;break-inside:avoid}
.fhead{display:flex;gap:2.5mm;align-items:center}
.fnum{background:${accent};color:#fff;border-radius:50%;width:6mm;height:6mm;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:8.5pt}
.flabel{font-weight:700}
.fprompt{margin:1mm 0 0;color:#5B6168;font-size:9pt}
.fstart{margin:1mm 0 0;font-size:9pt}
.fstart span{display:inline-block;background:${soft};border-radius:1.5mm;padding:.4mm 2mm;margin:0 1.5mm 1mm 0;font-style:italic}
.frame .lines{margin-left:0}
.starters{background:${soft};border-radius:2mm;padding:2mm 4mm;margin-bottom:4mm;break-inside:avoid}
.starters h3{margin-top:0}
.starters ul{margin:0;padding-left:5mm;columns:2;column-gap:8mm}
.arabic-block{text-align:center;border:.7pt solid ${accent};border-radius:3mm;padding:3mm 5mm;margin:0 0 4mm;background:#fff;break-inside:avoid}
.arabic-block .ar{margin:0;line-height:2.1;font-size:20pt}
.arabic-block .gap{display:inline-block;width:6mm}
.arabic-block .ref{margin:1mm 0 0;font-size:8.5pt;color:#5B6168}
.arabic-block .tr{margin:1.5mm 0 0;font-style:italic}
.pic{margin:2mm 0 4mm;text-align:center;break-inside:avoid}
.pic img{max-width:100%;max-height:105mm;border-radius:2mm}
.pic figcaption{font-size:8.5pt;color:#5B6168;margin-top:1mm}
.pic .credit{font-size:7pt;color:#8C877C}
.drawbox{border:.8pt dashed #B9B3A5;border-radius:3mm;display:flex;align-items:flex-start;justify-content:flex-start;padding:2mm 3mm;color:#8C877C;font-size:9pt}
.labels{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 6mm;margin-top:2mm;text-align:left}
.lab{display:flex;gap:2mm;align-items:flex-end}
.lab b{color:${accent}}
.lab span{flex:1;border-bottom:.5pt solid #B9B3A5;height:7mm}
.practical .aim{background:${soft};padding:2mm 3.5mm;border-radius:2mm}
.pcols{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.pcols ul{padding-left:5mm;margin:0}
.safety{border:.8pt solid #C0601C;border-radius:2mm;padding:1mm 3mm 2mm;background:#FBEBDD}
.safety h3{color:#8A3B0E}
.adult{font-weight:700;margin:1.5mm 0 0;color:#8A3B0E}
.method{padding-left:6mm}
.method li{margin-bottom:1.5mm}
.passage{border:.7pt solid #D9D3C5;border-radius:2.5mm;padding:3mm 5mm;margin-bottom:4mm;background:#fff}
.passage h3{margin-top:0;font-size:12pt}
.passage p{margin:0 0 2mm;text-align:justify;position:relative}
.passage .pn{position:absolute;left:-4.5mm;font-size:7pt;color:#8C877C;top:.8mm}
.passage .byline{font-style:italic;color:#5B6168}
.passage .src{font-size:8pt;color:#8C877C;font-style:italic}
.model{border:.7pt solid ${accent};border-radius:2.5mm;padding:3mm 4mm;margin-bottom:4mm;background:#fff}
.model h3{margin-top:0}
.model p{margin:0 0 2mm}
.model .tag{display:inline-block;background:${accent};color:#fff;border-radius:1.5mm;padding:0 1.8mm;font-size:7.5pt;font-weight:700;margin-right:2mm;text-transform:uppercase;letter-spacing:.04em}
.box{margin-bottom:4mm;break-inside:avoid}
.box .workbox{margin-left:0}
.box .lines{margin-left:0}
.timeline{list-style:none;padding:0;margin:0 0 4mm;border-left:2pt solid ${accent}}
.timeline li{display:flex;gap:4mm;padding:1.5mm 0 1.5mm 4mm;position:relative}
.timeline li:before{content:"";position:absolute;left:-2.2mm;top:3mm;width:2.4mm;height:2.4mm;border-radius:50%;background:#B8892B}
.timeline .when{font-weight:700;min-width:24mm}
.check{list-style:none;padding:0;margin:0 0 4mm}
.check li{display:flex;gap:3mm;align-items:flex-start;margin-bottom:2mm}
.tick{width:4.5mm;height:4.5mm;border:.7pt solid #1B1E21;border-radius:1mm;flex:none;margin-top:.5mm}
.pb{break-after:page}
.sws{font-family:"Noto Naskh Arabic","Scheherazade New","Noto Sans Arabic",serif;font-size:1.15em}
table.trace{border-collapse:separate;border-spacing:2mm;margin:0 0 3mm}
.tr-cell{border:.6pt dashed #B9B3A5!important;background:#fff!important;text-align:center;height:30mm;width:25%}
.tr-cell .ar{font-size:44pt;color:#D2CCBE;line-height:1.3}
.tr-cell.read .ar{color:#1B1E21;font-size:34pt}
.tr-cell.empty{border-style:solid!important;border-color:#E3DED2!important}
.ms .ans{background:#E4F3EA;border-radius:1.5mm;padding:1.5mm 3mm;margin:1mm 0 2mm 8.5mm}
.ms .model-ans{background:${soft};border-radius:1.5mm;padding:1.5mm 3mm;margin:0 0 2mm 8.5mm;font-size:9.5pt}
.ms .teacher{background:#FBF7EE;border:.6pt solid #E3DED2;border-radius:2mm;padding:2mm 3.5mm;margin-bottom:3mm}
.ms .q{margin-bottom:2.5mm}
.secret{color:#8A3B0E;font-weight:700;font-size:8pt;letter-spacing:.08em;text-transform:uppercase}
`;

function header(item, kind) {
  const th = themeFor(item.subjectSlug);
  const yl = yearLabel(item.year);
  return `<header class="top"><img src="${LOGO}" alt="Tarbiyyah Global Academy"><div class="meta"><div class="kind">${esc(kind || TYPE_LABEL[item.type] || "Resource")}</div><div>${esc(item.subject)} · ${esc(yl)}${item.board ? ` · ${esc(item.board)}` : ""}</div>${item.unit ? `<div>${esc(String(item.unit).replace(/^(spring|summer|autumn) (\d):\s*/i, (m, a, b) => `${a[0].toUpperCase()}${a.slice(1)} ${b}: `))}</div>` : ""}</div></header>${th ? "" : ""}`;
}

/** The pupil copy. */
export function pupilHtml(item, opts = {}) {
  const th = themeFor(item.subjectSlug);
  const accent = `#${th.accent}`;
  const soft = `#${th.soft || "F4F1EA"}`;
  const early = yearNum(item.year) > 0 && yearNum(item.year) <= 2;
  const ctx = { qn: 0, early, pictures: opts.pictures, total: totalMarks(item) };
  const exam = ["test paper", "mock paper", "quiz", "revision set"].includes(item.type) && ctx.total > 0;
  const who = item.type === "knowledge organiser" || item.type === "model text" || item.type === "printable graph/grid" ? (item.name === false ? "" : `<div class="who"><span>Name</span></div>`) : `<div class="who"><span>Name</span><span class="short">Date</span>${exam ? `<span class="short">Marks: &nbsp;&nbsp;&nbsp;&nbsp; / ${ctx.total}</span>` : ""}</div>`;
  const intro = item.intro || exam ? `<div class="intro"><p>${item.intro ? t(item.intro) : ""}${exam ? `${item.intro ? " " : ""}<span class="marks-total">Total: ${ctx.total} marks${item.time ? `. Time: ${esc(item.time)}` : ""}.</span>` : ""}</p></div>` : "";
  const body = (item.blocks || []).map((b) => blockHtml(b, ctx)).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(item.title)}</title><style>${CSS(accent, soft, early)}</style></head><body>${header(item)}<h1>${t(item.title)}</h1>${who}${intro}${body}</body></html>`;
}

/** The staff copy: every answer, model and mark, plus teacher notes. */
export function markSchemeHtml(item) {
  const th = themeFor(item.subjectSlug);
  const accent = `#${th.accent}`;
  const soft = `#${th.soft || "F4F1EA"}`;
  let n = 0;
  const parts = [];
  for (const b of item.blocks || []) {
    if (b.h) parts.push(`<h2>${t(b.h)}</h2>`);
    if (b.note) parts.push(`<div class="teacher"><b>Teacher note:</b> ${t(b.note)}</div>`);
    if (b.questions)
      for (const q of b.questions) {
        n++;
        const m = marksOf(q);
        const sub = Array.isArray(q.parts) ? `<ol class="parts" type="a">${q.parts.map((p) => `<li>${t(p.q)}${marksOf(p) ? ` <span class="mk">(${marksOf(p)})</span>` : ""}<div class="ans">${t(p.a || "Accept any reasonable answer.")}</div></li>`).join("")}</ol>` : "";
        const opt = Array.isArray(q.options) && q.options.length ? ` <span class="mk">(options: ${q.options.map((o, i) => `${"ABCDEF"[i]}) ${esc(o)}`).join("; ")})</span>` : "";
        parts.push(`<div class="q"><div class="qline"><span class="qn">${n}</span><span class="qt">${t(q.q)}${opt}</span>${m ? `<span class="mk">(${m} mark${m === 1 ? "" : "s"})</span>` : ""}</div>${sub || `<div class="ans">${q.a ? t(q.a) : "Accept any reasonable answer that answers the question."}</div>`}${q.model ? `<div class="model-ans"><b>Model / working:</b> ${t(q.model)}</div>` : ""}</div>`);
      }
    if (b.keywords && b.blank) parts.push(`<table class="kw"><thead><tr><th>Key word</th><th>Answer</th></tr></thead><tbody>${b.keywords.map((k) => `<tr><td class="term">${t(k.term)}</td><td>${t(k.def)}</td></tr>`).join("")}</tbody></table>`);
    if (b.cards && b.answer) parts.push(`<div class="teacher"><b>Card sort answer:</b> ${t(b.answer)}</div>`);
    if (b.answers) parts.push(`<div class="teacher">${t(b.answers)}</div>`);
  }
  for (const x of item.markScheme || []) parts.push(`<div class="q"><div class="qline"><span class="qt"><b>${t(x.q)}</b></span>${x.marks ? `<span class="mk">(${x.marks} marks)</span>` : ""}</div><div class="ans">${t(x.a)}</div></div>`);
  const total = totalMarks(item);
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(item.title)}: mark scheme</title><style>${CSS(accent, soft, false)}</style></head><body class="ms">${header(item, "Mark scheme")}<p class="secret">Staff only: do not share with pupils before they sit it</p><h1>${t(item.title)}: mark scheme</h1>${total ? `<div class="intro"><p><span class="marks-total">Total: ${total} marks.</span>${/\b[MAB]1\b/.test(JSON.stringify(item.blocks)) ? " Award method marks (M) for a correct method even if the answer is wrong; accuracy marks (A) need the correct answer; B marks are independent." : " Award marks for each correct point; for longer answers, use the levels given."}</p></div>` : ""}${parts.join("")}</body></html>`;
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────
let browserP = null;
async function browser() {
  if (!browserP) {
    const { chromium } = require("playwright");
    browserP = chromium.launch();
  }
  return browserP;
}
export async function closeBrowser() {
  if (browserP) await (await browserP).close();
  browserP = null;
}
const foot = (s) => `<div style="width:100%;font-family:Carlito,Calibri,Arial,sans-serif;font-size:7pt;color:#8C877C;margin:0 14mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact"><span>Tarbiyyah Global Academy · ${esc(s)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
export async function htmlToPdf(html, file, footer) {
  const b = await browser();
  const page = await b.newPage();
  const tmp = path.join(os.tmpdir(), `tga-res-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html);
  try {
    await page.goto(`file://${tmp}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: foot(footer) });
  } finally {
    await page.close();
    fs.rmSync(tmp, { force: true });
  }
}
export { TYPE_LABEL, AR };
