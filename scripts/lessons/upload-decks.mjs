// Loads built lesson decks into Supabase (storage bucket lesson-decks + table curriculum_lessons).
//   node scripts/lessons/upload-decks.mjs plan   <decksDir>   -> writes <decksDir>/needed.json (decks that still need a file)
//   node scripts/lessons/upload-decks.mjs upload <decksDir>   -> uploads the needed decks (+ PDFs if converted)
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Teacher-edited lessons (version > 1) are never overwritten;
// set FORCE=1 to re-upload generated decks that already exist (still never touching edited ones).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [mode, dirArg] = process.argv.slice(2);
const dir = path.resolve(dirArg || "out/decks");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !["plan", "upload"].includes(mode)) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node upload-decks.mjs plan|upload <dir>");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const force = process.env.FORCE === "1";

async function existingRows() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("curriculum_lessons")
      .select("id, subject_slug, year, lesson_no, deck_path, version")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) out.set(`${r.subject_slug}/${r.year}/${r.lesson_no}`, r);
    if (data.length < 1000) break;
  }
  return out;
}

const keyOf = (m) => `${m.subject_slug}/${m.year}/${m.lesson_no}`;
const existing = await existingRows();
const needsFile = (m) => {
  const row = existing.get(keyOf(m));
  if (!row) return true;
  if (row.version > 1) return false; // a teacher has edited it: never overwrite
  return force || !row.deck_path;
};

if (mode === "plan") {
  const needed = manifest.filter(needsFile).map((m) => m.file);
  fs.writeFileSync(path.join(dir, "needed.json"), JSON.stringify(needed));
  console.log(`${needed.length} of ${manifest.length} decks need uploading`);
  process.exit(0);
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

let uploaded = 0;
let metaOnly = 0;
let failed = 0;
await pool(manifest, 6, async (m) => {
  const row = existing.get(keyOf(m));
  const meta = {
    subject_slug: m.subject_slug,
    subject: m.subject,
    year: m.year,
    board: m.board,
    unit: m.unit,
    lesson_no: m.lesson_no,
    title: m.title,
    duration: m.duration,
    objectives: m.objectives,
  };
  try {
    if (!needsFile(m)) {
      // Keep wording/ordering current without touching files or edited versions.
      if (row && row.version === 1) {
        await supabase.from("curriculum_lessons").update(meta).eq("id", row.id);
        metaOnly++;
      }
      return;
    }
    const base = path.basename(m.file, ".pptx");
    const deckPath = `${m.subject_slug}/${m.year}/${m.lesson_no}/v1-${base}.pptx`;
    const pdfLocal = path.join(dir, m.file.replace(/\.pptx$/, ".pdf"));
    const hasPdf = fs.existsSync(pdfLocal);
    const pdfPath = hasPdf ? deckPath.replace(/\.pptx$/, ".pdf") : null;
    const up = await supabase.storage.from("lesson-decks").upload(deckPath, fs.readFileSync(path.join(dir, m.file)), {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    if (up.error) throw up.error;
    if (hasPdf) {
      const up2 = await supabase.storage.from("lesson-decks").upload(pdfPath, fs.readFileSync(pdfLocal), { upsert: true, contentType: "application/pdf" });
      if (up2.error) throw up2.error;
    }
    const { data, error } = await supabase
      .from("curriculum_lessons")
      .upsert({ ...meta, deck_path: deckPath, pdf_path: pdfPath, version: 1 }, { onConflict: "subject_slug,year,lesson_no" })
      .select("id")
      .single();
    if (error) throw error;
    await supabase
      .from("curriculum_lesson_versions")
      .upsert({ lesson_id: data.id, version: 1, deck_path: deckPath, pdf_path: pdfPath, note: "Original" }, { onConflict: "lesson_id,version" });
    uploaded++;
  } catch (e) {
    failed++;
    console.error(`::warning::${m.file}: ${e.message || e}`);
  }
});
console.log(`Uploaded ${uploaded}, refreshed ${metaOnly}, failed ${failed}`);
if (failed > 0 && uploaded === 0) process.exit(1);
