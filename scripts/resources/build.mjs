// Build every made term resource into printable files.
//   node scripts/resources/build.mjs [outDir=out/resources] [--term=spring-1] [--only=subject[/year[/id]]] [--needed=needed.json] [--no-word]
// For each item in content/resources/items/<subject>/<year>/<id>.json:
//   <outDir>/<subject>/<year>/<id>.pdf              the pupil copy (A4, space to write; printable or for a drawing tablet)
//   <outDir>/<subject>/<year>/<id>-mark-scheme.pdf  answers, marks and teacher notes (only when the item has answers)
//   <outDir>/<subject>/<year>/<id>.docx             a Word copy staff can edit (tests, mocks, quizzes, question sets, frames)
// and <outDir>/manifest.json listing what was built (read by upload.mjs).
// Needs `playwright` (with Chromium) and, for Word copies, `docx`.
import fs from "node:fs";
import path from "node:path";
import { ITEMS_DIR, RES_DIR, ROOT, TERMS, readJson } from "./lib.mjs";
import { pupilHtml, markSchemeHtml, htmlToPdf, closeBrowser, hasAnswers } from "./render.mjs";
import { validateItem } from "./validate.mjs";

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || "out/resources");
const term = (args.find((a) => a.startsWith("--term=")) || "").slice(7);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const noWord = args.includes("--no-word");
const neededFile = (args.find((a) => a.startsWith("--needed=")) || "").slice(9);
export const WORD_TYPES = new Set(["test paper", "mock paper", "quiz", "revision set", "writing frame", "mark scheme"]);

// Pictures: the lessons' own choices (content/lesson-pictures.json) and the resources' (content/resource-pictures.json),
// downloaded once into .cache/resource-pictures.
const PIC_DIR = process.env.RESOURCE_PICTURES_DIR ? path.resolve(process.env.RESOURCE_PICTURES_DIR) : path.join(ROOT, ".cache/resource-pictures");
const picCache = { ...(readJson(path.join(ROOT, "content/lesson-pictures.json"), { pictures: {} }).pictures || {}), ...(readJson(path.join(RES_DIR, "resource-pictures.json"), { pictures: {} }).pictures || {}) };
const keyOf = (p) => (p.file ? `file:${String(p.file).trim().replace(/^file:/i, "File:")}` : String(p.find || "").toLowerCase().replace(/\s+/g, " ").trim());
const UA = "TarbiyyahGlobalAcademyResourceBuilder/1.0 (https://globalacademy.tarbiyyah.co.uk; printable school worksheets) node";
const picData = new Map();
async function preparePicture(p) {
  const e = picCache[keyOf(p)];
  if (!e || e.none || !e.thumb) return;
  const ext = /\.jpe?g($|\?)/i.test(e.thumb) ? "jpg" : "png";
  const local = path.join(PIC_DIR, `${Buffer.from(e.file).toString("hex").slice(0, 40)}.${ext}`);
  if (!fs.existsSync(local)) {
    try {
      const res = await fetch(e.thumb, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.mkdirSync(PIC_DIR, { recursive: true });
      fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.log(`::warning::picture "${p.find || p.file}" not downloaded (${err.message}); a drawing box is used instead`);
      return;
    }
  }
  picData.set(keyOf(p), { src: `data:image/${ext === "jpg" ? "jpeg" : "png"};base64,${fs.readFileSync(local).toString("base64")}`, credit: [e.credit, e.licence].filter(Boolean).join(", ").slice(0, 120) });
}
const pictures = (p) => picData.get(keyOf(p)) || null;

/** Items to build: all of them, or those a term's register lists, narrowed by --only. */
function itemFiles() {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) out.push(p);
    }
  };
  walk(ITEMS_DIR);
  let list = out.sort();
  if (term) {
    const reg = readJson(path.join(RES_DIR, `${term}.json`), { resources: [] });
    const ids = new Set(reg.resources.map((r) => r.id));
    list = list.filter((f) => ids.has(path.basename(f, ".json")));
  }
  if (neededFile) {
    const ids = new Set(readJson(path.resolve(neededFile), []));
    list = list.filter((f) => ids.has(path.basename(f, ".json")));
  }
  if (only) list = list.filter((f) => path.relative(ITEMS_DIR, f).replace(/\\/g, "/").startsWith(only));
  return list;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (term && !TERMS.some((x) => x.id === term)) throw new Error(`Unknown term ${term}`);
  const files = itemFiles();
  const manifest = [];
  let docx = null;
  if (!noWord) {
    try {
      docx = await import("./render-docx.mjs");
    } catch (e) {
      console.log(`::warning::Word copies skipped (${e.message})`);
    }
  }
  let failed = 0;
  for (const f of files) {
    const item = JSON.parse(fs.readFileSync(f, "utf8"));
    const problems = validateItem(item, f);
    if (problems.length) {
      failed++;
      console.error(`::error::${path.relative(ROOT, f)}: ${problems.join("; ")}`);
      continue;
    }
    for (const b of item.blocks || []) {
      if (b.picture) await preparePicture(b.picture);
      for (const q of b.questions || []) if (q.picture) await preparePicture(q.picture);
    }
    const rel = `${item.subjectSlug}/${item.year}/${item.id}`;
    const entry = { id: item.id, subject_slug: item.subjectSlug, year: item.year, type: item.type, title: item.title, pdf: `${rel}.pdf` };
    try {
      await htmlToPdf(pupilHtml(item, { pictures }), path.join(outDir, `${rel}.pdf`), item.title);
      if (hasAnswers(item)) {
        await htmlToPdf(markSchemeHtml(item), path.join(outDir, `${rel}-mark-scheme.pdf`), `${item.title}: mark scheme (staff only)`);
        entry.markScheme = `${rel}-mark-scheme.pdf`;
      }
      if (docx && (WORD_TYPES.has(item.type) || item.word)) {
        await docx.writeDocx(item, path.join(outDir, `${rel}.docx`));
        entry.docx = `${rel}.docx`;
      }
      manifest.push(entry);
    } catch (e) {
      failed++;
      console.error(`::error::${rel}: ${e.message}`);
    }
  }
  await closeBrowser();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`Built ${manifest.length} of ${files.length} resources into ${path.relative(process.cwd(), outDir) || "."}${failed ? ` (${failed} failed)` : ""}`);
  if (failed) process.exit(1);
}
