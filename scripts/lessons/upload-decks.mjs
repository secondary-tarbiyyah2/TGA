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
// Pupil PDFs (lessons v3: the slides pupils need plus a worksheet; migration 0189) go with the plan:
// stored at '<subject>/<year>/<lesson_no>/pupil-<file>.pdf' (the same path each time, so the link
// on the slides keeps working) and recorded in curriculum_lessons.pupil_pdf_path.
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

const ROW_COLS = "id, subject_slug, subject, year, board, unit, lesson_no, title, duration, objectives, deck_path, pdf_path, version, plan_pdf_path, plan_docx_path";
const EDITOR_COLS = "custom_deck, rebuild_requested, built_hash, plan_hash, content_updated_at, content";

async function existingRows() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("curriculum_lessons").select(`${ROW_COLS}, ${EDITOR_COLS}`).order("id").range(from, from + 999);
    if (error) {
      // Migration 0179 not deployed yet (this can run straight after a merge): build nothing
      // now; the curriculum sync starts this workflow again once the backend is deployed.
      if (/column|does not exist|42703|schema cache/i.test(`${error.code} ${error.message}`)) return null;
      throw error;
    }
    for (const r of data) {
      // Keep only a fingerprint of the portal's copy of the lesson, not the lesson itself.
      r.dbHash = r.content ? contentHash(r.content) : null;
      delete r.content;
      out.set(`${r.subject_slug}/${r.year}/${r.lesson_no}`, r);
    }
    if (data.length < 1000) break;
  }
  return out;
}

const keyOf = (m) => `${m.subject_slug}/${m.year}/${m.lesson_no}`;
// Migration 0189 adds pupil_pdf_path. Until it is deployed, pupil PDFs are not uploaded (nothing could find them).
const pupilPaths = new Map();
let hasPupilCol = false;
{
  const probe = await supabase.from("curriculum_lessons").select("pupil_pdf_path").limit(1);
  hasPupilCol = !probe.error;
  if (hasPupilCol)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("curriculum_lessons").select("subject_slug, year, lesson_no, pupil_pdf_path").order("id").range(from, from + 999);
      if (error) break;
      for (const r of data) pupilPaths.set(`${r.subject_slug}/${r.year}/${r.lesson_no}`, r.pupil_pdf_path);
      if (data.length < 1000) break;
    }
}
const hashOf = (m) => hashes.get(keyOf(m)) || null;
const existing = await existingRows();
if (!existing) {
  console.log("::notice::The portal database has not been updated yet (migration 0179). Nothing is uploaded this time; this workflow runs again after the backend deploy and curriculum sync.");
  if (mode === "plan") fs.writeFileSync(path.join(dir, "needed.json"), "[]");
  process.exit(0);
}
// The editor asked for new slides and the repo now has the content it saved. If the repo does
// not have it yet (the sync has not sent it), the request waits for a later run.
const requestReady = (row, m) => !!row.rebuild_requested && !!hashOf(m) && row.dbHash === hashOf(m);
// The content changed since the slides were built. A null built_hash is a deck built before
// hashes were kept: it is taken as current.
const contentChanged = (row, m) => requestReady(row, m) || (!!row.built_hash && !!hashOf(m) && row.built_hash !== hashOf(m));
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
  return force || !row || !row.plan_pdf_path || requestReady(row, m) || (!!row.plan_hash && !!hashOf(m) && row.plan_hash !== hashOf(m));
};

// The upload step uploads exactly what the plan step chose (and converted to PDF), even if a
// teacher saves an edit in between: that edit is picked up by the next run.
const planned = mode === "upload" && fs.existsSync(path.join(dir, "needed.json")) ? new Set(JSON.parse(fs.readFileSync(path.join(dir, "needed.json"), "utf8"))) : null;
const wantsPupil = (m) => hasPupilCol && !!m.pupil_file && (wantsPlan(m) || !pupilPaths.get(keyOf(m)));
const needsFile = (m) => (planned ? planned.has(m.file) : wantsFile(m));
const needsPlan = (m) => (planned ? planned.has(m.plan_file) : wantsPlan(m));
const needsPupil = (m) => hasPupilCol && !!m.pupil_file && (planned ? planned.has(m.pupil_file) : wantsPupil(m));

