// Loads the term resource registers and the built resource files into the portal.
//   node scripts/resources/upload.mjs plan   <outDir>   -> <outDir>/needed.json: items whose files must be (re)built
//   node scripts/resources/upload.mjs upload <outDir>   -> uploads what build.mjs made and writes curriculum_resources
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Table and storage: migration 0201.
//
// A made item is rebuilt when its content or the generator changed (built_hash = item JSON + the
// renderer's own files). Files live in the private lesson-decks bucket (staff read; pupils only get a
// resource a teacher shares to their class):
//   resources/<subject>/<year>/<id>.pdf, <id>-mark-scheme.pdf, <id>.docx
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { RES_DIR, TERMS, ROOT, readJson } from "./lib.mjs";

const [mode, dirArg] = process.argv.slice(2);
const dir = path.resolve(dirArg || "out/resources");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !["plan", "upload"].includes(mode)) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/resources/upload.mjs plan|upload <dir>");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "lesson-decks";
const force = process.env.FORCE === "1";

// The generator's own code: a change here rebuilds every made resource.
const GEN = crypto.createHash("sha1");
for (const f of ["render.mjs", "grids.mjs", "render-docx.mjs", "build.mjs"]) GEN.update(fs.readFileSync(path.join(ROOT, "scripts/resources", f)));
const genHash = GEN.digest("hex");
const hashOf = (itemFile) => crypto.createHash("sha1").update(genHash).update(fs.readFileSync(itemFile)).digest("hex").slice(0, 20);

/** Every register entry, merged across the four terms (a resource used in two terms is one row). */
function rows() {
  const out = new Map();
  for (const t of TERMS) {
    const reg = readJson(path.join(RES_DIR, `${t.id}.json`), null);
    if (!reg) continue;
    for (const r of reg.resources) {
      const prev = out.get(r.id);
      const lessons = r.lessons.map((l) => ({ n: l.n, title: l.title, term: t.id }));
      if (prev) {
        prev.terms.push(t.id);
        prev.lessons.push(...lessons);
        prev.units = [...new Set([...prev.units, ...r.units])];
        continue;
      }
      out.set(r.id, {
        id: r.id,
        terms: [t.id],
        title: r.title,
        type: r.type,
        subject: r.subject,
        subject_slug: r.subjectSlug,
        year: r.year,
        units: r.units,
        lessons,
        source: r.source,
        status: r.status,
        wording: r.wording,
        item: r.item ? path.join(RES_DIR, r.item) : null, // r.item is relative to content/resources
      });
    }
  }
  for (const r of out.values()) r.lesson_nos = [...new Set(r.lessons.map((l) => l.n))].sort((a, b) => a - b);
  return [...out.values()];
}

async function existing() {
  const m = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("curriculum_resources").select("id, built_hash, pdf_path, mark_scheme_path, docx_path").order("id").range(from, from + 999);
    if (error) {
      if (/relation|does not exist|42P01|schema cache/i.test(`${error.code} ${error.message}`)) return null;
      throw error;
    }
    for (const r of data) m.set(r.id, r);
    if (data.length < 1000) break;
  }
  return m;
}

const all = rows();
const have = await existing();
if (!have) {
  console.log("::notice::The portal database has not been updated yet (migration 0201). Nothing is uploaded this time; run this workflow again after the backend deploy.");
  if (mode === "plan") fs.writeFileSync(path.join(dir, "needed.json"), "[]");
  process.exit(0);
}

if (mode === "plan") {
  fs.mkdirSync(dir, { recursive: true });
  const needed = all.filter((r) => r.item && fs.existsSync(r.item) && (force || !have.get(r.id)?.pdf_path || have.get(r.id)?.built_hash !== hashOf(r.item))).map((r) => r.id);
  fs.writeFileSync(path.join(dir, "needed.json"), JSON.stringify(needed));
  console.log(`${all.length} resources in the registers; ${all.filter((r) => r.item && fs.existsSync(r.item)).length} made by TGA; ${needed.length} to build and upload`);
  process.exit(0);
}

// upload
const manifest = readJson(path.join(dir, "manifest.json"), []);
const built = new Map(manifest.map((m) => [m.id, m]));
const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
async function put(local, dest) {
  const ext = dest.split(".").pop();
  const { error } = await supabase.storage.from(BUCKET).upload(dest, fs.readFileSync(path.join(dir, local)), { upsert: true, contentType: MIME[ext] });
  if (error) throw error;
  return dest;
}
let uploaded = 0;
let failed = 0;
const patch = [];
for (const r of all) {
  const prev = have.get(r.id);
  const row = { id: r.id, terms: r.terms, title: r.title, type: r.type, subject: r.subject, subject_slug: r.subject_slug, year: r.year, units: r.units, lesson_nos: r.lesson_nos, lessons: r.lessons, source: r.source, status: r.status, wording: r.wording, updated_at: new Date().toISOString() };
  const b = built.get(r.id);
  if (b) {
    try {
      row.pdf_path = await put(b.pdf, `resources/${b.pdf}`);
      row.mark_scheme_path = b.markScheme ? await put(b.markScheme, `resources/${b.markScheme}`) : null;
      row.docx_path = b.docx ? await put(b.docx, `resources/${b.docx}`) : null;
      row.built_hash = hashOf(r.item);
      uploaded++;
    } catch (e) {
      failed++;
      console.error(`::warning::${r.id}: ${e.message || e}`);
    }
  } else if (prev) {
    // Keep the files already stored for this resource (unchanged since the last build).
    Object.assign(row, { pdf_path: prev.pdf_path, mark_scheme_path: prev.mark_scheme_path, docx_path: prev.docx_path, built_hash: prev.built_hash });
  }
  if (r.item && !row.pdf_path) row.status = "to make";
  if (row.pdf_path) row.status = "made";
  patch.push(row);
}
for (let i = 0; i < patch.length; i += 500) {
  const { error } = await supabase.from("curriculum_resources").upsert(patch.slice(i, i + 500), { onConflict: "id" });
  if (error) throw error;
}
// Resources no lesson names any more: remove the row and its files.
const ids = new Set(all.map((r) => r.id));
const gone = [...have.values()].filter((r) => !ids.has(r.id));
if (gone.length) {
  const files = gone.flatMap((r) => [r.pdf_path, r.mark_scheme_path, r.docx_path]).filter(Boolean);
  for (let i = 0; i < files.length; i += 100) await supabase.storage.from(BUCKET).remove(files.slice(i, i + 100));
  for (let i = 0; i < gone.length; i += 200) await supabase.from("curriculum_resources").delete().in("id", gone.slice(i, i + 200).map((r) => r.id));
}
console.log(`Register: ${patch.length} resources written, ${uploaded} built resources uploaded, ${gone.length} removed${failed ? `, ${failed} failed` : ""}`);
if (failed && !uploaded) process.exit(1);
