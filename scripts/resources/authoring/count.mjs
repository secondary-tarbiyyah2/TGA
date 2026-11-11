// Count items per subject and type for a term: node count.mjs <subject,...>
import { reg, readItem } from "./hand.mjs";
for (const s of process.argv[2].split(",")) {
  const t = {};
  let n = 0;
  for (const e of reg.filter((x) => x.subjectSlug === s && x.source === "generated")) {
    const it = readItem(e);
    if (!it) continue;
    n++;
    t[it.type] = (t[it.type] || 0) + 1;
  }
  console.log(`${s}: ${n} (${Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ")})`);
}
