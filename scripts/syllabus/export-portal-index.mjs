// Writes src/lib/learn/syllabusIndex.json: a compact copy of the KS4 specifications and
// the cross-curricular hubs, used by the Lesson library's "Spec points" and
// "Connections" tabs. Run: node scripts/syllabus/export-portal-index.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const dir = path.join(root, "content/syllabus/ks4");
const LABELS = {
  "gcse-science": "Pearson Edexcel IGCSE 4BI1 / 4CH1 / 4PH1 / 4SD0",
  "english-literature": "Pearson Edexcel IGCSE 4ET1",
  business: "Pearson Edexcel IGCSE 4BS1",
  "islamic-studies": "Pearson Edexcel IGCSE 4IS1",
};
const specs = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  specs[d.slug] = {
    subject: d.subject,
    board: d.board,
    code: d.code,
    label: LABELS[d.slug] || `${d.board} ${d.code}`,
    status: d.status,
    statusNote: d.statusNote || "",
    qualification: d.qualification || "",
    tiers: d.tiers || "",
    nonExam: typeof d.nonExam === "string" ? d.nonExam : "",
    assessment: (d.assessment || []).map((a) => ({ paper: a.paper, title: a.title || "", duration: a.duration || "", marks: a.marks ?? "", weight: a.weight || "", content: a.content || "", format: a.format || "" })),
    aos: (d.aos || []).map((a) => ({ code: a.code, desc: a.desc, weight: a.weight || "" })),
    commandWords: (d.commandWords || []).map((c) => ({ word: c.word, meaning: c.meaning })),
    gaps: d.gaps || [],
    units: (d.units || []).map((u) => ({ ref: u.ref, title: u.title, paper: u.paper || "", year: u.year || "", points: u.points || [] })),
  };
}
const syllabi = {};
const dir2 = path.join(root, "content/syllabus/ks1-3");
for (const f of fs.readdirSync(dir2).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir2, f), "utf8"));
  syllabi[d.slug] = {
    subject: d.subject,
    framework: d.framework || "",
    status: d.status,
    statusNote: d.statusNote || "",
    years: Object.fromEntries(Object.entries(d.yearMap || {}).map(([y, us]) => [y, us.map((u) => ({ unit: u.unit, focus: u.focus || [], skills: u.skills || [], keyTerms: u.keyTerms || [], assess: u.assess || "" }))])),
  };
}
const hubs = JSON.parse(fs.readFileSync(path.join(root, "content/syllabus/matrices/hubs.json"), "utf8")).hubs.map((h) => ({
  id: h.id,
  title: h.title,
  hook: h.hook,
  nodes: h.nodes.map((n) => ({ subject: n.subject, ref: n.ref, note: n.note })),
}));
const out = path.join(root, "src/lib/learn/syllabusIndex.json");
fs.writeFileSync(out, JSON.stringify({ specs, syllabi, hubs }));
console.log(`wrote ${path.relative(root, out)} (${fs.statSync(out).size} bytes): ${Object.keys(specs).length} specs, ${hubs.length} hubs`);
