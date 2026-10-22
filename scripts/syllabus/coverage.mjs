// Maps every official specification point to the TGA lessons that teach it, and reports gaps.
// Source of truth: content/syllabus/ks4/*.json (official content) + content/lessons/<slug>/y10|y11.json (our lessons).
// Output: content/syllabus/coverage/<slug>.json  (committed, rebuilt by CI), plus a console summary.
// The mapping is suggested by wording overlap; a teacher confirms it through the portal sign-off.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const STOP = new Set("the and for with that this from their they them are was were have has had not but all can any into out use used using how what when which who why its our your you will may must also than then these those about over under between within each such more most other only same some both through during without including include includes".split(" "));
const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/i, "").slice(0, 7);
const tokens = (s) => [...new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).map(stem))];

export function buildCoverage() {
  const out = {};
  for (const file of fs.readdirSync(path.join(root, "content/syllabus/ks4")).filter((f) => f.endsWith(".json")).sort()) {
    const spec = JSON.parse(fs.readFileSync(path.join(root, "content/syllabus/ks4", file), "utf8"));
    const lessons = [];
    for (const y of ["y10", "y11"]) {
      const lf = path.join(root, "content/lessons", spec.slug, `${y}.json`);
      if (!fs.existsSync(lf)) continue;
      for (const l of JSON.parse(fs.readFileSync(lf, "utf8")).lessons) {
        const text = [l.title, l.unit, ...(l.objectives || []), ...(l.keywords || []).flatMap((k) => [k.term, k.def]), l.bigQuestion].join(" ");
        lessons.push({ id: `${y}/${l.n}`, year: y, n: l.n, title: l.title, unit: l.unit || "", t: new Set(tokens(text)), refs: new Set((String(l.unit || "").match(/\d+(?:\.\d+)+|\b\d[A-Z]\b/g) || []).map((r) => r.toLowerCase())) });
      }
    }
    const units = spec.units.map((u) => {
      // Lessons that belong to this unit: its reference is in the lesson's unit name, or the unit title's words appear in the lesson.
      const ut = tokens(u.title);
      const inUnit = lessons.filter((l) => l.refs.has(String(u.ref).toLowerCase()) || (ut.length >= 2 && ut.filter((w) => l.t.has(w)).length / ut.length >= 0.6));
      const points = u.points.map((p, i) => {
        const pt = tokens(p);
        const rate = (l) => {
          const shared = pt.filter((w) => l.t.has(w)).length;
          return { l, shared, score: pt.length ? shared / pt.length : 0 };
        };
        const local = inUnit.map(rate).filter((x) => x.shared >= 2 && x.score >= 0.34);
        const far = lessons.filter((l) => !inUnit.includes(l)).map(rate).filter((x) => x.shared >= 3 && x.score >= 0.6);
        const scored = [...local, ...far].sort((a, b) => b.score - a.score).slice(0, 3);
        return { n: i + 1, text: p, lessons: scored.map((x) => x.l.id) };
      });
      const covered = points.filter((p) => p.lessons.length).length;
      const ls = [...new Set(points.flatMap((p) => p.lessons))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return { ref: u.ref, title: u.title, year: u.year, paper: u.paper, status: covered === points.length ? "covered" : covered === 0 ? "gap" : "partial", covered, total: points.length, lessons: ls, points };
    });
    const tot = units.reduce((t, u) => t + u.total, 0);
    const cov = units.reduce((t, u) => t + u.covered, 0);
    out[spec.slug] = { subject: spec.subject, board: spec.board, code: spec.code, lessonCount: lessons.length, points: tot, covered: cov, units };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cov = buildCoverage();
  fs.mkdirSync(path.join(root, "content/syllabus/coverage"), { recursive: true });
  for (const [slug, c] of Object.entries(cov)) {
    fs.writeFileSync(path.join(root, "content/syllabus/coverage", `${slug}.json`), JSON.stringify(c, null, 1));
    const gaps = c.units.filter((u) => u.status === "gap").length;
    console.log(`${slug.padEnd(20)} lessons ${String(c.lessonCount).padStart(3)}  points ${String(c.covered).padStart(3)}/${String(c.points).padEnd(3)} (${Math.round((100 * c.covered) / Math.max(1, c.points))}%)  units with no lesson: ${gaps}`);
  }
}
