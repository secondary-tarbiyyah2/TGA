// Dump lessons compactly: node les.mjs <subject> <year> <n,n,...> [full]
import fs from "node:fs";
import path from "node:path";
import { WT } from "./hand.mjs";
const [, , s, y, ns, full] = process.argv;
const d = JSON.parse(fs.readFileSync(path.join(WT, "content/lessons", s, `${y}.json`), "utf8"));
const want = ns ? ns.split(",").map(Number) : null;
const str = (v) => (typeof v === "string" ? v : Array.isArray(v) ? v.map(str).join(" | ") : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}=${str(x)}`).join("; ") : String(v ?? ""));
for (const l of d.lessons.filter((l) => !want || want.includes(l.n))) {
  console.log(`\n=== L${l.n} ${l.title} [${l.unit}]`);
  console.log(`res: ${str(l.resources)}\nhw: ${str(l.homework)}`);
  console.log(`kw: ${str((l.keywords || []).map((k) => `${k.term}: ${k.def}`))}`);
  for (const t of l.teach || []) {
    const { note, ...rest } = t;
    console.log(` T ${str(rest).slice(0, full ? 3000 : 700)}`);
  }
  for (const sec of ["starter", "practice", "independent", "exit"]) for (const x of l[sec] || []) console.log(` ${sec[0].toUpperCase()} ${str(x).slice(0, full ? 2000 : 400)}`);
}
