// Suggested links from revision-pack video chapters to specification units.
// Chapters already carry a title, a length or start time, and key words (content/revision/*.json).
// A chapter is matched to a unit by word overlap with the unit's title, terms and points.
// Matches are suggestions for a teacher to confirm; they are never treated as certain.
import fs from "node:fs";
import path from "node:path";
import { ROOT, clean } from "./lib.mjs";
import { groupOf } from "./matrix.mjs";

const STOP = new Set("the a an and or of to in on for with is are as at by from that this it its be into than then their they them his her which who what why how one two three all any not only also more most such can may must should about between within through over under".split(" "));
const toks = (s) => new Set(clean(s).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]+/gu, " ").split(" ").filter((w) => w.length > 3 && !STOP.has(w)));
const stem = (w) => w.replace(/(ings|ing|ies|es|s|ed|ly)$/, "");
const stems = (set) => new Set([...set].map(stem));

export function loadChapters() {
  const dir = path.join(ROOT, "content/revision");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    (p.summary || []).forEach((s, i) => {
      const kw = (s.keywords || []).map((k) => (typeof k === "string" ? k : `${k.t} ${k.d || ""}`)).join(" ");
      out.push({
        pack: p.title, packFile: f, subject: p.subject, year: p.year, unit: p.unit,
        chapter: i + 1, title: s.title, length: s.length || null, time: s.time || null,
        start: s.start ?? null, end: s.end ?? null,
        text: `${s.title} ${(s.points || []).join(" ")} ${kw}`,
      });
    });
  }
  return out;
}

/** Returns Map(unitRef -> [{pack, chapter, title, when, score}]) for one spec file. */
export function videoMapFor(spec, chapters) {
  const g = groupOf(spec.subject);
  const mine = chapters.filter((c) => groupOf(c.subject) === g);
  const map = new Map();
  if (!mine.length) return map;
  const unitToks = spec.units.map((u) => stems(toks(`${u.title} ${(u.keyTerms || []).join(" ")} ${(u.points || []).join(" ")}`)));
  const df = {};
  unitToks.forEach((t) => t.forEach((w) => (df[w] = (df[w] || 0) + 1)));
  for (const c of mine) {
    const ct = stems(toks(c.text));
    let best = null;
    spec.units.forEach((u, i) => {
      let score = 0;
      const shared = [];
      ct.forEach((w) => { if (unitToks[i].has(w)) { score += 1 / Math.log(2 + (df[w] || 1)); shared.push(w); } });
      if (shared.length >= 3 && (!best || score > best.score)) best = { u, score, shared };
    });
    if (best && best.score >= 2.0) {
      const when = c.length ? `${c.length}` : c.time ? `from ${c.time}` : c.start != null ? `${Math.floor(c.start / 60)}:${String(c.start % 60).padStart(2, "0")}` : "";
      (map.get(best.u.ref) || map.set(best.u.ref, []).get(best.u.ref)).push({ pack: c.pack, chapter: c.chapter, title: c.title, when, score: Number(best.score.toFixed(2)), shared: best.shared.slice(0, 5) });
    }
  }
  return map;
}
