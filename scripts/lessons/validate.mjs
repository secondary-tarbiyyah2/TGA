// Validates content/lessons/**.json against the lesson format. Exit 1 on problems.
// See content/lessons/README.md for the format, including the optional
// slide blocks (model, check, quote, …) defined in deck-parts.mjs.
import fs from "node:fs";
import path from "node:path";
import { retiredChecker } from "./retired.mjs";
import { BLOCKS, ITEM_SECTIONS, assessmentModeOf, blockProblems, detectAssessment, extrasProblems, hasAnswers, lessonWarnings } from "../../src/lib/learn/lessonSchema.mjs";
const root = process.env.LESSONS_DIR ? new URL(process.env.LESSONS_DIR.replace(/\/?$/, "/"), "file://" + process.cwd() + "/").pathname : new URL("../../content/lessons/", import.meta.url).pathname;
// Year 1 to Year 11 only: the Academy does not run Reception.
const YEARS = Array.from({ length: 11 }, (_, i) => `y${i + 1}`);
// Subjects not taught in a year (History is not offered at KS4 / GCSE).
const NOT_TAUGHT = { history: ["y10", "y11"] };
let bad = 0, files = 0, lessons = 0;
const blockCount = Object.fromEntries(BLOCKS.map((k) => [k, 0]));
const extraCount = { answers: 0, hook: 0, routines: 0, resources: 0, ponder: 0, pictures: 0, islamicLink: 0, models: 0, assessments: 0 };
// Lessons v3 advice (one objective, up to 3 criteria, no cold calls…): warnings, never errors,
// so older lessons still build. --warnings lists every one; otherwise the first 25 and a count.
const showAll = process.argv.includes("--warnings");
const warnings = [];
const DEFAULT_LEN = (y) => (y === "y1" || y === "y2" ? 30 : Number(String(y).slice(1)) <= 6 ? 45 : 50);
const err = (f, m) => { bad++; console.error(`${f}: ${m}`); };
const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every((x) => typeof x === "string" && x.trim());
// Files starting with "_" are not lesson files.
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") && !e.name.startsWith("_") ? [path.join(d, e.name)] : []); }

// Block shapes and limits live in src/lib/learn/lessonSchema.mjs (shared with the portal and the sync).
function checkBlock(id, t) {
  const { kind, problems } = blockProblems(t);
  problems.forEach((m) => err(`${id}${kind ? ` [${kind}]` : ""} "${t.heading}"`, m));
  if (!kind) return false;
  blockCount[kind]++;
  return true;
}

