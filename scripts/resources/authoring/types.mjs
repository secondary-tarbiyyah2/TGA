// Add overrides.json type entries where an item's type differs from its register entry: node types.mjs <subject,...>
import fs from "node:fs";
import path from "node:path";
import { WT, reg, readItem } from "./hand.mjs";
const subjects = process.argv[2].split(",");
const f = path.join(WT, "content/resources/overrides.json");
const o = JSON.parse(fs.readFileSync(f, "utf8"));
let n = 0;
for (const e of reg.filter((x) => subjects.includes(x.subjectSlug) && x.source === "generated")) {
  const it = readItem(e);
  if (it && it.type !== e.type) {
    o[e.id] = { ...(o[e.id] || {}), type: it.type };
    n++;
  }
}
fs.writeFileSync(f, `${JSON.stringify(o, null, 1)}\n`);
console.log(`${n} type overrides`);
