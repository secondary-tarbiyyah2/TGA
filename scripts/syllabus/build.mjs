// Builds the Syllabus & Specification pack into an organised folder.
//   node scripts/syllabus/build.mjs --out <dir> [--pdf]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, W, MX, INK, MUTED, GOLD, GOLD_SOFT, LINE, WHITE, FONT, H, LOGO_WHITE, LOGO_RATIO, clean, slugify, ensureDir, makeTheme, tint, newDeck, contentSlide, chip, card, gridBoxes, STATUS, fitSize } from "./lib.mjs";
import { buildSpecDeck, buildSyllabusDeck } from "./decks.mjs";
import { loadPack, buildMatrixDeck, groupOf } from "./matrix.mjs";
import { buildUnitDeck } from "./unit-decks.mjs";
import { specDocument, syllabusDocument, writeDoc } from "./specdoc.mjs";
import { buildCoverage } from "./coverage.mjs";
const coverage = buildCoverage();
import { loadChapters, videoMapFor } from "./video-links.mjs";

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg("--out", path.join(ROOT, "dist/syllabus-pack")));
const PDF = args.includes("--pdf");

const F = { start: "00_Start_Here", mx: "01_Cross_Curricular_Matrices", ks4: "02_KS4_Specifications_Y10-Y11", ks13: "03_KS1-KS3_Syllabus_Reception-Y9", src: "04_Sources_and_Verification" };
for (const f of Object.values(F)) ensureDir(path.join(OUT, f));

const pack = loadPack();
const manifest = [];
const chapters = loadChapters();
const videoLinks = [];
const short = (s) => clean(s).replace(/[^A-Za-z0-9 ]+/g, "").replace(/\s+/g, "_");
const add = (m) => manifest.push(m);

async function save(pres, rel, meta) {
  const p = path.join(OUT, rel);
  ensureDir(path.dirname(p));
  await pres.writeFile({ fileName: p });
  add({ ...meta, file: rel, pptx: rel, pdf: PDF ? rel.replace(/\.pptx$/, ".pdf") : null });
}

