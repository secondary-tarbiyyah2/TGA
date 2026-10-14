// Validates content/lessons/**.json against the lesson format. Exit 1 on problems.
// See content/lessons/README.md for the format, including the optional
// slide blocks (model, check, quote, …) defined in deck-parts.mjs.
import fs from "node:fs";
import path from "node:path";
const root = new URL("../../content/lessons/", import.meta.url).pathname;
const YEARS = ["reception", ...Array.from({ length: 11 }, (_, i) => `y${i + 1}`)];
const BLOCKS = ["model", "check", "quote", "compare", "timeline", "table", "code", "misconception", "cycle"];
let bad = 0, files = 0, lessons = 0;
const blockCount = Object.fromEntries(BLOCKS.map((k) => [k, 0]));
const err = (f, m) => { bad++; console.error(`${f}: ${m}`); };
const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every((x) => typeof x === "string" && x.trim());
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") ? [path.join(d, e.name)] : []); }

function checkBlock(id, t) {
  const kinds = BLOCKS.filter((k) => t[k] != null);
  if (kinds.length > 1) err(id, `teach slide "${t.heading}" has more than one block (${kinds.join(", ")})`);
  const k = kinds[0];
  if (!k) return false;
  blockCount[k]++;
  const v = t[k];
  const where = `${id} [${k}] "${t.heading}"`;
  switch (k) {
    case "model":
      if (!v.problem || !strs(v.steps, 2) || v.steps.length > 6) err(where, "model needs problem and 2-6 steps");
      break;
    case "check":
      if (!v.q || !strs(v.options, 3) || v.options.length > 4 || !Number.isInteger(v.answer) || v.answer < 0 || v.answer >= v.options.length) err(where, "check needs q, 3-4 options and a valid answer index");
      if (!v.why) err(where, "check needs why (explains the answer and the trap in the distractors)");
      break;
    case "quote":
      if (!v.text) err(where, "quote needs text");
      break;
    case "compare":
      if (!v.left?.title || !v.right?.title || !strs(v.left.points) || !strs(v.right.points)) err(where, "compare needs left/right {title, points[]}");
      break;
    case "timeline":
    case "cycle":
      if (!Array.isArray(v) || v.length < 3 || v.length > 6) err(where, `${k} needs 3-6 items`);
      else if (k === "timeline" && !v.every((e) => e.label && e.text)) err(where, "timeline items need label and text");
      else if (k === "cycle" && !strs(v, 3)) err(where, "cycle items are strings");
      break;
    case "table":
      if (!strs(v.head, 2) || !Array.isArray(v.rows) || !v.rows.length || v.rows.length > 8 || !v.rows.every((r) => Array.isArray(r) && r.length === v.head.length)) err(where, "table needs head and 1-8 rows of the same width");
      break;
    case "code":
      if (!v.text || String(v.text).split("\n").length > 16) err(where, "code needs text of at most 16 lines");
      break;
    case "misconception":
      if (!v.wrong || !v.right) err(where, "misconception needs wrong and right");
      break;
  }
  return true;
}

for (const f of walk(root)) {
  files++;
  const rel = path.relative(root, f);
  let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { err(rel, "invalid JSON " + e.message); continue; }
  if (!j.subject || !j.board || !YEARS.includes(j.year)) err(rel, "needs subject, board, valid year");
  if (!Array.isArray(j.lessons) || !j.lessons.length) { err(rel, "no lessons"); continue; }
  const seen = new Set();
  for (const l of j.lessons) {
    lessons++;
    const id = `${rel}#${l.n}`;
    if (!l.unit || !Number.isInteger(l.n) || !l.title) err(id, "needs unit, n, title");
    if (seen.has(l.n)) err(id, "duplicate n"); seen.add(l.n);
    if (!Array.isArray(l.objectives) || l.objectives.length < 1) err(id, "objectives");
    if (!Array.isArray(l.starter) || l.starter.length < 1) err(id, "starter");
    if (!Array.isArray(l.teach) || l.teach.length < 3 || l.teach.length > 7) err(id, "teach needs 3-7 slides");
    for (const t of l.teach || []) {
      const hasBlock = checkBlock(id, t);
      if (!t.heading || (!hasBlock && (!Array.isArray(t.bullets) || !t.bullets.length))) err(id, "teach slide needs heading + bullets (or a block)");
      if (t.bullets != null && !Array.isArray(t.bullets)) err(id, "bullets must be an array");
    }
    for (const k of ["practice", "independent", "exit"]) if (!Array.isArray(l[k]) || !l[k].length) err(id, k);
    if (!l.homework) err(id, "homework");
    if (!Array.isArray(l.keywords)) err(id, "keywords");
    if (l.successCriteria != null && (!strs(l.successCriteria) || l.successCriteria.length > 3)) err(id, "successCriteria: 1-3 strings (all / most / some)");
    for (const k of ["bigQuestion", "crossCurricular", "smsc"]) if (l[k] != null && (typeof l[k] !== "string" || !l[k].trim())) err(id, `${k} must be a non-empty string`);
  }
}
const used = Object.entries(blockCount).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
console.log(`${files} files, ${lessons} lessons, ${bad} problems${used ? ` · blocks: ${used}` : ""}`);
process.exit(bad ? 1 : 0);
