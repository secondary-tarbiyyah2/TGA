// Writes src/lib/learn/syllabusIndex.json: a compact copy of the KS4 specifications and
// the cross-curricular hubs, used by the Lesson library's "Spec points" and
// "Connections" tabs. Run: node scripts/syllabus/export-portal-index.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const dir = path.join(root, "content/syllabus/ks4");
const specs = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  specs[d.slug] = {
    subject: d.subject,
    board: d.board,
    code: d.code,
    status: d.status,
    units: (d.units || []).map((u) => ({ ref: u.ref, title: u.title, paper: u.paper || "", year: u.year || "", points: u.points || [] })),
  };
}
const hubs = JSON.parse(fs.readFileSync(path.join(root, "content/syllabus/matrices/hubs.json"), "utf8")).hubs.map((h) => ({
  id: h.id,
  title: h.title,
  hook: h.hook,
  nodes: h.nodes.map((n) => ({ subject: n.subject, ref: n.ref, note: n.note })),
}));
const out = path.join(root, "src/lib/learn/syllabusIndex.json");
fs.writeFileSync(out, JSON.stringify({ specs, hubs }));
console.log(`wrote ${path.relative(root, out)} (${fs.statSync(out).size} bytes): ${Object.keys(specs).length} specs, ${hubs.length} hubs`);