async function saveDoc(doc, rel, meta) {
  await writeDoc(doc, path.join(OUT, rel));
  add({ ...meta, file: rel, pptx: null, docx: rel, pdf: PDF ? rel.replace(/\.docx$/, ".pdf") : null });
}
for (const d of pack.ks4) {
  const code = (clean(d.code).match(/\b\d[A-Z]{2}\d{1,2}\b|\b[A-Z]{2,3}\d\b|\b\d{4}\b/g) || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join("-") || "spec";
  const sub = short(d.subject);
  const bd = /AQA/i.test(d.board) ? "AQA" : /edexcel|pearson/i.test(d.board) ? "Edexcel" : short(d.board).slice(0, 12);
  const vm = videoMapFor(d, chapters);
  vm.forEach((list, ref) => list.forEach((v) => videoLinks.push({ subject: d.subject, unitRef: ref, ...v })));
  await saveDoc(specDocument(d, { internationalNote: d.internationalNote, coverage: coverage[d.slug] }), `${F.ks4}/${sub}/KS4_${sub}_${bd}-${code}_Specification.docx`, { kind: "spec", level: "KS4 (Y10-Y11)", subject: d.subject, board: d.board, code: d.code, status: d.status, units: d.units.length });
}
for (const d of pack.ks13) {
  const sub = short(d.subject);
  const yrs = Object.keys(d.yearMap || {});
  const first = yrs[0] === "reception" ? "Rec" : String(yrs[0]).toUpperCase();
  const last = String(yrs[yrs.length - 1]).toUpperCase();
  await saveDoc(syllabusDocument(d), `${F.ks13}/${sub}/KS1-3_${sub}_Syllabus_${first}-${last}.docx`, { kind: "syllabus", level: `${first} to ${last}`, subject: d.subject, board: d.framework, status: d.status, units: Object.values(d.yearMap).reduce((a, u) => a + u.length, 0) });
}
const mx = buildMatrixDeck(pack);
await save(mx.pres, `${F.mx}/Cross_Curricular_Matrix_Pack.pptx`, { kind: "matrix", level: "All years", subject: "All subjects", board: "Cross-curricular", status: "Provisional" });

// Start Here deck
{
  const theme = makeTheme("islamic-studies");
  theme.accent = "7D6428";
  const ctx = { theme, status: "Provisional", page: 1, footerLeft: "Syllabus & Specification Pack · Start Here" };
  const pres = newDeck("Syllabus and specification pack: start here", "Index");
  const t = pres.addSlide();
  t.background = { color: "1B1E21" };
  t.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  chip(t, "Start here", MX + 0.2, 0.75, 1.8, "1B1E21", "E3C98F", 11, 0.36);
  t.addText("Syllabus and Specification Pack", { x: MX + 0.2, y: 1.5, w: 9, h: 1.8, fontFace: "Georgia", fontSize: 46, bold: true, color: WHITE, margin: 0, valign: "top" });
  t.addText("Every subject, Reception to Year 11, as official specification content: what is taught, in what order, and how it is examined.", { x: MX + 0.2, y: 3.5, w: 8, h: 1.2, fontFace: FONT, fontSize: 19, color: "E3C98F", margin: 0, valign: "top" });
  t.addImage({ path: LOGO_WHITE, x: MX + 0.2, y: 6.75, w: 1.9, h: 1.9 / LOGO_RATIO });

  const s1 = contentSlide(pres, ctx, "What is what", "How this folder is organised");
  const rows = [
    [F.start, "This guide and the file register."],
    [F.mx, "Link heatmaps, 12 teaching hubs, year-by-year maps, spiral threads."],
    [F.ks4, "One specification document per examined subject (Word and PDF): how it is examined and what each unit requires."],
    [F.ks13, "One syllabus document per subject, Reception to Year 9 (Word and PDF): framework content, year-by-year units, progression."],
    [F.src, "Sources opened, verification status and open items for every subject."],
  ];
  rows.forEach(([a, b], i) => {
    const y = 1.8 + i * 1.0;
    card(s1, MX, y, W - 2 * MX, 0.88, WHITE, LINE, theme.accent);
    s1.addText(a, { x: MX + 0.3, y, w: 5.2, h: 0.88, fontFace: "Consolas", fontSize: 14, bold: true, color: theme.accent, valign: "middle", margin: 0 });
    s1.addText(b, { x: MX + 5.7, y, w: W - 2 * MX - 5.9, h: 0.88, fontFace: FONT, fontSize: fitSize(b, W - 2 * MX - 5.9, 0.8, 15, 10, 0), color: INK, valign: "middle", margin: 0 });
  });

  const s2 = contentSlide(pres, ctx, "Reading the labels", "Verified and Provisional, and what to do about each");
  const lab = [
    ["VERIFIED", "Verified", "Structure and content were read from the official source (specification PDF or National Curriculum text). Safe to teach and plan from."],
    ["PROVISIONAL", "Provisional", "Part of it could not be opened or confirmed, or relies on a recommended sequence. Check the Open items slide at the end of the deck before relying on it."],
  ];
  lab.forEach(([k, v, txt], i) => {
    const st = STATUS[v];
    const y = 1.9 + i * 1.9;
    card(s2, MX, y, W - 2 * MX, 1.7, WHITE, LINE, st.ink);
    chip(s2, k, MX + 0.4, y + 0.3, 2.0, st.ink, st.fill, 13, 0.4);
    s2.addText(txt, { x: MX + 2.8, y: y + 0.15, w: W - 2 * MX - 3.1, h: 1.4, fontFace: FONT, fontSize: 18, color: INK, valign: "middle", margin: 0 });
  });
  s2.addText("Every deck states its sources on its last slide. Specification wording is paraphrased, not copied; always teach from the awarding body's own document.", { x: MX, y: 5.9, w: W - 2 * MX, h: 0.8, fontFace: FONT, fontSize: 14, italic: true, color: MUTED, margin: 0 });

  // register
  const mk = (txt, o = {}) => ({ text: clean(txt), options: { fontFace: FONT, fontSize: 10, color: INK, valign: "middle", ...o } });
  const reg = manifest.filter((m) => m.kind === "spec" || m.kind === "syllabus");
  for (let p = 0; p * 11 < reg.length; p++) {
    const s = contentSlide(pres, ctx, "File register", `All documents in the pack (${p + 1} of ${Math.ceil(reg.length / 11)})`);
    const data = [["Level", "Subject", "Board or framework", "Status", "Units"].map((h) => mk(h, { bold: true, color: WHITE, fill: { color: theme.accent } }))];
    reg.slice(p * 11, p * 11 + 11).forEach((m, i) => data.push([m.level, m.subject, m.kind === "spec" ? `${m.board} ${m.code}` : m.board.slice(0, 80), m.status, String(m.units)].map((x, j) => mk(x, { fill: { color: i % 2 ? WHITE : tint(theme.accent, 0.92) }, bold: j === 3, color: j === 3 ? (m.status === "Verified" ? "1E5B36" : "7A4B00") : INK }))));
    s.addTable(data, { x: MX, y: 1.8, w: W - 2 * MX, colW: [1.7, 2.4, 5.2, 1.4, W - 2 * MX - 10.7], border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.06, 0.08, 0.06, 0.08] });
  }

  const s4 = contentSlide(pres, ctx, "Needs your confirmation", "Board and code questions the school must settle");
  const items = [
    ["Arabic", "The Edexcel International GCSE Arabic course (4AA1) is a first-language qualification. Beginner Arabic in Years 3 to 9 does not lead into it. Confirm which Arabic course Years 10 and 11 sit."],
    ["Science", "Documented as Edexcel International GCSE Biology 4BI1, Chemistry 4CH1, Physics 4PH1 and Double Award 4SD0. Confirm separate or double award, and that Year 11 is on this course."],
    ["Business", "Documented as Edexcel International GCSE 4BS1. Existing lesson files follow the UK GCSE titles and need re-mapping."],
    ["Islamic Studies", "Documented as Edexcel International GCSE 4IS1. Confirm it is current for 2026-27."],
    ["English Language", "Documented as AQA 8700 (UK GCSE). If you enter the international version, that is OxfordAQA International GCSE English Language (9270): tell me and I will switch it."],
    ["English Literature", "Documented as Edexcel International GCSE 4ET1. A Christmas Carol is not on Pearson's list (Macbeth is), and the lesson files still follow AQA 8702."],
  ];

  const bx = gridBoxes(6, { x: MX, y: 1.8, w: W - 2 * MX, h: 5.05 }, 2, 0.2);
  items.forEach(([k, v], i) => {
    const b = bx[i];
    card(s4, b.x, b.y, b.w, b.h, WHITE, LINE, "B08E45");
    s4.addText(k, { x: b.x + 0.3, y: b.y + 0.1, w: b.w - 0.5, h: 0.4, fontFace: "Georgia", fontSize: 17, bold: true, color: theme.accent, margin: 0 });
    s4.addText(v, { x: b.x + 0.3, y: b.y + 0.55, w: b.w - 0.5, h: b.h - 0.65, fontFace: FONT, fontSize: fitSize(v, b.w - 0.5, b.h - 0.65, 14, 9, 0), color: INK, valign: "top", margin: 0 });
  });
  await save(pres, `${F.start}/00_Start_Here.pptx`, { kind: "guide", level: "All years", subject: "Index", board: "", status: "Provisional" });
}