if (mode === "plan") {
  const needed = [...manifest.filter(needsFile).map((m) => m.file), ...manifest.filter(needsPlan).map((m) => m.plan_file), ...manifest.filter(needsPupil).map((m) => m.pupil_file)];
  fs.writeFileSync(path.join(dir, "needed.json"), JSON.stringify(needed));
  console.log(`${needed.filter((f) => f.endsWith(".pptx") && !f.endsWith("-pupil.pptx")).length} of ${manifest.length} decks, ${needed.filter((f) => f.endsWith(".docx")).length} lesson plans and ${needed.filter((f) => f.endsWith("-pupil.pptx")).length} pupil PDFs need uploading${hasPupilCol ? "" : " (pupil PDFs wait for migration 0189)"}`);
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

/** The pupil PDF (converted from <name>-pupil.pptx by the workflow), always at the same path. */
async function uploadPupil(m) {
  const pdfLocal = path.join(dir, m.pupil_file.replace(/\.pptx$/, ".pdf"));
  if (!fs.existsSync(pdfLocal)) return null;
  const dest = `${m.subject_slug}/${m.year}/${m.lesson_no}/pupil-${path.basename(m.pupil_file, "-pupil.pptx")}.pdf`;
  const up = await supabase.storage.from("lesson-decks").upload(dest, fs.readFileSync(pdfLocal), { upsert: true, contentType: "application/pdf" });
  if (up.error) throw up.error;
  return { pupil_pdf_path: dest };
}

/**
 * Delete stored files (decks, PDFs, lesson plans) that no lesson or version row points at any
 * more. Called only after the replacement is stored, so a full re-render (FORCE) cleans up as it
 * goes instead of leaving a second copy of every file. Never throws; if in doubt, keeps the files.
 */
async function removeUnused(paths) {
  paths = [...new Set(paths.filter(Boolean))];
  if (!paths.length) return;
  try {
    const used = new Set();
    for (const [table, col] of [
      ["curriculum_lesson_versions", "deck_path"],
      ["curriculum_lesson_versions", "pdf_path"],
      ["curriculum_lessons", "deck_path"],
      ["curriculum_lessons", "pdf_path"],
      ["curriculum_lessons", "plan_docx_path"],
      ["curriculum_lessons", "plan_pdf_path"],
    ]) {
      const { data, error } = await supabase.from(table).select(col).in(col, paths);
      if (error) return; // if in doubt, keep the files
      for (const r of data) used.add(r[col]);
    }
    const unused = paths.filter((p) => !used.has(p));
    if (unused.length) await supabase.storage.from("lesson-decks").remove(unused);
  } catch {
    /* keep the files */
  }
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Only the fields that really change, so a build does not touch (or audit-log) untouched lessons. */
const changes = (row, patch) => Object.fromEntries(Object.entries(patch).filter(([k, v]) => !same(row?.[k], v)));

let uploaded = 0;
let rebuilt = 0;
let metaOnly = 0;
let skipped = 0;
let failed = 0;
await pool(manifest, 6, async (m) => {
  let row = existing.get(keyOf(m));
  const hash = hashOf(m);
  // Wording from the repo. If the portal holds a newer edit the sync has not sent yet, its
  // title, unit and objectives (already on the row) are left alone.
  const portalAhead = !!row?.dbHash && !!hash && row.dbHash !== hash;
  const meta = {
    subject: m.subject,
    board: m.board,
    ...(portalAhead ? {} : { unit: m.unit, title: m.title, duration: m.duration, objectives: m.objectives }),
  };
  const ready = !!row && requestReady(row, m);
  // A rebuild request is done once built, unless the lesson was edited again meanwhile.
  const clearRequest = async () => {
    if (!ready) return;
    const q = supabase.from("curriculum_lessons").update({ rebuild_requested: false }).eq("id", row.id);
    await (row.content_updated_at ? q.eq("content_updated_at", row.content_updated_at) : q.is("content_updated_at", null));
  };
  const update = async (patch) => {
    const diff = changes(row, patch);
    if (!Object.keys(diff).length) return false;
    const { error } = await supabase.from("curriculum_lessons").update(diff).eq("id", row.id);
    if (error) throw error;
    return true;
  };
  try {
    // The plan files this lesson pointed at before this run: removed once the new plan is recorded
    // (a renamed lesson gets a new plan file name; a plan without a PDF any more drops its old PDF).
    const oldPlan = [row?.plan_docx_path, row?.plan_pdf_path];
    const planPaths = needsPlan(m) ? { ...(await uploadPlan(m)), plan_hash: hash } : null;
    const pupilPatch = needsPupil(m) ? await uploadPupil(m) : null;
    const dropOldPlan = () => (planPaths ? removeUnused(oldPlan.filter((x) => x && x !== planPaths.plan_docx_path && x !== planPaths.plan_pdf_path)) : null);
    if (!needsFile(m)) {
      if (!row) return;
      const patch = { ...(planPaths || {}), ...(pupilPatch || {}) };
      if (!row.plan_hash && !planPaths && hash) patch.plan_hash = hash;
      // Keep wording/ordering current without touching files or a teacher's own deck.
      if (!row.custom_deck) {
        Object.assign(patch, meta);
        if (!row.built_hash && hash) patch.built_hash = hash;
      }
      if (await update(patch)) metaOnly++;
      await dropOldPlan();
      if (row.custom_deck && planPaths) await clearRequest();
      return;
    }
    if (!row) {
      // A lesson new to the library: add its row (never over one created meanwhile), then store the deck like any other.
      const { error } = await supabase
        .from("curriculum_lessons")
        .upsert({ subject_slug: m.subject_slug, year: m.year, lesson_no: m.lesson_no, ...meta }, { onConflict: "subject_slug,year,lesson_no", ignoreDuplicates: true });
      if (error) throw error;
    }
    // Read the lesson again just before storing: a teacher may have uploaded their own slides
    // since this run started, and those are never replaced.
    const { data: fresh, error: freshErr } = await supabase.from("curriculum_lessons").select(`${ROW_COLS}, custom_deck`).eq("subject_slug", m.subject_slug).eq("year", m.year).eq("lesson_no", m.lesson_no).single();
    if (freshErr) throw freshErr;
    if (fresh.custom_deck) {
      skipped++;
      return;
    }
    const isNew = !row;
    row = row ? { ...row, ...fresh } : { ...fresh };
    const { data: cur } = await supabase.from("curriculum_lesson_versions").select("source").eq("lesson_id", fresh.id).eq("version", fresh.version).maybeSingle();
    // The content changed: the new slides are a new version, so the old deck stays in the history.
    // A generated current version is re-rendered in place (first build, design refresh); an
    // uploaded one is never overwritten, so the build becomes the next version instead.
    const wantNew = !isNew && !!fresh.deck_path && !force && contentChanged(row, m);
    const version = wantNew || (cur && cur.source !== "generated") ? fresh.version + 1 : fresh.version;
    const base = path.basename(m.file, ".pptx");
    // Every build goes to a new file: nothing that is current (or in the history) is ever written
    // over, and the new file only becomes current once curriculum_store_generated_deck accepts it.
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const deckPath = `${m.subject_slug}/${m.year}/${m.lesson_no}/v${version}-${stamp}-${base}.pptx`;
    const pdfLocal = path.join(dir, m.file.replace(/\.pptx$/, ".pdf"));
    const hasPdf = fs.existsSync(pdfLocal);
    const pdfPath = hasPdf ? deckPath.replace(/\.pptx$/, ".pdf") : null;
    const ours = [deckPath, ...(pdfPath ? [pdfPath] : [])];
    const discard = () => supabase.storage.from("lesson-decks").remove(ours).catch(() => {});
    const up = await supabase.storage.from("lesson-decks").upload(deckPath, fs.readFileSync(path.join(dir, m.file)), {
      upsert: false,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    if (up.error) throw up.error;
    if (hasPdf) {
      const up2 = await supabase.storage.from("lesson-decks").upload(pdfPath, fs.readFileSync(pdfLocal), { upsert: false, contentType: "application/pdf" });
      if (up2.error) {
        await discard();
        throw up2.error;
      }
    }
    // One transaction (migration 0179): refuses if a teacher's deck arrived or the version moved.
    const { data: stored, error: storeErr } = await supabase.rpc("curriculum_store_generated_deck", {
      p_lesson: fresh.id,
      p_expected_version: fresh.version,
      p_deck_path: deckPath,
      p_pdf_path: pdfPath,
      p_new_version: wantNew,
      p_built_hash: hash,
      p_note: fresh.version === 0 || isNew ? "Original" : wantNew ? "Rebuilt after the lesson was edited" : "Rebuilt from the lesson",
    });
    if (storeErr) {
      await discard();
      throw storeErr;
    }
    if (stored == null) {
      await discard(); // refused: the new files were never made current
      skipped++;
      console.log(`${m.file}: a teacher changed this lesson's slides during the build; their version is kept.`);
      return;
    }
    // Re-rendered in place (a design refresh / FORCE): the previous files of that version are no
    // longer current. Remove them
    // unless something still points at them (a restored version copies the paths it restored, and
    // pupils' revision slides read curriculum_lessons.pdf_path), so a design refresh does not leave
    // ~1,500 unused decks behind.
    if (stored === fresh.version) await removeUnused([fresh.deck_path, fresh.pdf_path].filter((p) => p && !ours.includes(p)));
    row = { ...row, deck_path: deckPath, pdf_path: pdfPath, version: stored, built_hash: hash };
    await update({ ...meta, ...(planPaths || {}), ...(pupilPatch || {}), ...(planPaths ? {} : row.plan_hash ? {} : { plan_hash: hash }) });
    await dropOldPlan();
    await clearRequest();
    if (stored > fresh.version) rebuilt++;
    else uploaded++;
  } catch (e) {
    failed++;
    console.error(`::warning::${m.file}: ${e.message || e}`);
  }
});
console.log(`Uploaded ${uploaded}, rebuilt ${rebuilt}, refreshed ${metaOnly}, kept teachers' own slides ${skipped}, failed ${failed}`);
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
    const files = [row.deck_path, row.pdf_path, row.plan_pdf_path, row.plan_docx_path, pupilPaths.get(`${row.subject_slug}/${row.year}/${row.lesson_no}`), ...(versions || []).flatMap((v) => [v.deck_path, v.pdf_path])].filter(Boolean);
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
