// Turns a document model (model.mjs) into print-ready HTML for Chromium's PDF engine.
// A4 portrait for prose and unit pages, A4 landscape for the grids; the cover and the running
// header and footer are added by render-pdf.mjs.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib.mjs";

const require = createRequire(import.meta.url);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (s) => esc(s).replace(/\n/g, "<br>");

/** @font-face rules for the bundled fonts (npm @fontsource packages), or nothing if they are not installed. */
function fontFaces() {
  const out = [];
  const add = (pkg, file, family, weight, style = "normal", range = "") => {
    try {
      const p = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files", file);
      if (fs.existsSync(p)) out.push(`@font-face{font-family:"${family}";src:url("file://${p}") format("woff2");font-weight:${weight};font-style:${style};font-display:block;${range ? `unicode-range:${range};` : ""}}`);
    } catch {
      /* not installed: system fonts are used */
    }
  };
  add("@fontsource-variable/inter", "inter-latin-wght-normal.woff2", "Inter Pack", "100 900");
  add("@fontsource-variable/inter", "inter-latin-ext-wght-normal.woff2", "Inter Pack", "100 900");
  add("@fontsource-variable/inter", "inter-latin-wght-italic.woff2", "Inter Pack", "100 900", "italic");
  add("@fontsource-variable/source-serif-4", "source-serif-4-latin-wght-normal.woff2", "Serif Pack", "200 900");
  add("@fontsource-variable/source-serif-4", "source-serif-4-latin-ext-wght-normal.woff2", "Serif Pack", "200 900");
  add("@fontsource/amiri", "amiri-arabic-400-normal.woff2", "Amiri Pack", "400", "normal", "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF");
  add("@fontsource/amiri", "amiri-arabic-700-normal.woff2", "Amiri Pack", "700", "normal", "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF");
  return out.join("\n");
}