// Verification register + README
{
  const lines = ["Level,Subject,Board or framework,Code,Status,Status note,Open items"];
  const q = (s) => `"${clean(s).replace(/"/g, '""')}"`;
  for (const d of [...pack.ks4, ...pack.ks13]) lines.push([d.kind === "spec" ? "KS4" : "KS1-3", d.subject, d.kind === "spec" ? d.board : d.framework, d.code || "", d.status, d.statusNote, (d.gaps || []).join(" | ")].map(q).join(","));
  fs.writeFileSync(path.join(OUT, F.src, "Verification_Register.csv"), lines.join("\n"));
  const src = ["# Sources opened\n"];
  for (const d of [...pack.ks4, ...pack.ks13]) {
    src.push(`## ${d.subject} (${d.kind === "spec" ? "KS4" : "KS1-3"}): ${d.status}\n`);
    (d.sources || []).forEach((s) => src.push(`- ${s.title}: ${s.url}`));
    src.push("");
  }
  fs.writeFileSync(path.join(OUT, F.src, "Sources_Opened.md"), src.join("\n"));
  const rd = `# Tarbiyyah Global Academy: Syllabus and Specification Pack

Pure syllabus and specification content. Nothing here is about the school's own policies.

| Folder | What it holds |
|---|---|
| ${F.start} | Start-here guide and file register |
| ${F.mx} | Cross-curricular matrices: heatmaps, teaching hubs, year-by-year maps, spiral threads |
| ${F.ks4} | One folder per subject: the specification deck (PPTX and PDF) for Years 10 to 11 |
| ${F.ks13} | One folder per subject: the syllabus deck (PPTX and PDF) for Reception to Year 9 |
| ${F.src} | Sources opened, verification register, open items |

Status labels: **Verified** means read from the official source; **Provisional** means part could not be confirmed (see the last slide of each deck).
Specification wording is paraphrased. Teach from the awarding body's own document.
`;
  fs.writeFileSync(path.join(OUT, "README.md"), rd);
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), files: manifest }, null, 2));
fs.writeFileSync(path.join(OUT, F.mx, "video_chapter_links.json"), JSON.stringify(videoLinks, null, 2));
fs.writeFileSync(path.join(OUT, F.mx, "link_register.json"), JSON.stringify(mx.rows, null, 2));

if (PDF) {
  const dirs = [...new Set(manifest.map((m) => path.dirname(path.join(OUT, m.file))))];
  for (const d of dirs) {
    const files = fs.readdirSync(d).filter((f) => f.endsWith(".pptx") || f.endsWith(".docx")).map((f) => path.join(d, f));
    if (files.length) execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", d, ...files], { stdio: "ignore" });
  }
}
console.log(`Built ${manifest.length} files into ${OUT}`);
