#!/usr/bin/env node
// Turns ESLint's JSON report into GitHub annotations, so each lint error
// shows on the pull request's "Files changed" tab next to the line.
// GitHub shows at most 10 error annotations per step, so the first 9 errors
// get their own annotation and the rest are listed together in a 10th.
// Usage: npx eslint -f json -o eslint.json; node scripts/ci/eslint-annotate.mjs eslint.json
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] || "eslint.json";
const results = JSON.parse(fs.readFileSync(file, "utf8"));
const enc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const errors = [];
for (const r of results) {
  for (const m of r.messages) {
    if (m.severity !== 2) continue;
    errors.push({ file: path.relative(process.cwd(), r.filePath), line: m.line || 1, col: m.column || 1, rule: m.ruleId || "parse", msg: m.message });
  }
}
errors.slice(0, 9).forEach((e) => console.log(`::error file=${e.file},line=${e.line},col=${e.col},title=${e.rule}::${enc(e.msg)}`));
if (errors.length > 9) {
  const rest = errors.slice(9).map((e) => `${e.file}:${e.line}:${e.col} ${e.rule} — ${e.msg}`).join("\n");
  console.log(`::error title=${errors.length - 9} more lint errors::${enc(rest)}`);
}
console.log(`${errors.length} lint error(s)`);
process.exit(errors.length ? 1 : 0);