const hex = (h) => `#${String(h).replace(/^#/, "")}`;
function mix(h, t) {
  const n = parseInt(String(h).replace(/^#/, ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Eight-point star tiling (the school's motif), drawn very faintly on the cover. */
const starPattern = (stroke) => `<svg class="pattern" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><pattern id="st" width="56" height="56" patternUnits="userSpaceOnUse"><g fill="none" stroke="${stroke}" stroke-width="1"><rect x="14" y="14" width="28" height="28"/><rect x="14" y="14" width="28" height="28" transform="rotate(45 28 28)"/><circle cx="28" cy="28" r="6"/><path d="M0 0L14 14M56 0L42 14M0 56L14 42M56 56L42 42"/></g></pattern></defs><rect width="100%" height="100%" fill="url(#st)"/></svg>`;

const CSS = (d) => `
${fontFaces()}
:root{--acc:${hex(d.accent)};--acc-dk:${hex(d.dark)};--acc-soft:${mix(d.accent, 0.9)};--acc-softer:${mix(d.accent, 0.95)};--ink:#1B1E21;--body:#2E3338;--muted:#5B6168;--gold:#B08E45;--gold-dk:#7D6428;--gold-soft:#F5ECD6;--cream:#FBF7EE;--line:#E3DED2;--line-dk:#CFC7B4}
@page{size:A4;margin:22mm 17mm 20mm 17mm}
@page wide{size:A4 landscape;margin:20mm 14mm 17mm 14mm}
@page cover{margin:0}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Inter Pack",Inter,Carlito,"Liberation Sans",Arial,"Amiri Pack","Noto Naskh Arabic",sans-serif;font-size:9.4pt;line-height:1.48;color:var(--body);font-feature-settings:"cv11","ss01"}
h1,h2,h3,h4{font-family:"Serif Pack","Source Serif 4",Georgia,"DejaVu Serif",serif;color:var(--ink);font-weight:650;margin:0}
p{margin:0 0 6pt}
ul{margin:0;padding-left:12pt}
li{margin:0 0 2.5pt}
li::marker{color:var(--acc)}
.mk{font-size:1px;color:#fff;line-height:1px}
/* cover */
.cover{page:cover;width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--cream);break-after:page}
.cover .top{position:absolute;left:22mm;right:22mm;top:22mm;display:flex;justify-content:space-between;align-items:center}
.cover .top img{height:15mm}
.cover .top span{font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.cover .main{position:absolute;left:22mm;right:22mm;top:78mm}
.cover .kicker{font-size:10pt;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--acc)}
.cover h1{font-size:46pt;line-height:1.04;margin:5mm 0 6mm;letter-spacing:-.01em}
.cover .sub{font-size:14pt;color:var(--gold-dk);line-height:1.35;max-width:150mm}
.cover .rule{width:28mm;height:2pt;background:var(--gold);margin:10mm 0 8mm}
.cover dl{display:grid;grid-template-columns:34mm 1fr;gap:2.4mm 6mm;margin:0;max-width:160mm}
.cover dt{font-size:8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding-top:1pt}
.cover dd{margin:0;font-size:10.5pt;color:var(--ink)}
.cover .band{position:absolute;left:0;right:0;bottom:0;height:52mm;background:var(--acc-dk);color:#fff}
.cover .band .pattern{position:absolute;inset:0;opacity:.12}
.cover .band .txt{position:absolute;left:22mm;right:22mm;bottom:14mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:8.5pt;color:rgba(255,255,255,.85)}
.cover .band .txt b{display:block;font-family:"Serif Pack",Georgia,serif;font-size:13pt;color:#fff;font-weight:600;margin-bottom:1mm}
.cover .stripe{position:absolute;left:0;right:0;bottom:52mm;height:2.2mm;background:var(--gold)}
/* contents */
.toc{break-after:page}
.toc h2{font-size:24pt;margin-bottom:8mm}
.toc ol{list-style:none;padding:0;margin:0}
.toc li{display:flex;align-items:baseline;gap:3mm;padding:2.3mm 0;border-bottom:.6pt solid var(--line);margin:0;font-size:10.5pt;color:var(--ink)}
.toc li .n{width:8mm;font-weight:700;color:var(--acc);font-variant-numeric:tabular-nums}
.toc li .t{flex:1}
.toc li .pg{font-variant-numeric:tabular-nums;color:var(--muted);min-width:8mm;text-align:right}
.toc li.sub{padding:1.1mm 0 1.1mm 11mm;border-bottom:none;font-size:9.4pt;color:var(--body)}
.toc li.sub .t{border-bottom:.6pt dotted var(--line-dk)}
.toc .howto{margin-top:9mm;padding:4mm 5mm;background:var(--cream);border-radius:2mm;font-size:8.8pt;color:var(--muted)}
.toc .howto b{color:var(--ink)}
/* sections */
section{break-before:page}
section.wide{page:wide}
.sh{display:flex;align-items:flex-end;gap:4mm;padding-bottom:3mm;margin-bottom:5mm;border-bottom:1.2pt solid var(--acc)}
.sh .num{font-family:"Serif Pack",Georgia,serif;font-size:30pt;line-height:.9;color:var(--acc);font-weight:500}
.sh .k{font-size:7.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.sh h2{font-size:20pt;line-height:1.1}
h3{font-size:12.5pt;margin:6mm 0 2.5mm;break-after:avoid}
h3:first-child{margin-top:0}
.lead{font-size:11.5pt;line-height:1.5;color:var(--ink);margin-bottom:5mm;font-family:"Serif Pack",Georgia,serif;font-weight:400}
.muted{color:var(--muted);font-size:8.6pt}
.callout{border-left:2.4pt solid var(--gold);background:var(--cream);padding:3mm 4.5mm;margin:4mm 0;border-radius:0 2mm 2mm 0;break-inside:avoid}
.callout b{display:block;color:var(--gold-dk);font-size:8pt;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1mm}
.callout ul{margin-top:2mm}
dl.kv{display:grid;grid-template-columns:38mm 1fr;margin:0 0 4mm;border-top:.6pt solid var(--line)}
dl.kv dt,dl.kv dd{padding:2mm 0;border-bottom:.6pt solid var(--line);margin:0}
dl.kv dt{font-size:7.8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-right:4mm;padding-top:2.4mm}
dl.kv dd{color:var(--ink)}
.bl-title{font-size:7.8pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--acc);margin:3mm 0 1.5mm}
/* tables */
table{width:100%;border-collapse:collapse;margin:0 0 5mm;font-size:8.4pt;line-height:1.38}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:var(--acc-dk);color:#fff;text-align:left;font-weight:600;padding:1.8mm 2.2mm;font-size:7.8pt;letter-spacing:.02em;vertical-align:bottom}
td{padding:1.7mm 2.2mm;border-bottom:.6pt solid var(--line);vertical-align:top}
tbody tr:nth-child(even) td{background:#FCFBF8}
td.first{font-weight:600;color:var(--ink)}
td.grp{font-weight:700;color:var(--acc)}
tr.grpstart td{border-top:1pt solid var(--line-dk)}
td ul{padding-left:10pt}
.flag-gap{color:#9A3412;font-weight:600}
.st-Verified{color:#1E5B36;font-weight:700}
.st-Provisional{color:#7A4B00;font-weight:700}
/* long-term plan grid */
table.ltp{table-layout:fixed;font-size:8pt;line-height:1.32;margin-bottom:3mm}
table.ltp caption{caption-side:top;text-align:left;font-family:"Serif Pack",Georgia,serif;font-size:11pt;font-weight:600;color:var(--ink);padding-bottom:2.5mm}
table.ltp th{background:var(--acc-dk);text-align:center;padding:2mm 1.5mm}
table.ltp th small{display:block;font-weight:500;font-size:6.6pt;opacity:.8;letter-spacing:.04em}
table.ltp th.fy{background:var(--acc)}
table.ltp th.rowh{background:var(--acc-dk);width:24mm}
table.ltp td{border:.6pt solid var(--line);padding:2mm 2mm;background:#fff}
table.ltp td.fy{background:var(--acc-softer)}
table.ltp td.lbl{background:var(--cream);font-weight:700;color:var(--ink);font-size:8.3pt}
table.ltp td .u+.u{margin-top:1.4mm;padding-top:1.4mm;border-top:.5pt dashed var(--line-dk)}
table.ltp td.empty{color:#A29F98;font-style:italic}
table.ltp.dense{font-size:6.9pt;line-height:1.24}
table.ltp.dense td{padding:1.25mm 1.6mm}
table.ltp.dense td.lbl{font-size:7.4pt}
table.ltp.dense th{padding:1.4mm 1.2mm}
table.ltp.dense td .u+.u{margin-top:.8mm;padding-top:.8mm}
table.route.dense td{font-size:6.9pt}
table.route.dense td .r{margin-bottom:.4mm}
.legend{display:flex;gap:6mm;font-size:7.6pt;color:var(--muted);margin:0 0 5mm}
.legend i{display:inline-block;width:3.2mm;height:3.2mm;border:.6pt solid var(--line-dk);vertical-align:-0.5mm;margin-right:1.5mm}
/* KS4 route */
table.route td{border:.6pt solid var(--line);font-size:7.8pt}
table.route td .r{display:flex;gap:1.6mm;margin-bottom:.9mm}
table.route td .r b{color:var(--acc);font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
/* progression */
table.prog{table-layout:fixed;font-size:7.6pt}
table.prog td{border:.6pt solid var(--line)}
table.prog td.lbl{background:var(--cream);font-weight:700;color:var(--ink);width:30mm}
table.prog td.none{background:#FCFBF8}
/* year opener */
.yearhead{margin-bottom:4mm}
.yearhead .strip{display:grid;grid-template-columns:repeat(6,1fr);gap:1.4mm}
.yearhead .strip div{border:.6pt solid var(--line);border-top:2pt solid var(--line-dk);padding:1.6mm 2mm;font-size:7.4pt;line-height:1.3;color:var(--body);border-radius:0 0 1.2mm 1.2mm}
.yearhead .strip div.fy{border-top-color:var(--acc);background:var(--acc-softer)}
.yearhead .strip b{display:block;font-size:6.8pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:.6mm}
.yearhead .meta{font-size:8pt;color:var(--muted);margin:0 0 2mm}
/* unit page */
.unit{border:.7pt solid var(--line-dk);border-radius:2.4mm;margin:0 0 4mm;overflow:hidden;break-inside:avoid;background:#fff}
.unit.long{break-inside:auto}
.unit header{display:flex;align-items:center;gap:3mm;padding:2mm 4mm;background:var(--acc-softer);border-bottom:.7pt solid var(--line)}
.chip{display:inline-block;background:var(--acc);color:#fff;font-size:7.2pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.8mm 2.4mm;border-radius:5mm;white-space:nowrap}
.unit header h4{font-size:12pt;line-height:1.2;flex:1}
.unit header .fy{font-size:7pt;color:var(--muted);white-space:nowrap}
.unit .body{padding:2.4mm 4mm 2.6mm}
.unit .cols{display:grid;grid-template-columns:1.35fr 1fr;gap:5mm}
.unit h5{font-size:7.2pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--acc);margin:0 0 1.2mm}
.unit h5+ul{margin-bottom:1.8mm}
.unit li{margin-bottom:1.4pt}
.vocab{display:flex;flex-wrap:wrap;gap:1.2mm;margin-bottom:1mm}
.vocab span{background:var(--cream);border:.5pt solid var(--line);border-radius:1mm;padding:.3mm 1.6mm;font-size:7.8pt;color:var(--ink)}
.unit .strip{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:1.8mm;border-top:.6pt solid var(--line)}
.unit .strip div{padding:1.6mm 3mm 0 0}
.unit .strip div+div{padding-left:3mm;border-left:.6pt solid var(--line)}
.unit .strip b{display:block;font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.6mm}
.unit .strip span{font-size:8.3pt}
.unit .extra{margin-top:2mm;font-size:8.2pt}
.unit .extra b{color:var(--acc)}
.weeks{margin:3mm 0 0}
.weeks th{background:var(--acc);font-size:7.2pt}
.weeks td{font-size:7.9pt;padding:1.3mm 2mm}
.weeks td:first-child{font-weight:700;color:var(--acc);width:10mm;text-align:center}
/* KS4 unit */
.spec{border:.7pt solid var(--line-dk);border-radius:2.4mm;margin:0 0 4mm;break-inside:avoid;overflow:hidden}
.spec.long{break-inside:auto}
.spec header{display:flex;gap:3mm;align-items:baseline;padding:2.2mm 4mm;background:var(--acc-softer);border-bottom:.7pt solid var(--line)}
.spec header .ref{font-weight:800;color:var(--acc);font-variant-numeric:tabular-nums;white-space:nowrap}
.spec header h4{font-size:11pt;flex:1;line-height:1.2}
.spec header .m{font-size:7.4pt;color:var(--muted);white-space:nowrap}
.spec .body{padding:2.6mm 4mm 3mm}
.spec ol{margin:0 0 2mm;padding:0;list-style:none;counter-reset:pt}
.spec ol li{display:grid;grid-template-columns:6mm 1fr;margin:0 0 1.1mm}
.spec ol li i{font-style:normal;font-weight:700;color:var(--acc);font-size:7.8pt;font-variant-numeric:tabular-nums}
.spec .foot{display:grid;grid-template-columns:1fr 1fr;gap:4mm;border-top:.6pt solid var(--line);padding-top:2mm;font-size:8pt}
.spec .foot b{display:block;font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.5mm}
/* misc */
.terms{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 6mm;margin-bottom:5mm}
.terms div{display:grid;grid-template-columns:24mm 1fr;gap:2mm;border-bottom:.5pt solid var(--line);padding-bottom:1.2mm;font-size:8.2pt;break-inside:avoid}
.terms b{color:var(--ink)}
.sources{margin:0 0 4mm;padding:0;list-style:none}
.sources li{margin-bottom:1.8mm;font-size:8.2pt;break-inside:avoid}
.sources li span{display:block;color:var(--muted);font-size:7.4pt;word-break:break-all}
table.matrix{table-layout:fixed}
table.matrix th{text-align:center}
table.matrix th:first-child{text-align:left;width:38mm}
table.matrix td{text-align:center;border:.6pt solid var(--line);font-variant-numeric:tabular-nums}
table.matrix td:first-child{text-align:left;font-weight:600;color:var(--ink);background:var(--cream)}
table.matrix td.on{background:var(--acc-softer);color:var(--ink);font-weight:600}
table.matrix td.ks4{background:var(--gold-soft);font-size:7.6pt}
`;

const ul = (items) => (items?.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
const cellList = (xs, cls = "u") => (xs.length ? xs.map((x) => `<div class="${cls}">${esc(x)}</div>`).join("") : "");

function weeksTable(weeks) {
  if (!weeks?.length) return "";
  return `<table class="weeks"><thead><tr><th>Week</th><th>Lessons</th><th>Key vocabulary</th><th>Home activity</th></tr></thead><tbody>${weeks
    .map((w) => `<tr><td>${esc(w.week)}</td><td>${w.lessons.length > 1 ? ul(w.lessons) : esc(w.lessons[0] || "")}</td><td>${esc(w.vocabulary.join(", "))}</td><td>${esc(w.home)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function block(b) {
  switch (b.t) {
    case "lead":
      return `<p class="lead">${esc(b.text)}</p>`;
    case "p":
      return `<p class="${b.muted ? "muted" : ""}">${esc(b.text)}</p>`;
    case "h3":
      return `<h3>${esc(b.text)}</h3>`;
    case "bullets":
      return `${b.title ? `<div class="bl-title">${esc(b.title)}</div>` : ""}${ul(b.items)}`;
    case "kv":
      return `<dl class="kv">${b.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    case "callout":
      return `<div class="callout"><b>${esc(b.title)}</b>${b.text ? `<div>${esc(b.text)}</div>` : ""}${ul(b.items)}</div>`;
    case "table": {
      const tot = b.widths.reduce((a, c) => a + c, 0);
      const cols = `<colgroup>${b.widths.map((w) => `<col style="width:${((w / tot) * 100).toFixed(2)}%">`).join("")}</colgroup>`;
      const body = b.rows
        .map((r) => {
          const start = b.groupFirst && r[0];
          return `<tr class="${start ? "grpstart" : ""}">${r
            .map((c, i) => {
              let cls = i === 0 ? (b.groupFirst ? "grp" : "first") : "";
              if (b.flag === i && /^0 of/.test(c)) cls += " flag-gap";
              if (b.status === i) cls += ` st-${c}`;
              return `<td class="${cls}">${Array.isArray(c) ? ul(c) : esc(c)}</td>`;
            })
            .join("")}</tr>`;
        })
        .join("");
      return `<table>${cols}<thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case "ltp": {
      const fy = (i) => i >= 2;
      const head = `<tr><th class="rowh"></th>${b.columns.map((c, i) => `<th class="${fy(i) ? "fy" : ""}">${esc(c)}${!fy(i) && b.autumnNote ? `<small>${esc(b.autumnNote)}</small>` : "<small>Founding year</small>"}</th>`).join("")}</tr>`;
      const rows = b.rows
        .map((r) => `<tr><td class="lbl">${nl(r.label)}${r.extra?.length ? `<div class="muted" style="font-weight:400;margin-top:1mm">Not yet placed: ${esc(r.extra.join("; "))}</div>` : ""}</td>${r.cells.map((c, i) => `<td class="${fy(i) ? "fy" : ""} ${c.length ? "" : "empty"}">${c.length ? cellList(c) : "No unit"}</td>`).join("")}</tr>`)
        .join("");
      return `<table class="ltp ${b.rows.length > 9 ? "dense" : ""}">${b.caption ? `<caption>${esc(b.caption)}</caption>` : ""}<thead>${head}</thead><tbody>${rows}</tbody></table><div class="legend"><span><i style="background:var(--acc-softer)"></i>Taught in the founding year, January to July 2027</span><span><i style="background:#fff"></i>Taught from September 2027</span></div>`;
    }
    case "route": {
      const head = `<tr><th style="width:${b.dense ? 34 : 22}mm"></th>${b.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
      const rows = b.rows
        .map((r) => `<tr><td class="lbl" style="background:var(--cream);font-weight:700;color:var(--ink)">${nl(r.label)}</td>${r.cells.map((c) => `<td>${c.map((x) => { const [ref, ...t] = x.split("  "); return `<div class="r"><b>${esc(ref)}</b><span>${esc(t.join("  "))}</span></div>`; }).join("") || '<span class="muted">None</span>'}</td>`).join("")}</tr>`)
        .join("");
      return `<table class="ltp route ${b.dense ? "dense" : ""}">${b.caption ? `<caption>${esc(b.caption)}</caption>` : ""}<thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }
    case "progression": {
      const head = `<tr><th style="width:30mm">Strand</th>${b.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
      const rows = b.rows.map((r) => `<tr><td class="lbl">${esc(r.label)}</td>${r.cells.map((c) => `<td class="${c ? "" : "none"}">${esc(c)}</td>`).join("")}</tr>`).join("");
      return `<table class="prog"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }
    case "matrix": {
      const head = `<tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
      const rows = b.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i && c ? (i >= 10 ? "ks4" : "on") : ""}">${esc(c)}</td>`).join("")}</tr>`).join("");
      return `<table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }
    case "yearhead":
      return `<div class="yearhead"><p class="meta">${esc(b.count)}</p><div class="strip">${b.strip.map((s) => `<div class="${s.founding ? "fy" : ""}"><b>${esc(s.label)}</b>${esc(s.title || "No unit")}</div>`).join("")}</div></div>`;
    case "unit": {
      const long = b.weeks.length > 5 || b.knowledge.length > 9;
      const strip = [["Builds on", b.prior], ["How it is checked", b.assess], ["Leads to", b.leadsTo]];
      return `<article class="unit ${long ? "long" : ""}"><header><span class="chip">${esc(b.halfTerm)}</span><h4>${esc(b.title)}</h4><span class="fy">${esc(b.founding)}</span></header><div class="body"><div class="cols"><div><h5>Key knowledge</h5>${ul(b.knowledge) || '<p class="muted">Not recorded</p>'}</div><div>${b.skills.length ? `<h5>Skills</h5>${ul(b.skills)}` : ""}${b.vocabulary.length ? `<h5>Vocabulary</h5><div class="vocab">${b.vocabulary.map((v) => `<span>${esc(v)}</span>`).join("")}</div>` : ""}</div></div><div class="strip">${strip.map(([k, v]) => `<div><b>${k}</b><span>${esc(v || "Not recorded")}</span></div>`).join("")}</div>${b.resources ? `<p class="extra"><b>Resources: </b>${esc(b.resources)}</p>` : ""}${b.foundingYear ? `<p class="extra"><b>Founding year: </b>${esc(b.foundingYear)}</p>` : ""}${b.weeks.length ? `<h5 style="margin-top:3mm">Week by week</h5>${weeksTable(b.weeks)}` : ""}</div></article>`;
    }
    case "specunit": {
      const long = b.points.length > 9 || b.weeks.length > 4;
      return `<article class="spec ${long ? "long" : ""}"><header><span class="ref">${esc(b.ref)}</span><h4>${esc(b.title)}</h4><span class="m">${esc(b.meta)}</span></header><div class="body"><ol>${b.points.map((p, i) => `<li><i>${i + 1}</i><span>${esc(p)}</span></li>`).join("")}</ol><div class="foot"><div><b>Key terms</b>${b.keyTerms.length ? `<div class="vocab">${b.keyTerms.map((v) => `<span>${esc(v)}</span>`).join("")}</div>` : '<span class="muted">None listed</span>'}${b.links.length ? `<b style="margin-top:1.6mm">Connects to</b>${esc(b.links.join("; "))}` : ""}</div><div><b>Taught in our lessons${b.covered ? ` (${esc(b.covered)})` : ""}</b>${esc(b.lessons.join(", ") || "No lesson matched yet")}</div></div>${b.weeks.length ? `<h5 style="margin-top:3mm;font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;color:var(--acc)">Week by week</h5>${weeksTable(b.weeks)}` : ""}</div></article>`;
    }
    case "terms":
      return `<div class="bl-title">${esc(b.title)}</div><div class="terms">${b.items.map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>`;
    case "sources":
      return `<div class="bl-title">Official sources opened</div><ul class="sources">${b.items.map(([t, u]) => `<li>${esc(t)}<span>${esc(u)}</span></li>`).join("")}</ul>`;
    default:
      return "";
  }
}

/** Numbered table of contents: top-level sections, with grouped sections (years) nested. */
export function tocEntries(doc) {
  const out = [];
  let n = 0;
  const seen = new Set();
  doc.sections.forEach((s, i) => {
    if (s.group) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        out.push({ level: 1, num: String(++n), title: s.group, target: i });
      }
      out.push({ level: 2, num: "", title: s.title, target: i });
    } else out.push({ level: 1, num: String(++n), title: s.title, target: i });
  });
  return out;
}

/**
 * The full document. `pages` maps a section index to its page number (filled on the second pass).
 * `coverOnly` renders just the cover (it replaces page 1 so the cover has no header or footer).
 */
export function renderHtml(doc, { pages = {}, coverOnly = false, generated } = {}) {
  const logo = `file://${path.join(ROOT, "public/brand/ga-wordmark.png")}`;
  const toc = tocEntries(doc);
  const numFor = new Map();
  toc.forEach((e) => {
    if (e.level === 1 && !numFor.has(e.target)) numFor.set(e.target, e.num);
  });
  let groupNum = "";
  const cover = `<div class="cover"><div class="top"><img src="${logo}" alt="Tarbiyyah Global Academy"><span>${esc(doc.kicker)}</span></div><div class="main"><div class="kicker">${esc(doc.kind === "subject" ? "Subject curriculum" : "Curriculum")}</div><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle)}</div><div class="rule"></div><dl>${doc.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div><div class="stripe"></div><div class="band">${starPattern("#ffffff")}<div class="txt"><div><b>Tarbiyyah Global Academy</b>A British curriculum taught with tarbiyyah</div><div>Generated ${esc(generated)}</div></div></div></div>`;
  if (coverOnly) return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${CSS(doc)}</style></head><body>${cover}</body></html>`;
  const tocHtml = `<div class="toc"><h2>Contents</h2><ol>${toc.map((e) => `<li class="${e.level === 2 ? "sub" : ""}"><span class="n">${esc(e.num)}</span><span class="t">${esc(e.title)}</span><span class="pg">${pages[e.target] ?? "00"}</span></li>`).join("")}</ol><div class="howto"><b>How to read this document.</b> ${
    doc.kind === "subject"
      ? "The long-term plan shows the whole subject on one page. Each year then has a page for every unit: what pupils learn, the skills and vocabulary, how the unit is checked, what it builds on and what it leads to, and the week-by-week plan where one has been written."
      : "Each year group has one page showing every subject across the six half terms. The subject documents in the pack give the unit-by-unit detail."
  } The units are edited in the portal's Curriculum planner; this document is rebuilt from them automatically.</div></div>`;
  const body = doc.sections
    .map((s, i) => {
      let num = numFor.get(i) || "";
      let kicker = "";
      if (s.group) {
        if (num) groupNum = num;
        kicker = s.group;
        num = groupNum;
      }
      return `<section class="${s.wide ? "wide" : ""}" id="s${i}"><div class="sh"><span class="num">${esc(num)}</span><div>${kicker ? `<div class="k">${esc(kicker)}</div>` : ""}<h2>${esc(s.title)}<span class="mk">@@S${i}@@</span></h2></div></div>${s.blocks.map(block).join("\n")}</section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${CSS(doc)}</style></head><body>${cover}${tocHtml}${body}</body></html>`;
}
