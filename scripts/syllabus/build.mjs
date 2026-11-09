// Builds the Syllabus pack into an organised folder:
//   00_Start_Here/                 the whole-school curriculum overview (PDF and Word)
//   01_Subjects/<slug>/            one curriculum document per subject, Years 1 to 11 (PDF and Word)
//   02_Cross_Curricular_Matrices/  link heatmaps, teaching hubs, year maps (PowerPoint and PDF)
//   03_Sources_and_Verification/   sources opened, verification register
//
//   node scripts/syllabus/build.mjs --out <dir> [--pdf] [--only english,overview]
// --pdf also makes the PDFs (needs playwright + Chromium, pdf-lib, pdftotext, and LibreOffice for
// the matrix deck). The portal links to 01_Subjects/<slug>/ and 00_Start_Here/ by these names.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, clean, ensureDir } from "./lib.mjs";
import { loadPack, buildMatrixDeck } from "./matrix.mjs";
import { buildCoverage } from "./coverage.mjs";
import { loadChapters, videoMapFor } from "./video-links.mjs";
import { subjectsFrom, subjectDocument, overviewDocument } from "./model.mjs";
import { writeDocx } from "./render-docx.mjs";

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = path.resolve(arg("--out", path.join(ROOT, "dist/syllabus-pack")));
const PDF = args.includes("--pdf");
const ONLY = arg("--only", "") ? new Set(arg("--only", "").split(",")) : null;
const want = (slug) => !ONLY || ONLY.has(slug);

export const FOLDERS = { start: "00_Start_Here", subjects: "01_Subjects", mx: "02_Cross_Curricular_Matrices", src: "03_Sources_and_Verification" };
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of Object.values(FOLDERS)) ensureDir(path.join(OUT, f));

const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const pack = loadPack();
const coverage = buildCoverage();
const manifest = [];
const fileBase = (name) => clean(name).replace(/'/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

const pdf = PDF ? await import("./render-pdf.mjs") : null;
async function emit(doc, dir, base, meta) {
  const rel = `${dir}/${base}`;
  await writeDocx(doc, path.join(OUT, `${rel}.docx`), { generated });
  let pages = null;
  if (pdf) pages = await pdf.writePdf(doc, path.join(OUT, `${rel}.pdf`), { generated });
  manifest.push({ ...meta, docx: `${rel}.docx`, pdf: pdf ? `${rel}.pdf` : null, pages });
  console.log(`  ${rel}${pages ? ` (${pages} pages)` : ""}`);
}

// Whole-school overview
if (want("overview")) await emit(overviewDocument(pack, coverage), FOLDERS.start, "TGA_Curriculum_Overview", { kind: "overview", slug: "overview", subject: "Whole school" });

// One document per subject
for (const s of subjectsFrom(pack)) {
  if (!want(s.slug)) continue;
  const doc = subjectDocument(s, coverage);
  await emit(doc, `${FOLDERS.subjects}/${s.slug}`, `TGA_${fileBase(s.name)}_Curriculum`, { kind: "subject", slug: s.slug, subject: s.name, status: [s.syl, ...s.specs].filter(Boolean).every((d) => d.status === "Verified") ? "Verified" : "Provisional" });
}

// Cross-curricular matrices (PowerPoint)
if (!ONLY || ONLY.has("matrix")) {
  const mx = buildMatrixDeck(pack);
  const rel = `${FOLDERS.mx}/Cross_Curricular_Matrix_Pack.pptx`;
  await mx.pres.writeFile({ fileName: path.join(OUT, rel) });
  manifest.push({ kind: "matrix", slug: "matrix", subject: "All subjects", pptx: rel, pdf: PDF ? rel.replace(/\.pptx$/, ".pdf") : null });
  fs.writeFileSync(path.join(OUT, FOLDERS.mx, "link_register.json"), JSON.stringify(mx.rows, null, 2));
  const chapters = loadChapters();
  const videoLinks = [];
  for (const d of pack.ks4) videoMapFor(d, chapters).forEach((list, ref) => list.forEach((v) => videoLinks.push({ subject: d.subject, unitRef: ref, ...v })));
  fs.writeFileSync(path.join(OUT, FOLDERS.mx, "video_chapter_links.json"), JSON.stringify(videoLinks, null, 2));
  if (PDF) execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", path.join(OUT, FOLDERS.mx), path.join(OUT, rel)], { stdio: "ignore" });
}

// Sources and verification
{
  const lines = ["Level,Subject,Board or framework,Code,Status,Status note,Open items"];
  const q = (s) => `"${clean(s).replace(/"/g, '""')}"`;
  for (const d of [...pack.ks4, ...pack.ks13]) lines.push([d.kind === "spec" ? "Years 10-11" : "Years 1-9", d.subject, d.kind === "spec" ? d.board : d.framework, d.code || "", d.status, d.statusNote, (d.gaps || []).join(" | ")].map(q).join(","));
  fs.writeFileSync(path.join(OUT, FOLDERS.src, "Verification_Register.csv"), lines.join("\n"));
  const src = ["# Sources opened\n"];
  for (const d of [...pack.ks4, ...pack.ks13]) {
    src.push(`## ${d.subject} (${d.kind === "spec" ? "Years 10-11" : "Years 1-9"}): ${d.status}\n`);
    (d.sources || []).forEach((s) => src.push(`- ${s.title}: ${s.url}`));
    src.push("");
  }
  fs.writeFileSync(path.join(OUT, FOLDERS.src, "Sources_Opened.md"), src.join("\n"));
  fs.writeFileSync(
    path.join(OUT, "README.md"),
    `# Tarbiyyah Global Academy: Syllabus pack

| Folder | What it holds |
|---|---|
| ${FOLDERS.start} | The whole-school curriculum overview: every year group's long-term plan |
| ${FOLDERS.subjects} | One curriculum document per subject, Year 1 to Year 11 (PDF and Word) |
| ${FOLDERS.mx} | Cross-curricular matrices: heatmaps, teaching hubs, year-by-year maps |
| ${FOLDERS.src} | Sources opened and the verification register |

Built from the portal's Curriculum planner (via content/syllabus) on ${generated}.
Specification wording is paraphrased. Teach from the awarding body's own document.
`,
  );
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ generated, files: manifest }, null, 2));
if (pdf) await pdf.closeBrowser();
console.log(`Built ${manifest.length} documents into ${OUT}`);
