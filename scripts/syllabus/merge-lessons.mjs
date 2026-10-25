// Appends authored lessons from content/lessons-staging/<key>/<subject>/<year>.json into
// content/lessons/<subject>/<year>.json. Lesson numbers continue after the existing ones;
// each appended lesson carries its own board so decks show the right exam board.
// Retired lessons (content/retired-lessons.json) are skipped and their numbers are not reused.
//   node scripts/syllabus/merge-lessons.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { maxRetiredNo, retiredTitles } from "../lessons/retired.mjs";
const ROOT = new URL("../../", import.meta.url).pathname;
const stage = path.join(ROOT, "content/lessons-staging");
const dry = process.argv.includes("--dry");
const keys = fs.existsSync(stage) ? fs.readdirSync(stage).sort() : [];
const added = {};
for (const key of keys) {
  for (const slug of fs.readdirSync(path.join(stage, key))) {
    for (const f of fs.readdirSync(path.join(stage, key, slug)).filter((x) => x.endsWith(".json")).sort()) {
      const inc = JSON.parse(fs.readFileSync(path.join(stage, key, slug, f), "utf8"));
      const target = path.join(ROOT, "content/lessons", slug, f);
      const cur = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : { subject: inc.subject, year: inc.year, board: inc.board, boardShort: inc.boardShort, source: inc.source, lessons: [] };
      // Numbers continue after the existing AND the retired lessons, so a retired number is never reused;
      // a staged lesson that was retired (content/retired-lessons.json, matched by title) is not merged back.
      const year = f.replace(/\.json$/, "");
      let n = Math.max(0, maxRetiredNo(slug, year), ...cur.lessons.map((l) => l.n));
      const have = new Set(cur.lessons.map((l) => `${l.unit}|${l.title}`));
      const gone = retiredTitles(slug, year);
      for (const l of inc.lessons) {
        if (have.has(`${l.unit}|${l.title}`) || gone.has(String(l.title).trim().toLowerCase())) continue;
        cur.lessons.push({ ...l, n: ++n, board: inc.board, boardShort: inc.boardShort || undefined });
        added[`${slug}/${f}`] = (added[`${slug}/${f}`] || 0) + 1;
      }
      if (inc.source && !String(cur.source || "").includes(inc.source)) cur.source = `${cur.source ? cur.source + " | " : ""}${inc.source}`;
      if (!dry) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(cur, null, 2)); }
    }
  }
}
console.log(dry ? "Would add:" : "Added:", added);
