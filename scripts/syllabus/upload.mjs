// Uploads the built Syllabus & Specification pack (PPTX + PDF) to the portal's
// storage bucket lesson-decks under syllabus-pack/. Staff-only by the bucket's RLS.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/syllabus/upload.mjs <packDir>
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const dir = path.resolve(process.argv[2] || "dist/syllabus-pack");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const TYPES = { ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pdf": "application/pdf" };

const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (TYPES[path.extname(n).toLowerCase()]) files.push(p);
  }
})(dir);

let done = 0, failed = 0;
const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const f = queue.shift();
    const rel = "syllabus-pack/" + path.relative(dir, f).split(path.sep).join("/");
    const { error } = await supabase.storage.from("lesson-decks").upload(rel, fs.readFileSync(f), { upsert: true, contentType: TYPES[path.extname(f).toLowerCase()] });
    if (error) { failed++; console.error(`FAILED ${rel}: ${error.message}`); } else done++;
  }
}));
// Remove files in syllabus-pack/ that this build no longer produces (e.g. a dropped subject).
if (!failed) {
  const keep = new Set(files.map((f) => "syllabus-pack/" + path.relative(dir, f).split(path.sep).join("/")));
  const stale = [];
  async function scan(prefix) {
    const { data, error } = await supabase.storage.from("lesson-decks").list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const e of data) (e.id ? (keep.has(`${prefix}/${e.name}`) || stale.push(`${prefix}/${e.name}`)) : await scan(`${prefix}/${e.name}`));
  }
  await scan("syllabus-pack");
  if (stale.length) {
    const { error } = await supabase.storage.from("lesson-decks").remove(stale);
    console.log(error ? `Could not remove stale files: ${error.message}` : `Removed ${stale.length} stale files: ${stale.join(", ")}`);
  }
}
console.log(`Uploaded ${done} of ${files.length} files to lesson-decks/syllabus-pack/`);
process.exit(failed ? 1 : 0);
