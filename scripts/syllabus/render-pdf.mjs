// HTML -> PDF with Chromium (Playwright), with a running header and footer and a contents page
// whose page numbers are filled in on a second pass. Needs `playwright` (with Chromium),
// `pdf-lib` and poppler's `pdftotext`; the workflow installs them.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { renderHtml } from "./render-html.mjs";

const require = createRequire(import.meta.url);

let browserP = null;
async function browser() {
  if (!browserP) {
    const { chromium } = require("playwright");
    browserP = chromium.launch();
  }
  return browserP;
}
export async function closeBrowser() {
  if (browserP) (await browserP).close();
  browserP = null;
}

const tpl = (inner) => `<div style="width:100%;font-family:Inter,'Inter Pack',Carlito,Arial,sans-serif;font-size:7pt;color:#5B6168;-webkit-print-color-adjust:exact;">${inner}</div>`;

async function toPdf(html, file, { header, footer, cover }) {
  const b = await browser();
  const page = await b.newPage();
  const tmp = path.join(os.tmpdir(), `tga-syllabus-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto(`file://${tmp}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: file,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: !cover,
    headerTemplate: cover ? "" : tpl(`<div style="margin:0 15mm;padding-top:8mm;display:flex;justify-content:space-between;border-bottom:0.5pt solid #E3DED2;padding-bottom:1.6mm"><span style="letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:#7D6428">Tarbiyyah Global Academy</span><span>${header}</span></div>`),
    footerTemplate: cover ? "" : tpl(`<div style="margin:0 15mm;padding-bottom:7mm;display:flex;justify-content:space-between"><span>${footer}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`),
  });
  await page.close();
  fs.rmSync(tmp, { force: true });
}

/** Which page each section starts on, from the hidden @@S<n>@@ markers. */
function sectionPages(pdf) {
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const pages = {};
  text.split("\f").forEach((pg, i) => {
    for (const m of pg.matchAll(/@@S(\d+)@@/g)) if (!(m[1] in pages)) pages[m[1]] = i + 1;
  });
  return pages;
}

export async function writePdf(doc, file, { generated }) {
  const { PDFDocument } = require("pdf-lib");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const footer = `${doc.title} · Generated ${generated} from the portal's Curriculum planner`;
  const opts = { header: doc.header, footer };
  // Pass 1 finds the pages; pass 2 prints them in the contents (same layout, so nothing moves).
  await toPdf(renderHtml(doc, { generated }), file, opts);
  const pages = sectionPages(file);
  await toPdf(renderHtml(doc, { generated, pages }), file, opts);
  // Swap page 1 for a cover without the running header and footer.
  const coverFile = `${file}.cover.pdf`;
  await toPdf(renderHtml(doc, { generated, coverOnly: true }), coverFile, { cover: true });
  const main = await PDFDocument.load(fs.readFileSync(file));
  const cov = await PDFDocument.load(fs.readFileSync(coverFile));
  const [c] = await main.copyPages(cov, [0]);
  main.removePage(0);
  main.insertPage(0, c);
  main.setTitle(`${doc.title}: Tarbiyyah Global Academy`);
  main.setAuthor("Tarbiyyah Global Academy");
  main.setSubject(doc.subtitle);
  main.setCreator("TGA syllabus pack (scripts/syllabus/build.mjs)");
  fs.writeFileSync(file, await main.save());
  fs.rmSync(coverFile, { force: true });
  return main.getPageCount();
}
