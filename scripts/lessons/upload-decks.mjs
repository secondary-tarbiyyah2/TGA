// Loads built lesson decks into Supabase (storage bucket lesson-decks + table curriculum_lessons).
//   node scripts/lessons/upload-decks.mjs plan   <decksDir>   -> writes <decksDir>/needed.json (decks that still need a file)
//   node scripts/lessons/upload-decks.mjs upload <decksDir>   -> uploads the needed decks (+ PDFs if converted)
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//
// Which decks are rebuilt (migration 0179):
//   * a lesson whose content changed since its deck was built (the content's hash differs from
//     curriculum_lessons.built_hash, or the portal's lesson editor asked for a rebuild) gets new
//     slides as a NEW version, so the old deck stays in Version history;
//   * a lesson using a teacher's own uploaded deck (custom_deck) keeps it: only its lesson plan
//     is rebuilt;
//   * FORCE=1 re-renders every generated deck in place (when the deck design changes).
// Lesson plans are regenerated whenever the content changed (plan_hash).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { retiredChecker, retiredList } from "./retired.mjs";
import { contentHash } from "./content-hash.mjs";

const [mode, dirArg] = process.argv.slice(2);
const dir = path.resolve(dirArg || "out/decks");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !["plan", "upload"].includes(mode)) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node upload-decks.mjs plan|upload <dir>");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const isRetired = retiredChecker();
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).filter((m) => !isRetired(m.subject_slug, m.year, m.lesson_no));
const force = process.env.FORCE === "1";

// The hash of each lesson's content as it is in the repo now (what this run builds from).
const LESSONS = process.env.LESSONS_DIR ? path.resolve(process.env.LESSONS_DIR) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../content/lessons");
const hashes = new Map();
for (const s of fs.existsSync(LESSONS) ? fs.readdirSync(LESSONS) : []) {
  const d = path.join(LESSONS, s);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) {
    const data = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
    for (const l of data.lessons || []) hashes.set(`${s}/${data.year || f.replace(/\.json$/, "")}/${l.n}`, contentHash(l));
  }
}

async function existingRows() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("curriculum_lessons")
      .select("id, subject_slug, year, lesson_no, deck_path, pdf_path, version, plan_pdf_path, plan_docx_path, custom_deck, rebuild_requested, built_hash, plan_hash, content_updated_at")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) out.set(`${r.subject_slug}/${r.year}/${r.lesson_no}`, r);
    if (data.length < 1000) break;
  }
  return out;
}

const keyOf = (m) => `${m.subject_slug}/${m.year}/${m.lesson_no}`;
const hashOf = (m) => hashes.get(keyOf(m)) || null;
const existing = await existingRows();
// The content changed since the slides were built. A null built_hash is a deck built before
// hashes were kept: it is taken as current, unless the lesson editor asked for a rebuild.
const contentChanged = (row, m) => !!row.rebuild_requested || (!!row.built_hash && !!hashOf(m) && row.built_hash !== hashOf(m));
const wantsFile = (m) => {
  const row = existing.get(keyOf(m));
  if (!row) return true;
  if (row.custom_deck) return false; // a teacher's own deck: never overwrite
  return force || !row.deck_path || contentChanged(row, m);
};

// Lesson plans are generated (never teacher-edited), so they're added to
// every lesson that lacks one, including lessons whose deck a teacher edited,
// and rebuilt when the lesson content changes.
const wantsPlan = (m) => {
  if (!m.plan_file) return false;
  const row = existing.get(keyOf(m));
  return force || !row || !row.plan_pdf_path || !!row.rebuild_requested || (!!row.plan_hash && !!hashOf(m) && row.plan_hash !== hashOf(m));
};

// The upload step uploads exactly what the plan step chose (and converted to PDF), even if a
// teacher saves an edit in between: that edit is picked up by the next run.
const planned = mode === "upload" && fs.existsSync(path.join(dir, "needed.json")) ? new Set(JSON.parse(fs.readFileSync(path.join(dir, "needed.json"), "utf8"))) : null;
const needsFile = (m) => (planned ? planned.has(m.file) : wantsFile(m));
const needsPlan = (m) => (planned ? planned.has(m.plan_file) : wantsPlan(m));

