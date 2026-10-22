// Moves "(verify)" style review flags off the slides. Pupil-facing fields are cleaned; the original wording
// is added to the lesson's first teacher note, so it stays in the speaker notes for the teacher to check.
// Run: node scripts/lessons/strip-review-flags.mjs   (safe to run again)
import fs from "node:fs";
import path from "node:path";

const ROOT = "content/lessons";
const SKIP = /\.(note|send)$/;
const FLAG = /\b(verify|specialist to check)\b/i;

function clean(s) {
  let t = s;
  // "(Qur'an 96:1, verify)", "(2010 census; verify)", "(taught in hadith; teacher to verify)" -> keep the reference, drop the flag
  t = t.replace(/\s*[,;]\s*(?:teacher to )?verify[^()]*(?=\))/gi, "");
  // "(verify)", "(teacher to verify wording)", "(Arabic specialist to check the text)" -> drop the whole bracket
  t = t.replace(/\s*\((?:[^()]*\b)?(?:teacher to verify|verify|specialist to check)\b[^()]*\)/gi, "");
  // trailing clause after a semicolon
  t = t.replace(/\s*;\s*teacher to verify[^.]*/gi, "");
  return t.replace(/\s+([.,])/g, "$1").trim();
}

let changed = 0;
let files = 0;
for (const subject of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, subject);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const file = path.join(dir, f);
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    let dirty = false;
    for (const lesson of j.lessons || []) {
      const flags = [];
      const walk = (o, p, set) => {
        if (typeof o === "string") {
          if (SKIP.test(p) || !FLAG.test(o)) return;
          const c = clean(o);
          if (c !== o && c) {
            flags.push(o);
            set(c);
          }
        } else if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${p}[]`, (v) => (o[i] = v)));
        else if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], `${p}.${k}`, (v) => (o[k] = v));
      };
      walk(lesson, "", () => {});
      if (flags.length) {
        const block = (lesson.teach || []).find((t) => t && typeof t === "object");
        const add = `Check before use: ${flags.map((x) => x.replace(/\s+/g, " ").slice(0, 170)).join(" | ")}`;
        if (block) block.note = block.note ? `${block.note} ${add}` : add;
        changed += flags.length;
        dirty = true;
      }
    }
    if (dirty) {
      fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
      files++;
    }
  }
}
console.log(`Cleaned ${changed} flagged strings in ${files} files`);
