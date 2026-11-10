// Checks term resource items (content/resources/items/**) and that the registers are current.
//   node scripts/resources/validate.mjs            -> 0 problems or a list (exit 1)
// House rules checked on all text: no em dashes, no placeholder text, British spelling of common words.
import fs from "node:fs";
import path from "node:path";
import { ITEMS_DIR, TYPES, ROOT, loadLessonFiles } from "./lib.mjs";
import { GRID_KINDS } from "./grids.mjs";

const BLOCK_KEYS = ["h", "caption", "trace", "text", "bullets", "questions", "keywords", "panels", "table", "frame", "starters", "arabic", "grid", "cards", "picture", "practical", "passage", "model", "box", "timeline", "checklist", "tracker", "note", "pagebreak", "answers"];
const AMERICAN = /\b(color|colors|colored|coloring|center|centers|centered|favorite|favorites|organize|organized|organizing|organizer|analyze|analyzed|behavior|behaviors|neighbor|neighbors|liter|liters|fiber|practicing|labeled|labeling|traveled|traveling|defense|aluminum|cozy|jewelry|pajamas|mom|realize|realized|recognize|recognized|summarize|summarized|memorize|memorized)\b/;
const PLACEHOLDER = /\b(TODO|TBC|lorem ipsum|xxx|\[placeholder\]|FIXME)\b/i;

function textsOf(o, out = []) {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => textsOf(x, out));
  else if (o && typeof o === "object") {
    // Quoted translations of the Qur'an (e.g. Saheeh International) are copied exactly, spelling and all.
    if (o.head && Array.isArray(o.head) && o.head.some((h) => /translation|meaning/i.test(String(h)))) return out;
    for (const [k, v] of Object.entries(o)) if (!["find", "file", "kind", "id", "subjectSlug", "year", "type", "item"].includes(k)) textsOf(v, out);
  }
  return out;
}

export function validateItem(item, file = "") {
  const p = [];
  if (!item || typeof item !== "object") return ["not an object"];
  for (const k of ["id", "title", "type", "subject", "subjectSlug", "year"]) if (!item[k]) p.push(`missing ${k}`);
  if (item.type && !TYPES.includes(item.type)) p.push(`unknown type "${item.type}"`);
  if (file && item.id && path.basename(file, ".json") !== item.id) p.push(`id "${item.id}" does not match the file name`);
  if (file && item.subjectSlug && item.year && !file.replace(/\\/g, "/").includes(`/${item.subjectSlug}/${item.year}/`)) p.push("file is not in <subject>/<year>/");
  if (!Array.isArray(item.blocks) || !item.blocks.length) p.push("no blocks");
  for (const [i, b] of (item.blocks || []).entries()) {
    const keys = Object.keys(b).filter((k) => BLOCK_KEYS.includes(k));
    if (!keys.length) p.push(`block ${i + 1}: unknown block (${Object.keys(b).join(", ")})`);
    if (b.questions) {
      if (!Array.isArray(b.questions) || !b.questions.length) p.push(`block ${i + 1}: empty questions`);
      for (const [j, q] of (b.questions || []).entries()) {
        if (!q || !String(q.q || "").trim()) p.push(`block ${i + 1} question ${j + 1}: no text`);
        if (q.marks != null && !(Number.isInteger(q.marks) && q.marks >= 0 && q.marks <= 30)) p.push(`block ${i + 1} question ${j + 1}: marks must be a whole number 0-30`);
        if (q.options && (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6)) p.push(`block ${i + 1} question ${j + 1}: 2-6 options`);
      }
    }
    if (b.grid) {
      if (!GRID_KINDS[b.grid.kind]) p.push(`block ${i + 1}: unknown grid kind "${b.grid.kind}"`);
    }
    if (b.frame && (!Array.isArray(b.frame) || b.frame.some((f) => !f.label))) p.push(`block ${i + 1}: every frame box needs a label`);
    if (b.practical && (!b.practical.method?.length || !b.practical.safety?.length)) p.push(`block ${i + 1}: a practical guide needs a method and safety points`);
  }
  if (["test paper", "mock paper"].includes(item.type)) {
    const qs = (item.blocks || []).flatMap((b) => b.questions || []);
    if (qs.some((q) => !q.marks && !(q.parts || []).some((x) => x.marks))) p.push("every question in a test or mock needs marks");
    if (qs.some((q) => !q.a && !(q.parts || []).every((x) => x.a))) p.push("every question in a test or mock needs a mark-scheme answer");
  }
  for (const s of textsOf(item)) {
    if (s.includes("—")) p.push(`em dash in "${s.slice(0, 50)}"`);
    if (PLACEHOLDER.test(s)) p.push(`placeholder text in "${s.slice(0, 50)}"`);
    const am = AMERICAN.exec(s);
    if (am && !/https?:|\bcolor=|font|css/i.test(s)) p.push(`American spelling "${am[0]}" in "${s.slice(0, 50)}"`);
  }
  return [...new Set(p)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let n = 0;
  let bad = 0;
  const lessons = new Map();
  for (const f of loadLessonFiles()) for (const l of f.data.lessons || []) lessons.set(`${f.slug}/${f.year}/${l.n}`, l);
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) {
        n++;
        let item;
        try {
          item = JSON.parse(fs.readFileSync(p, "utf8"));
        } catch (e) {
          bad++;
          console.error(`${path.relative(ROOT, p)}: not valid JSON (${e.message})`);
          continue;
        }
        const probs = validateItem(item, p);
        for (const ln of item.lessons || []) if (!lessons.has(`${item.subjectSlug}/${item.year}/${ln}`)) probs.push(`lesson ${ln} does not exist in ${item.subjectSlug}/${item.year}`);
        if (probs.length) {
          bad++;
          console.error(`${path.relative(ROOT, p)}: ${probs.join("; ")}`);
        }
      }
    }
  };
  walk(ITEMS_DIR);
  console.log(`${n} resource items checked, ${bad} with problems`);
  if (bad) process.exit(1);
}