if (mode === "plan") {
  const needed = [...manifest.filter(needsFile).map((m) => m.file), ...manifest.filter(needsPlan).map((m) => m.plan_file)];
  fs.writeFileSync(path.join(dir, "needed.json"), JSON.stringify(needed));
  console.log(`${needed.filter((f) => f.endsWith(".pptx")).length} of ${manifest.length} decks and ${needed.filter((f) => f.endsWith(".docx")).length} lesson plans need uploading`);
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

async function uploadPlan(m) {
  const base = path.basename(m.plan_file, ".docx");
  const docxPath = `${m.subject_slug}/${m.year}/${m.lesson_no}/plan-${base}.docx`;
  const pdfLocal = path.join(dir, m.plan_file.replace(/\.docx$/, ".pdf"));
  const up = await supabase.storage.from("lesson-decks").upload(docxPath, fs.readFileSync(path.join(dir, m.plan_file)), {
    upsert: true,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (up.error) throw up.error;
  let pdfPath = null;
  if (fs.existsSync(pdfLocal)) {
    pdfPath = docxPath.replace(/\.docx$/, ".pdf");
    const up2 = await supabase.storage.from("lesson-decks").upload(pdfPath, fs.readFileSync(pdfLocal), { upsert: true, contentType: "application/pdf" });
    if (up2.error) throw up2.error;
  }
  return { plan_docx_path: docxPath, plan_pdf_path: pdfPath };
}

let uploaded = 0;
let rebuilt = 0;
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
  const hash = hashOf(m);
  // Once built, a lesson's rebuild request is done, unless the lesson was edited again meanwhile.
  const clearRequest = async () => {
    if (!row?.rebuild_requested) return;
    const q = supabase.from("curriculum_lessons").update({ rebuild_requested: false }).eq("id", row.id);
    await (row.content_updated_at ? q.eq("content_updated_at", row.content_updated_at) : q.is("content_updated_at", null));
  };
  try {
    const planPaths = needsPlan(m) ? { ...(await uploadPlan(m)), plan_hash: hash } : null;
    if (!needsFile(m)) {
      const patch = { ...(planPaths || {}) };
      if (row && !row.plan_hash && !planPaths && hash) patch.plan_hash = hash;
      // Keep wording/ordering current without touching files or a teacher's own deck.
      if (row && !row.custom_deck) {
        Object.assign(patch, meta);
        if (!row.built_hash && hash) patch.built_hash = hash;
        metaOnly++;
      }
      if (row && Object.keys(patch).length) await supabase.from("curriculum_lessons").update(patch).eq("id", row.id);
      if (row?.custom_deck && planPaths) await clearRequest();
      return;
    }
    // The content changed: the new slides are a new version, so the old deck stays in the
    // history. Otherwise (first build, design refresh) the current version is re-rendered in place.
    const newVersion = row?.deck_path && !force && contentChanged(row, m) ? row.version + 1 : row?.version || 1;
    const base = path.basename(m.file, ".pptx");
    const deckPath = `${m.subject_slug}/${m.year}/${m.lesson_no}/v${newVersion}-${base}.pptx`;
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
      .upsert({ ...meta, ...(planPaths || {}), deck_path: deckPath, pdf_path: pdfPath, version: newVersion, built_hash: hash, ...(planPaths ? {} : { plan_hash: row?.plan_hash ?? hash }) }, { onConflict: "subject_slug,year,lesson_no" })
      .select("id")
      .single();
    if (error) throw error;
    const isRebuild = !!row && newVersion > row.version;
    await supabase.from("curriculum_lesson_versions").upsert(
      { lesson_id: data.id, version: newVersion, deck_path: deckPath, pdf_path: pdfPath, source: "generated", note: newVersion === 1 ? "Original" : isRebuild ? "Rebuilt after the lesson was edited" : "Refreshed" },
      { onConflict: "lesson_id,version" },
    );
    await clearRequest();
    if (isRebuild) rebuilt++;
    else uploaded++;
  } catch (e) {
    failed++;
    console.error(`::warning::${m.file}: ${e.message || e}`);
  }
});
console.log(`Uploaded ${uploaded}, rebuilt after edits ${rebuilt}, refreshed ${metaOnly}, failed ${failed}`);
if (failed > 0 && uploaded + rebuilt === 0) process.exit(1);

// Remove lessons retired from the library (content/retired-lessons.json) so off-spec lessons leave the portal:
// the lesson row, its versions, and their deck, PDF and lesson-plan files in storage.
if (mode === "upload") {
  const retired = retiredList();
  const rows = retired.length ? await existingRows() : new Map();
  let removed = 0;
  for (const r of retired) {
    const row = [...rows.values()].find(
      (x) => x.subject_slug === r.subject_slug && String(x.year).toLowerCase() === String(r.year).toLowerCase() && Number(x.lesson_no) === Number(r.lesson_no),
    );
    if (!row) continue;
    const { data: versions } = await supabase.from("curriculum_lesson_versions").select("deck_path, pdf_path").eq("lesson_id", row.id);
    const files = [row.deck_path, row.pdf_path, row.plan_pdf_path, row.plan_docx_path, ...(versions || []).flatMap((v) => [v.deck_path, v.pdf_path])].filter(Boolean);
    await supabase.from("curriculum_lesson_versions").delete().eq("lesson_id", row.id);
    const { error } = await supabase.from("curriculum_lessons").delete().eq("id", row.id);
    if (error) {
      console.error(`::warning::retire ${r.subject_slug}/${r.year}/${r.lesson_no}: ${error.message}`);
      continue;
    }
    removed++;
    if (files.length) {
      const { error: e2 } = await supabase.storage.from("lesson-decks").remove([...new Set(files)]);
      if (e2) console.error(`::warning::retire ${r.subject_slug}/${r.year}/${r.lesson_no} files: ${e2.message}`);
    }
  }
  console.log(`Retired ${removed} lesson(s) from the portal`);
}
