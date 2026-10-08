// Validates content/lessons/**.json against the lesson format. Exit 1 on problems.
import fs from "node:fs";
import path from "node:path";
const root = new URL("../../content/lessons/", import.meta.url).pathname;
const YEARS = ["reception", ...Array.from({ length: 11 }, (_, i) => `y${i + 1}`)];
let bad = 0, files = 0, lessons = 0;
const err = (f, m) => { bad++; console.error(`${f}: ${m}`); };
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") ? [path.join(d, e.name)] : []); }
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
    for (const t of l.teach || []) if (!t.heading || !Array.isArray(t.bullets) || !t.bullets.length) err(id, "teach slide needs heading + bullets");
    for (const k of ["practice", "independent", "exit"]) if (!Array.isArray(l[k]) || !l[k].length) err(id, k);
    if (!l.homework) err(id, "homework");
    if (!Array.isArray(l.keywords)) err(id, "keywords");
  }
}
console.log(`${files} files, ${lessons} lessons, ${bad} problems`);
process.exit(bad ? 1 : 0);
