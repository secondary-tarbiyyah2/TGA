// Pictures for term resources (labelling sheets, maps, photos), from Wikimedia Commons.
//   node scripts/resources/pictures.mjs resolve   find a picture for every item's picture block that the
//                                                lessons' own cache (content/lesson-pictures.json) does not have
// Uses the lessons' picture finder (scripts/lessons/pictures.mjs: open licences only, never people).
// The choices are kept in content/resources/resource-pictures.json (the workflow caches it between runs).
// If Commons cannot be reached, items are built with a drawing box instead of the picture.
import fs from "node:fs";
import path from "node:path";
import { findPicture, keyOf, readCache } from "../lessons/pictures.mjs";
import { ITEMS_DIR, RES_DIR, ROOT } from "./lib.mjs";

const FILE = path.join(RES_DIR, "resource-pictures.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wanted() {
  const out = new Map();
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) {
        const item = JSON.parse(fs.readFileSync(p, "utf8"));
        for (const b of item.blocks || []) {
          if (b.picture && (b.picture.find || b.picture.file)) out.set(keyOf(b.picture), b.picture);
          for (const q of b.questions || []) if (q.picture && (q.picture.find || q.picture.file)) out.set(keyOf(q.picture), q.picture);
        }
      }
    }
  };
  walk(ITEMS_DIR);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "resolve") {
  const lessonCache = readCache(path.join(ROOT, "content/lesson-pictures.json")).pictures || {};
  const cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { note: "Pictures chosen for term resources by scripts/resources/pictures.mjs.", pictures: {} };
  let found = 0;
  let failed = 0;
  for (const [k, p] of wanted()) {
    if ((lessonCache[k] && !lessonCache[k].none) || (cache.pictures[k] && !cache.pictures[k].none)) continue;
    if (failed >= 4) break; // Commons unreachable or busy: build without the rest this time
    try {
      const e = await findPicture(p);
      cache.pictures[k] = e.none ? { find: p.find || p.file, none: true, checked: new Date().toISOString().slice(0, 10) } : e;
      if (!e.none) found++;
      await sleep(400);
    } catch (err) {
      failed++;
      console.log(`::warning::Commons search failed for "${p.find || p.file}" (${err.message})`);
      await sleep(2000);
    }
  }
  fs.writeFileSync(FILE, `${JSON.stringify(cache, null, 1)}\n`);
  console.log(`Resource pictures: ${found} newly found${failed ? `, ${failed} searches failed` : ""}`);
}
