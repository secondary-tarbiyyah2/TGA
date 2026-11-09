// The portal's quick build (Tafweed T35): new slides, PDF and lesson plan for ONE lesson, built
// straight from the copy saved in the portal, so a teacher can download them a minute or two
// after pressing Save instead of waiting for "Sync curriculum from the portal" and the full
// "Build lesson decks" run. Used by .github/workflows/build-one-lesson.yml:
//
//   node scripts/lessons/one-lesson.mjs prepare <lessonId> <lessonsDir>
//     Reads the lesson from curriculum_lessons (service role) and writes <lessonsDir>/<subject>/<year>.json
//     holding it and its neighbours from the repo (for the "previous / next lesson" slides), marks
//     the build "building", and prints only=<subject>/<year> and lesson=<n> for $GITHUB_OUTPUT.
//   node scripts/lessons/one-lesson.mjs trim <decksDir> <subject>/<year> <n>
//     Keeps only that lesson in <decksDir>/manifest.json, so only it is uploaded.
//   node scripts/lessons/one-lesson.mjs finish <lessonId> ok|failed
//     Records the result in curriculum_lesson_builds, which the editor is watching.
//
// The upload itself is scripts/lessons/upload-decks.mjs with LESSONS_DIR=<lessonsDir>: the
// lesson's hash then matches the portal's copy, so its slides are rebuilt as a new version and the
// rebuild request is cleared. When the sync later copies the same lesson into content/lessons,
// the full build finds the slides already current and leaves them alone. The repo (content/)
// still receives every edit through the sync, as before.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const [mode, ...rest] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const db = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed");
  return createClient(url, key, { auth: { persistSession: false } });
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setStatus(sb, id, patch) {
  const { error } = await sb.from("curriculum_lesson_builds").upsert({ lesson_id: id, ...patch }, { onConflict: "lesson_id" });
  if (error) console.log(`::warning::Could not record the build status: ${error.message}`);
}

if (mode === "prepare") {
  const [id, outDir] = rest;
  if (!UUID.test(id || "") || !outDir) throw new Error("Usage: prepare <lessonId> <lessonsDir>");
  const sb = db();
  const { data: row, error } = await sb.from("curriculum_lessons").select("id, subject_slug, subject, year, board, lesson_no, content").eq("id", id).maybeSingle();
  if (error || !row) {
    if (row === null) await setStatus(sb, id, { status: "failed", finished_at: new Date().toISOString(), message: "This lesson was not found." });
    throw new Error(error?.message || "Lesson not found");
  }
  if (!row.content) {
    await setStatus(sb, id, { status: "failed", finished_at: new Date().toISOString(), message: "This lesson has not been loaded into the editor yet." });
    throw new Error("The lesson has no saved content yet");
  }
  await setStatus(sb, id, { status: "building", started_at: new Date().toISOString(), finished_at: null, message: null });
  const slug = row.subject_slug;
  const year = String(row.year).toLowerCase();
  const repoFile = path.join(ROOT, "content/lessons", slug, `${year}.json`);
  const base = fs.existsSync(repoFile) ? JSON.parse(fs.readFileSync(repoFile, "utf8")) : { subject: row.subject, year, ...(row.board ? { board: row.board } : {}), lessons: [] };
  const n = Number(row.lesson_no);
  const lesson = { ...row.content, n };
  // The lesson itself (from the portal) plus the lessons either side (from the repo), so the
  // deck's "last lesson" and "next lesson" slides are the same as in a full build.
  const others = (base.lessons || []).filter((l) => l.n !== n).sort((a, b) => a.n - b.n);
  const prev = others.filter((l) => l.n < n).slice(-1);
  const next = others.filter((l) => l.n > n).slice(0, 1);
  const file = { ...base, year: base.year || year, lessons: [...prev, lesson, ...next] };
  fs.mkdirSync(path.join(outDir, slug), { recursive: true });
  fs.writeFileSync(path.join(outDir, slug, `${year}.json`), JSON.stringify(file, null, 1));
  console.log(`only=${slug}/${year}`);
  console.log(`lesson=${n}`);
} else if (mode === "trim") {
  const [dir, only, n] = rest;
  const p = path.join(dir, "manifest.json");
  const [slug, year] = only.split("/");
  const all = JSON.parse(fs.readFileSync(p, "utf8"));
  const keep = all.filter((m) => m.subject_slug === slug && m.year === year && Number(m.lesson_no) === Number(n));
  if (keep.length !== 1) throw new Error(`Expected one built lesson, found ${keep.length}`);
  fs.writeFileSync(p, JSON.stringify(keep, null, 1));
  console.log(`Uploading ${keep[0].file} and its lesson plan only`);
} else if (mode === "finish") {
  const [id, result] = rest;
  if (!UUID.test(id || "")) throw new Error("Usage: finish <lessonId> ok|failed");
  const sb = db();
  const now = new Date().toISOString();
  if (result === "ok") {
    const { data: l } = await sb.from("curriculum_lessons").select("custom_deck, rebuild_requested, pdf_path, plan_pdf_path").eq("id", id).maybeSingle();
    if (l?.rebuild_requested && !l.custom_deck) {
      // Saved again while this build ran: the newer save starts its own build.
      await setStatus(sb, id, { status: "failed", finished_at: now, message: "The lesson was changed again during the build. Save again to build the newest version." });
    } else {
      await setStatus(sb, id, {
        status: "ready",
        finished_at: now,
        message: l?.custom_deck ? "The lesson plan was rebuilt. This lesson uses slides that were uploaded, so they were kept." : null,
      });
    }
  } else {
    await setStatus(sb, id, { status: "failed", finished_at: now, message: "The quick build did not finish. Your changes are saved and the slides will still be rebuilt within the hour." });
  }
} else {
  console.error("Usage: one-lesson.mjs prepare|trim|finish …");
  process.exit(1);
}