// Placeholder text left in a lesson is a PROBLEM, not a warning: dummy key words ({ term: "term", def: "def" }),
// "TODO" / "TBC" / "TBD", "lorem ipsum", "xxx", placeholder text, and empty strings where text is required.
// "term" and "placeholder" are also real maths words (a term of a sequence; a placeholder zero), so a key word
// is only flagged when its definition is missing or a stand-in, and "placeholder" only when it IS the text.
// "..." is not flagged: it is a real answer (an ellipsis) and marks fill-in cells in pupil tables.
const STAND_IN_DEF = /^\s*(def|definition|meaning|tbc|tbd|todo|xxx+|\.\.\.|…|-)?\s*$/i;
const INLINE_PLACEHOLDER = [/\bTODO\b/, /\bTB[CD]\b/, /lorem ipsum/i, /\bx{3,}\b/i, /[[<{]\s*placeholder/i, /\(\s*placeholder\s*\)/i, /\bplaceholder (text|content|lesson|question|answer|image|picture)\b/i];
const WHOLE_PLACEHOLDER = /^\s*(placeholder|todo|tbc|tbd|xxx+|lorem ipsum.*|insert .*here)\s*[.:]?\s*$/i;
function placeholderProblems(l) {
  const p = [];
  (Array.isArray(l.keywords) ? l.keywords : []).forEach((k, i) => {
    const term = k && typeof k === "object" ? k.term : k;
    const def = k && typeof k === "object" ? k.def : undefined;
    if (typeof term !== "string" || !term.trim()) p.push(`keywords[${i}]: empty key word`);
    else if (k && typeof k === "object" && (typeof def !== "string" || STAND_IN_DEF.test(def) || def.trim().toLowerCase() === term.trim().toLowerCase()))
      p.push(`keywords[${i}] "${term}": placeholder definition ("${def ?? ""}"): write a real, child-friendly definition`);
  });
  const required = (v, where) => { if (typeof v === "string" && !v.trim()) p.push(`${where}: empty text`); };
  ["unit", "title", "bigQuestion", "homework", "send"].forEach((k) => required(l[k], k));
  ["objectives", "successCriteria", "resources"].forEach((k) => (Array.isArray(l[k]) ? l[k] : []).forEach((v, i) => required(v, `${k}[${i}]`)));
  if (l.hook && typeof l.hook === "object") required(l.hook.text, "hook.text");
  (Array.isArray(l.teach) ? l.teach : []).forEach((t, i) => {
    if (!t || typeof t !== "object") return;
    required(t.heading, `teach ${i + 1} heading`);
    (Array.isArray(t.bullets) ? t.bullets : []).forEach((b, j) => required(b, `teach ${i + 1} bullet ${j + 1}`));
  });
  ITEM_SECTIONS.forEach((k) => (Array.isArray(l[k]) ? l[k] : []).forEach((x, i) => {
    if (typeof x === "string") required(x, `${k} ${i + 1}`);
    else if (x && typeof x === "object") ["q", "a", "model"].forEach((f) => required(x[f], `${k} ${i + 1}.${f}`));
  }));
  // Placeholder words anywhere in the lesson's text (key word terms and teach headings may name the real idea).
  const seen = (s, where, key) => {
    if (INLINE_PLACEHOLDER.some((re) => re.test(s))) p.push(`${where}: placeholder text "${s.slice(0, 60)}"`);
    else if (key !== "term" && key !== "heading" && WHOLE_PLACEHOLDER.test(s) && s.trim()) p.push(`${where}: placeholder text "${s.slice(0, 60)}"`);
  };
  const walkText = (v, where, key) => {
    if (typeof v === "string") seen(v, where, key);
    else if (Array.isArray(v)) v.forEach((x, i) => walkText(x, `${where}[${i}]`, key));
    else if (v && typeof v === "object") Object.entries(v).forEach(([kk, x]) => walkText(x, where ? `${where}.${kk}` : kk, kk));
  };
  walkText(l, "", null);
  return p;
}

const isRetired = retiredChecker();
for (const f of walk(root)) {
  files++;
  const rel = path.relative(root, f);
  let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { err(rel, "invalid JSON " + e.message); continue; }
  if (!j.subject || !j.board || !YEARS.includes(j.year)) err(rel, "needs subject, board, valid year (Year 1 to Year 11)");
  const slug = rel.split(/[\\/]/)[0];
  if ((NOT_TAUGHT[slug] || []).includes(j.year)) err(rel, `${j.subject} is not taught in ${j.year.toUpperCase()}`);
  if (!Array.isArray(j.lessons) || !j.lessons.length) { err(rel, "no lessons"); continue; }
  const seen = new Set();
  const [subjectSlug] = rel.split(path.sep);
  for (const l of j.lessons) {
    lessons++;
    const id = `${rel}#${l.n}`;
    // A retired lesson (content/retired-lessons.json) must be removed from the file, not left beside the list.
    if (!process.env.LESSONS_DIR && isRetired(subjectSlug, j.year, l.n)) err(id, "is listed in content/retired-lessons.json: remove it from this file (its number is not reused)");
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
    // Items may be strings or { q, a?, mins? }; plus the optional hook, routines and resources.
    extrasProblems(l).forEach((m) => err(id, m));
    placeholderProblems(l).forEach((m) => err(id, m));
    if (ITEM_SECTIONS.some((k) => hasAnswers(l[k]))) extraCount.answers++;
    for (const k of ["hook", "routines", "resources", "pictures", "islamicLink"]) if (l[k] != null) extraCount[k]++;
    if (l.hook && l.hook.type === "ponder") extraCount.ponder++;
    if (assessmentModeOf(l)) extraCount.assessments++;
    // A test, mock or quiz should say so (assessmentMode), so the build does not rely on the title.
    const found = detectAssessment(l);
    if (found && l.assessmentMode == null) warnings.push(`${id}: looks like a ${found.mode} ("${found.matched}"): set "assessmentMode": "${found.mode}" (or false if it is not one)`);
    if (ITEM_SECTIONS.some((k) => (l[k] || []).some((x) => x && typeof x === "object" && x.model))) extraCount.models++;
    lessonWarnings(l, subjectSlug, l.duration || DEFAULT_LEN(j.year)).forEach((m) => warnings.push(`${id}: ${m}`));
    if (!l.homework) err(id, "homework");
    if (!Array.isArray(l.keywords)) err(id, "keywords");
    if (l.successCriteria != null && !strs(l.successCriteria)) err(id, "successCriteria: 1-3 strings (all / most / some)");
    for (const k of ["bigQuestion", "crossCurricular", "smsc"]) if (l[k] != null && (typeof l[k] !== "string" || !l[k].trim())) err(id, `${k} must be a non-empty string`);
  }
}
const used = Object.entries(blockCount).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
const extras = Object.entries(extraCount).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");
console.log(`${files} files, ${lessons} lessons, ${bad} problems${used ? ` · blocks: ${used}` : ""}${extras ? ` · lessons with ${extras}` : ""}`);
if (warnings.length) {
  console.log(`${warnings.length} warning(s) (advice only, the lessons still build)${showAll ? ":" : `; the first 25 (run with --warnings for all):`}`);
  (showAll ? warnings : warnings.slice(0, 25)).forEach((w) => console.log(`  warning: ${w}`));
}
process.exit(bad ? 1 : 0);
