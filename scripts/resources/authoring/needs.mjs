// For each generated entry: the wording and the lesson's tasks that mention a sheet. node needs.mjs <subject> [year]
import { gen, lesson, clean } from "./hand.mjs";
const [, , s, y] = process.argv;
for (const e of gen(s, y)) {
  const l = lesson(s, e.year, e.lessons[0].n);
  const tasks = ["practice", "independent"].flatMap((k) => (l[k] || []).map((x) => clean(typeof x === "string" ? x : x.q))).filter((q) => /sheet|pdf|worksheet|card|frame|scenario|case|table|organiser|timeline|budget|plan|poster|template|grid|sort|chart|map|diagram|label/i.test(q));
  const teach = (l.teach || []).map((t) => `${clean(t.heading)}[${Object.keys(t).filter((k) => !["heading", "note", "bullets"].includes(k)).join(",")}]`).join("; ");
  console.log(`\n${e.year} L${l.n} ${e.type} | ${e.title}\n  teach: ${teach}`);
  for (const q of tasks) console.log(`  - ${q.slice(0, 330)}`);
}
