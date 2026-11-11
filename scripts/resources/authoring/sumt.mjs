// Summarise the items of one term (TERM_ID) for subjects: node sumt.mjs <subject,...>
import { gen, readItem } from "./hand.mjs";
for (const s of process.argv[2].split(",")) {
  for (const e of gen(s)) {
    const it = readItem(e);
    if (!it) {
      console.log(`${e.year} MISSING ${e.id}`);
      continue;
    }
    const bl = it.blocks
      .map((b) => {
        const k = Object.keys(b)[0];
        const v = b[k];
        if (k === "questions") return `Q${v.length}${v.filter((q) => !q.a).length ? "(noA" + v.filter((q) => !q.a).length + ")" : ""}`;
        if (k === "h") return `#${String(v).slice(0, 14)}`;
        if (k === "grid") return `grid:${v.kind}`;
        if (k === "table") return `tbl${v.rows.length}`;
        return k;
      })
      .join(" ");
    console.log(`${s.slice(0, 4)} ${e.year} ${it.type.slice(0, 9).padEnd(9)} ${it.title.slice(0, 52).padEnd(52)} | ${bl.slice(0, 150)}`);
  }
}
