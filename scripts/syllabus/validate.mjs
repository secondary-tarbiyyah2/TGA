// Validates content/syllabus/**/*.json. Usage: node scripts/syllabus/validate.mjs [dir]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || new URL("../../content/syllabus", import.meta.url).pathname);
const errs = [];
const warn = [];
const e = (f, m) => errs.push(`${path.relative(root, f)}: ${m}`);
const w = (f, m) => warn.push(`${path.relative(root, f)}: ${m}`);
const str = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => Array.isArray(v) && v.length > 0;
const words = (s) => String(s).trim().split(/\s+/).length;

function common(f, d) {
  if (!str(d.subject)) e(f, "subject missing");
  if (!str(d.slug)) e(f, "slug missing");
  if (!["Verified", "Provisional"].includes(d.status)) e(f, "status must be Verified or Provisional");
  if (!str(d.statusNote)) e(f, "statusNote missing");
  if (!arr(d.sources)) e(f, "sources missing (list the pages you opened)");
  else d.sources.forEach((s, i) => { if (!str(s.title) || !/^https?:\/\//.test(s.url || "")) e(f, `sources[${i}] needs title and http(s) url`); });
  if (d.status === "Verified" && !arr(d.sources)) e(f, "Verified needs sources");
  if (!Array.isArray(d.gaps)) e(f, "gaps must be an array (may be empty)");
  (d.links || []).forEach((l, i) => { if (!str(l.with) || !str(l.topic) || !str(l.how)) e(f, `links[${i}] needs with, topic, how`); });
}
function statement(f, where, s) {
  if (!str(s)) return e(f, `${where}: empty statement`);
  if (words(s) > 22) w(f, `${where}: long statement (${words(s)} words): ${s.slice(0, 50)}…`);
}

function spec(f, d) {
  common(f, d);
  for (const k of ["board", "qualification", "code", "years", "tiers", "nonExam"]) if (!str(d[k])) e(f, `${k} missing`);
  if (!arr(d.assessment)) e(f, "assessment missing");
  else d.assessment.forEach((p, i) => { for (const k of ["paper", "title", "duration", "weight", "content", "format"]) if (!str(p[k])) e(f, `assessment[${i}].${k} missing`); if (typeof p.marks !== "number") e(f, `assessment[${i}].marks must be a number`); });
  if (!arr(d.aos)) e(f, "aos missing");
  if (!arr(d.units)) e(f, "units missing");
  else d.units.forEach((u, i) => {
    for (const k of ["ref", "title", "paper", "year"]) if (!str(u[k])) e(f, `units[${i}].${k} missing`);
    if (!["Y10", "Y11"].includes(u.year)) e(f, `units[${i}].year must be Y10 or Y11`);
    if (!arr(u.points) || u.points.length < 1) e(f, `units[${i}] (${u.ref}) needs at least 1 point`); else if (u.points.length < 2) w(f, `units[${i}] (${u.ref}) has only 1 point`);
    (u.points || []).forEach((p, j) => statement(f, `units[${i}].points[${j}]`, p));
    if (u.points && u.points.length > 12) w(f, `units[${i}] (${u.ref}) has ${u.points.length} points: split it`);
  });
  if (!arr(d.commandWords)) w(f, "commandWords empty");
  if (!arr(d.skills)) w(f, "skills empty");
  if (!arr(d.links)) w(f, "no cross-curricular links");
  if (d.units && new Set(d.units.map((u) => u.ref)).size !== d.units.length) e(f, "duplicate unit refs");
  // examEntry: the course is taught from this (UK GCSE) spec but pupils are entered for another qualification.
  if (d.examEntry != null) {
    const x = d.examEntry;
    for (const k of ["board", "qualification", "code", "label", "papers", "series", "privateCandidates"]) if (!str(x[k])) e(f, `examEntry.${k} missing`);
    if (!arr(x.notes)) e(f, "examEntry.notes missing (what teachers must add or change for the exam)");
    if (!arr(x.sources)) e(f, "examEntry.sources missing");
    else x.sources.forEach((s, i) => { if (!str(s.title) || !/^https?:\/\//.test(s.url || "")) e(f, `examEntry.sources[${i}] needs title and http(s) url`); });
    if (str(x.code) && x.code === d.code) e(f, "examEntry.code is the same as the taught spec code: remove examEntry");
  }
}

const YEARS = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9"];
function syllabus(f, d) {
  common(f, d);
  if (!str(d.framework)) e(f, "framework missing");
  if (!arr(d.purpose)) e(f, "purpose missing");
  if (!arr(d.keyStages)) e(f, "keyStages missing");
  else d.keyStages.forEach((k, i) => { if (!str(k.ks) || !str(k.years) || !arr(k.strands)) e(f, `keyStages[${i}] incomplete`); (k.strands || []).forEach((s, j) => { if (!str(s.strand) || !arr(s.statements)) e(f, `keyStages[${i}].strands[${j}] incomplete`); (s.statements || []).forEach((t, n) => statement(f, `keyStages[${i}].strands[${j}][${n}]`, t)); }); });
  if (!d.yearMap || typeof d.yearMap !== "object") e(f, "yearMap missing");
  else {
    for (const y of Object.keys(d.yearMap)) {
      if (!YEARS.includes(y)) e(f, `yearMap key ${y} invalid`);
      if (!arr(d.yearMap[y])) e(f, `yearMap.${y} empty`);
      (d.yearMap[y] || []).forEach((u, i) => { if (!str(u.unit) || !arr(u.focus)) e(f, `yearMap.${y}[${i}] needs unit and focus`); for (const k of ["assess", "prereq", "leadsTo"]) if (!str(u[k])) w(f, `yearMap.${y}[${i}].${k} missing`); });
    }
    const have = Object.keys(d.yearMap);
    if (have.length < 6) w(f, `yearMap only covers ${have.join(",")}`);
  }
  if (!Array.isArray(d.progression) || d.progression.length < 2) w(f, "progression threads missing or fewer than 2");
  if (!str(d.toKS4)) w(f, "toKS4 missing");
}

const specRefs = {};
function matrix(f, d) {
  if (!str(d.kind)) e(f, "kind missing");
  if (d.kind === "hubs") hubsToCheck.push([f, d]);
}
const hubsToCheck = [];
function checkHubs() {
  const slug = { Science: "gcse-science", Mathematics: "mathematics", Geography: "geography", History: "history", "English Language": "english-language", "English Literature": "english-literature", Business: "business", Computing: "computing", Arabic: "arabic", "Islamic Studies": "islamic-studies" };
  for (const [f, d] of hubsToCheck) for (const h of d.hubs) for (const n of h.nodes) {
    const sp = path.join(root, "ks4", `${slug[n.subject]}.json`);
    if (!slug[n.subject] || !fs.existsSync(sp)) { e(f, `${h.id}: unknown subject ${n.subject}`); continue; }
    const units = JSON.parse(fs.readFileSync(sp, "utf8")).units.map((u) => u.ref);
    if (!units.includes(n.ref)) e(f, `${h.id}: ${n.subject} has no unit ${n.ref}`);
  }
}

function walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) { if (n !== "coverage") walk(p); }
    else if (n.endsWith(".json")) {
      let d;
      try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch (x) { e(p, `invalid JSON: ${x.message}`); continue; }
      if (d.kind === "spec") spec(p, d);
      else if (d.kind === "syllabus") syllabus(p, d);
      else matrix(p, d);
    }
  }
}
walk(root);
checkHubs();
warn.forEach((m) => console.log("warn  " + m));
errs.forEach((m) => console.log("ERROR " + m));
console.log(`\n${errs.length} errors, ${warn.length} warnings`);
process.exit(errs.length ? 1 : 0);
