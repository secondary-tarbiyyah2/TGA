// Keeps the portal's curriculum (curriculum_units, curriculum_lessons.content) and the repo's
// content/syllabus/**.json and content/lessons/**.json in step. Run by the workflow
// "Sync curriculum from the portal" (.github/workflows/sync-curriculum-from-portal.yml).
//
//   node scripts/curriculum/sync.mjs run [outDir]     compare, bring repo changes into the
//        database, write portal changes into content/, and leave <outDir>/pending.json and
//        <outDir>/summary.json for the workflow (default outDir: out/curriculum-sync)
//   node scripts/curriculum/sync.mjs record [outDir]  after the commit is pushed: remember what
//        was sent (so it is not sent again) and log the run. Set COMMIT_SHA; FAILED=1 logs a
//        failed run and remembers nothing.
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or CURRICULUM_FIXTURE=<file.json> to run
// against a local copy of the tables (for testing; the file is updated in place).
//
// The parts compared are one subject's year of units (KS1-3), one KS4 specification's units,
// and one lesson. For each, against the content as it was when the two last agreed
// (curriculum_sync_state):
//   * same in both                        -> nothing to do
//   * never synced and the portal is empty -> copy the repo into the portal (the first seed)
//   * only the repo changed               -> copy the repo into the portal
//   * only the portal changed             -> write the portal's version into content/
//   * both changed                        -> units are merged one by one: each unit takes
//     whichever side changed it, and when both changed the same unit the portal's version
//     wins (the clash is logged where the planner shows it). A lesson is one unit.
// Before anything is written to content/, each part is checked (the same rules as
// scripts/*/validate.mjs, including the cross-curricular hub links). A part that fails stays
// out of the commit and is listed as "Not sent yet" with the reason; the rest still syncs. As a
// last guard the real validators run on the written files and any file that now fails is put
// back. Nothing is committed unless something really changed, which stops the sync looping.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  HUB_SUBJECT_SLUG,
  LESSONS_DIR,
  ROOT,
  SYLLABUS_DIR,
  checkLesson,
  checkUnits,
  contentHash,
  orderLike,
  readLessonFiles,
  readSyllabusFiles,
  repoUnitScopes,
  replaceSpan,
  scopeKey,
  sortRows,
  spanAt,
  spanTree,
  unitFromRepo,
  unitToRepo,
  yearIndex,
} from "./lib.mjs";
import { retiredChecker } from "../lessons/retired.mjs";

const [mode = "run", outArg] = process.argv.slice(2);
const outDir = path.resolve(outArg || path.join(ROOT, "out/curriculum-sync"));
const REPO_NAME = "the repository (content/)";
const UNIT_COLS = "id, subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_at, updated_by_name";
const LESSON_COLS = "id, subject_slug, subject, year, board, unit, lesson_no, title, content, content_updated_at, content_updated_by_name, rebuild_requested";
const UNIT_FIELDS = ["subject", "year", "half_term", "term", "ref", "paper", "title", "focus", "skills", "key_terms", "assess", "prereq", "leads_to", "weeks", "resources", "founding_year", "extra", "key_order"];
const fieldsOf = (r) => Object.fromEntries(UNIT_FIELDS.map((k) => [k, r[k]]));

// ── Stores ───────────────────────────────────────────────────────────────────
async function supabaseStore() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or CURRICULUM_FIXTURE).");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const all = async (table, cols, order) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).order(order).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  };
  const must = (r, what) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };
  return {
    // The backend may not be deployed yet (the tables come with migration 0179).
    async ready() {
      const a = await sb.from("curriculum_units").select("id").limit(1);
      const b = await sb.from("curriculum_sync_state").select("units").limit(1);
      const c = await sb.from("curriculum_lessons").select("content, rebuild_requested").limit(1);
      return !a.error && !b.error && !c.error;
    },
    loadUnits: () => all("curriculum_units", UNIT_COLS, "id"),
    loadLessons: () => all("curriculum_lessons", LESSON_COLS, "id"),
    loadState: async () => new Map((await all("curriculum_sync_state", "scope, hash, units", "scope")).map((r) => [r.scope, { hash: r.hash, units: r.units }])),
    /** One part's units in one transaction (curriculum_apply_units). Returns the ids in order, or null if a teacher changed the part meanwhile. */
    async applyUnits(part, expected, rows) {
      const data = must(await sb.rpc("curriculum_apply_units", { p_kind: part.kind, p_slug: part.slug, p_year: part.year || "y10", p_expected: expected, p_rows: rows, p_editor: REPO_NAME }), "apply units");
      return data;
    },
    async seedLessons(rows) {
      for (let i = 0; i < rows.length; i += 200) must(await sb.from("curriculum_lessons").upsert(rows.slice(i, i + 200), { onConflict: "subject_slug,year,lesson_no" }), "seed lessons");
    },
    async setLessonContent(row, content) {
      const q = sb.from("curriculum_lessons").update(lessonPatch(content)).eq("id", row.id);
      const data = must(await (row.content_updated_at ? q.eq("content_updated_at", row.content_updated_at) : q.is("content_updated_at", null)).select("id"), "update lesson");
      if (!data.length) return false;
      if (row.content) must(await sb.from("curriculum_lesson_content_versions").insert({ lesson_id: row.id, content: row.content, note: "Replaced by a change made in the repository", edited_by_name: row.content_updated_by_name, edited_at: row.content_updated_at || new Date().toISOString() }), "keep lesson history");
      return true;
    },
    async clearLessonContent(row) {
      const q = sb.from("curriculum_lessons").update({ content: null, content_updated_at: new Date().toISOString(), content_updated_by_name: REPO_NAME }).eq("id", row.id);
      must(await (row.content_updated_at ? q.eq("content_updated_at", row.content_updated_at) : q.is("content_updated_at", null)), "clear lesson");
    },
    async saveState(entries, removed = []) {
      for (let i = 0; i < entries.length; i += 500) must(await sb.from("curriculum_sync_state").upsert(entries.slice(i, i + 500).map((e) => ({ scope: e.scope, hash: e.hash, units: e.units ?? null, synced_at: new Date().toISOString() })), { onConflict: "scope" }), "save sync state");
      for (let i = 0; i < removed.length; i += 200) must(await sb.from("curriculum_sync_state").delete().in("scope", removed.slice(i, i + 200)), "remove sync state");
    },
    async logRun(run) {
      must(await sb.from("curriculum_sync_runs").insert(run), "log run");
    },
  };
}

// A JSON file standing in for the tables, so the sync can be tested without a database.
// FIXTURE_NOT_READY=1 pretends the backend is not deployed yet.
function fixtureStore(file) {
  const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  db.units ||= [];
  db.lessons ||= [];
  db.state ||= {};
  db.runs ||= [];
  db.lessonVersions ||= [];
  const save = () => fs.writeFileSync(file, JSON.stringify(db, null, 1));
  let tick = 0;
  const now = () => new Date(Date.now() + tick++).toISOString();
  let seq = db.units.length + db.lessons.length + 1000;
  const id = () => `fx-${++seq}`;
  const inPart = (u, part) => u.subject_slug === part.slug && u.kind === part.kind && (part.kind === "spec" || u.year === part.year);
  return {
    ready: async () => process.env.FIXTURE_NOT_READY !== "1",
    loadUnits: async () => structuredClone(db.units),
    loadLessons: async () => structuredClone(db.lessons),
    loadState: async () => new Map(Object.entries(db.state)),
    async applyUnits(part, expected, rows) {
      const cur = db.units.filter((u) => inPart(u, part));
      if (cur.length !== Object.keys(expected).length || cur.some((u) => expected[u.id] !== u.updated_at)) return null;
      const ids = rows.map((r, i) => {
        const at = r.id ? db.units.findIndex((u) => u.id === r.id) : -1;
        if (r.keep) {
          // A move only: not an edit, so updated_at stays (curriculum_units_stamp, 0180).
          if (db.units[at].position !== i) db.units[at].position = i;
          return r.id;
        }
        const row = { ...r, subject_slug: part.slug, kind: part.kind, year: r.year || part.year, position: i, id: r.id || id(), updated_at: now(), updated_by_name: REPO_NAME };
        if (at >= 0) db.units[at] = row;
        else db.units.push(row);
        return row.id;
      });
      // Like curriculum_apply_units (0180): only units the sync read are ever removed.
      db.units = db.units.filter((u) => !(u.id in expected) || ids.includes(u.id));
      save();
      return ids;
    },
    async seedLessons(rows) {
      for (const r of rows) {
        const at = db.lessons.findIndex((l) => l.subject_slug === r.subject_slug && l.year === r.year && l.lesson_no === r.lesson_no);
        if (at >= 0) Object.assign(db.lessons[at], r);
        else db.lessons.push({ id: id(), rebuild_requested: false, ...r });
      }
      save();
    },
    async setLessonContent(row, content) {
      const l = db.lessons.find((x) => x.id === row.id);
      if (l.content_updated_at !== row.content_updated_at) return false;
      if (row.content) db.lessonVersions.push({ lesson_id: row.id, content: row.content });
      Object.assign(l, lessonPatch(content));
      save();
      return true;
    },
    async clearLessonContent(row) {
      Object.assign(db.lessons.find((x) => x.id === row.id), { content: null, content_updated_at: now(), content_updated_by_name: REPO_NAME });
      save();
    },
    async saveState(entries, removed = []) {
      for (const e of entries) db.state[e.scope] = { hash: e.hash, units: e.units ?? null };
      for (const s of removed) delete db.state[s];
      save();
    },
    async logRun(run) {
      db.runs.push(run);
      save();
    },
  };
}

function lessonPatch(content) {
  return {
    content,
    title: content.title,
    unit: content.unit,
    objectives: content.objectives || [],
    ...(Number.isInteger(content.duration) ? { duration: content.duration } : {}),
    content_updated_at: new Date().toISOString(),
    content_updated_by: null,
    content_updated_by_name: REPO_NAME,
  };
}

const store = process.env.CURRICULUM_FIXTURE ? fixtureStore(path.resolve(process.env.CURRICULUM_FIXTURE)) : await supabaseStore();

// ── record ───────────────────────────────────────────────────────────────────
if (mode === "record") {
  const pending = JSON.parse(fs.readFileSync(path.join(outDir, "pending.json"), "utf8"));
  if (pending.skip) {
    console.log("Nothing to record: the run was skipped.");
    process.exit(0);
  }
  const failed = process.env.FAILED === "1";
  if (!failed) await store.saveState(pending.state, pending.removed || []);
  await store.logRun({
    ...pending.run,
    finished_at: new Date().toISOString(),
    ok: !failed,
    commit_sha: failed ? null : process.env.COMMIT_SHA || null,
    message: failed ? process.env.FAILED_MESSAGE || "The changes could not be saved to the repository. They will be sent on the next run." : pending.run.message,
  });
  console.log(failed ? "Logged a failed run." : `Recorded ${pending.state.length} part(s) as in step.`);
  process.exit(0);
}
if (mode !== "run") {
  console.error("Usage: node scripts/curriculum/sync.mjs run|record [outDir]");
  process.exit(1);
}

// ── run ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
if (!(await store.ready())) {
  // Merged before the backend deploy finished: the run after "Deploy Supabase backend" does it.
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ skipped: true, changedFiles: [], lessonsChanged: false, syllabusChanged: false, rebuildReady: false, editors: [], problems: [] }, null, 2));
  fs.writeFileSync(path.join(outDir, "pending.json"), JSON.stringify({ skip: true, state: [] }));
  console.log("::notice::The portal's curriculum tables are not deployed yet (migration 0179). Skipping; the run after the backend deploy will sync.");
  process.exit(0);
}

const startedAt = new Date().toISOString();
const problems = []; // { scope, text }
const note = (scope, text) => problems.push({ scope, text });
const nowState = []; // safe to remember straight away (the repo already has it)
const pendingState = []; // remember only once the commit is pushed
const removedState = [];
const editors = new Set();
const counts = { sent_units: 0, sent_lessons: 0, received_units: 0, received_lessons: 0 };
// file -> { file, raw, data, years: Map(year -> units), units, lessons: Map(index -> lesson), scopes: [{ scope, entry, label }] }
const fileEdits = new Map();
const editFor = (f) => {
  if (!fileEdits.has(f.file)) fileEdits.set(f.file, { file: f.file, raw: f.raw, data: f.data, years: new Map(), units: null, lessons: new Map(), scopes: [] });
  return fileEdits.get(f.file);
};
const yearName = (y) => (y === "reception" ? "Reception" : `Year ${String(y).slice(1)}`);
const human = (n) => n && n !== REPO_NAME;

const [syllabusFiles, lessonFiles, dbUnits, dbLessons, state] = await Promise.all([Promise.resolve(readSyllabusFiles()), Promise.resolve(readLessonFiles()), store.loadUnits(), store.loadLessons(), store.loadState()]);

// Units ---------------------------------------------------------------------
const repoScopes = repoUnitScopes(syllabusFiles);
const fileFor = { syllabus: new Map(), spec: new Map() };
for (const f of syllabusFiles) fileFor[f.kind].set(f.slug, f);
const dbScopes = new Map();
for (const r of dbUnits) {
  const k = r.kind === "spec" ? scopeKey.spec(r.subject_slug) : scopeKey.syllabus(r.subject_slug, r.year);
  if (!dbScopes.has(k)) dbScopes.set(k, { kind: r.kind, slug: r.subject_slug, subject: r.subject, year: r.kind === "spec" ? null : r.year, rows: [] });
  dbScopes.get(k).rows.push(r);
}
const rowHash = (r) => contentHash(unitToRepo(r));
const stateUnits = (rows) => rows.map((r) => ({ id: r.id, h: rowHash(r) }));

/**
 * Pair repo units with earlier ids: same content first, then (KS4) the same ref or (KS1-3) the
 * same title as the unit with that id now has in the portal, then, if exactly as many are left
 * on each side, by order. Returns an array (one per repo unit) of matched ids or null.
 */
function matchRepo(kind, repoUnits, base, rowsById) {
  const out = repoUnits.map(() => null);
  const free = new Set(base.map((b) => b.id));
  const hashes = repoUnits.map((u) => contentHash(u));
  repoUnits.forEach((u, i) => {
    const b = base.find((x) => free.has(x.id) && x.h === hashes[i]);
    if (b) {
      out[i] = b.id;
      free.delete(b.id);
    }
  });
  const keyOf = (o) => (kind === "spec" ? o.ref : o.unit ?? o.title);
  repoUnits.forEach((u, i) => {
    if (out[i]) return;
    const k = keyOf(u);
    const b = k && base.find((x) => free.has(x.id) && rowsById.get(x.id) && keyOf(unitToRepo(rowsById.get(x.id))) === k);
    if (b) {
      out[i] = b.id;
      free.delete(b.id);
    }
  });
  const leftRepo = out.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  const leftBase = base.filter((b) => free.has(b.id));
  if (leftRepo.length && leftRepo.length === leftBase.length) leftRepo.forEach((i, j) => (out[i] = leftBase[j].id));
  return out;
}

for (const k of [...new Set([...repoScopes.keys(), ...dbScopes.keys()])].sort()) {
  const repo = repoScopes.get(k);
  const dbPart = dbScopes.get(k);
  const meta = repo || dbPart;
  const part = { kind: meta.kind, slug: meta.slug, year: meta.kind === "spec" ? null : meta.year };
  const file = repo?.file || fileFor[meta.kind].get(meta.slug);
  const label = `${meta.subject}${meta.kind === "spec" ? " (Years 10 and 11)" : `, ${yearName(meta.year)}`}`;
  const repoUnits = repo?.units || [];
  const rows = sortRows(dbPart?.rows || []);
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const expected = Object.fromEntries(rows.map((r) => [r.id, r.updated_at]));
  const R = contentHash(repoUnits);
  const D = contentHash(rows.map(unitToRepo));
  const B = state.get(k);
  const fromRepo = (u, i) => fieldsOf(unitFromRepo({ kind: meta.kind, slug: meta.slug, subject: meta.subject, year: meta.year || "y10", position: i }, u));

  if (R === D) {
    if (!B || B.hash !== R || !B.units) nowState.push({ scope: k, hash: R, units: stateUnits(rows) });
    continue;
  }

  // Decide the final list: [{ id?, keep? , ...fields }] plus whether the repo must be rewritten.
  let final = null;
  let received = 0;
  if ((!rows.length && !B) || (B && D === B.hash)) {
    // Seed, or only the repo changed: take the repo's list, keeping ids where units match.
    const ids = matchRepo(meta.kind, repoUnits, rows.map((r) => ({ id: r.id, h: rowHash(r) })), rowsById);
    final = repoUnits.map((u, i) => (ids[i] && rowHash(rowsById.get(ids[i])) === contentHash(u) ? { id: ids[i], keep: true } : { ...(ids[i] ? { id: ids[i] } : {}), ...fromRepo(u, i) }));
    received = final.filter((x) => !x.keep).length + rows.filter((r) => !ids.includes(r.id)).length;
  } else if (!B || R === B.hash || !B.units) {
    // Only the portal changed (or there is nothing to merge against): the portal's list goes to the repo.
    if (B && R !== B.hash) note(`${meta.kind === "spec" ? "spec" : "syllabus"}:${meta.slug}${meta.year ? `:${meta.year}` : ""}`, `${label}: changed both in the portal and in the repository; the portal version was kept (the repository version is in the git history).`);
  } else {
    // Both changed: merge unit by unit against the last agreed list.
    const base = B.units;
    const baseIds = new Set(base.map((b) => b.id));
    const ids = matchRepo(meta.kind, repoUnits, base, rowsById);
    const repoById = new Map(ids.map((id, i) => [id, i]).filter(([id]) => id));
    const dropped = new Set();
    const replaced = new Map(); // id -> repo index
    for (const b of base) {
      const ri = repoById.get(b.id);
      const repoState = ri === undefined ? "deleted" : contentHash(repoUnits[ri]) === b.h ? "same" : "changed";
      const row = rowsById.get(b.id);
      const dbState = !row ? "deleted" : rowHash(row) === b.h ? "same" : "changed";
      const name = row?.title || (ri !== undefined ? repoUnits[ri].unit || repoUnits[ri].title : "a unit");
      if (dbState === "deleted") {
        if (repoState === "changed") note(`unit:${b.id}`, `${label}: "${name}" was removed in the portal but changed in the repository; it stays removed.`);
        continue;
      }
      if (dbState === "changed") {
        if (repoState === "changed" && contentHash(repoUnits[ri]) !== rowHash(row)) note(`unit:${b.id}`, `${label}: "${name}" was changed both in the portal and in the repository; the portal version was kept (the repository version is in the git history).`);
        if (repoState === "deleted") note(`unit:${b.id}`, `${label}: "${name}" was removed in the repository but changed in the portal; it was kept.`);
        continue;
      }
      if (repoState === "changed") replaced.set(b.id, ri);
      if (repoState === "deleted") dropped.add(b.id);
    }
    // Start from the portal's order; repo additions go after the unit before them in the repo.
    final = rows.filter((r) => !dropped.has(r.id)).map((r) => (replaced.has(r.id) ? { id: r.id, ...fromRepo(repoUnits[replaced.get(r.id)], 0) } : { id: r.id, keep: true }));
    repoUnits.forEach((u, i) => {
      if (ids[i] && baseIds.has(ids[i])) return;
      const prev = ids.slice(0, i).reverse().find((id) => id && final.some((x) => x.id === id));
      const at = prev ? final.findIndex((x) => x.id === prev) + 1 : 0;
      final.splice(at, 0, fromRepo(u, i));
    });
    received = replaced.size + dropped.size + final.filter((x) => !x.id).length;
  }

  // Put the list in teaching order (half term, then place) the same way the export and the
  // next run read it, so a merged part does not come back as a reorder on the next run.
  if (final) {
    final = sortRows(final.map((x, i) => {
      const src = x.keep ? rowsById.get(x.id) : x;
      return { x, kind: meta.kind, half_term: src.half_term ?? null, position: i, title: String(src.title ?? "") };
    })).map((s) => s.x);
  }

  // Apply to the portal (one transaction) unless the list is the portal's own.
  let finalRows = rows;
  if (final && !(final.length === rows.length && final.every((x, i) => x.keep && x.id === rows[i].id))) {
    const ids = await store.applyUnits(part, expected, final);
    if (!ids) {
      note(k, `${label}: someone was editing it in the portal while the sync ran; it will be compared again next time.`);
      continue;
    }
    finalRows = ids.map((id, i) => {
      const x = final[i];
      return x.keep ? { ...rowsById.get(id), position: i } : { ...rowsById.get(id), ...x, id, kind: meta.kind, subject_slug: meta.slug, position: i, updated_by_name: REPO_NAME };
    });
    counts.received_units += received;
  }
  const value = finalRows.map(unitToRepo);
  const V = contentHash(value);
  if (V === R) {
    nowState.push({ scope: k, hash: V, units: stateUnits(finalRows) });
    continue;
  }
  // Otherwise the repo needs the final list: the portal's edits, a merge, or (after an import
  // whose repo list was out of teaching order) the same list in order, written once.
  // Write the part to the repo, if it passes the checks.
  if (!file) {
    note(k, `Not sent yet: ${label}: there is no syllabus file for this subject in the repository.`);
    continue;
  }
  const issues = checkUnits(meta.kind, value, label, meta.kind === "spec" ? meta.slug : null);
  if (issues.length) {
    // Point each problem at the unit it names where possible, so the planner shows it there.
    issues.forEach((x) => {
      const m = x.match(/, unit (\d+)/);
      const r = m ? finalRows[Number(m[1]) - 1] : null;
      note(r?.id ? `unit:${r.id}` : k, `Not sent yet: ${x}`);
    });
    continue;
  }
  const e = editFor(file);
  if (meta.kind === "spec") e.units = value;
  else e.years.set(meta.year, value);
  const entry = { scope: k, hash: V, units: stateUnits(finalRows) };
  pendingState.push(entry);
  e.scopes.push({ scope: k, entry, label, ids: finalRows.map((r) => r.id) });
  const before = new Set(repoUnits.map((u) => contentHash(u)));
  const changed = finalRows.filter((r) => !before.has(rowHash(r)));
  counts.sent_units += Math.max(changed.length, 1);
  changed.forEach((r) => human(r.updated_by_name) && editors.add(r.updated_by_name));
}

// Lessons --------------------------------------------------------------------
const isRetired = retiredChecker();
const repoLessons = new Map();
for (const f of lessonFiles) f.data.lessons.forEach((l, index) => repoLessons.set(scopeKey.lesson(f.slug, f.year, l.n), { f, index, lesson: l }));
const dbLessonMap = new Map(dbLessons.map((l) => [scopeKey.lesson(l.subject_slug, l.year, l.lesson_no), l]));
const inStep = new Set(); // lessons whose repo copy equals the portal's after this run
const toSeed = [];
for (const k of [...new Set([...repoLessons.keys(), ...dbLessonMap.keys()])].sort()) {
  const repo = repoLessons.get(k);
  const db = dbLessonMap.get(k);
  const [slug, year, n] = k.slice("lesson:".length).split("/");
  if (isRetired(slug, year, Number(n))) continue;
  const label = `${db?.subject || repo?.f.data.subject || slug}, ${yearName(year)}, lesson ${n}${db?.title || repo?.lesson.title ? ` (${db?.title || repo?.lesson.title})` : ""}`;
  const R = repo ? contentHash(repo.lesson) : null;
  const D = db?.content ? contentHash(db.content) : null;
  const B = state.get(k)?.hash;
  if (R && R === D) {
    inStep.add(k);
    if (B !== R) nowState.push({ scope: k, hash: R });
    continue;
  }
  if (!R && !D) continue;
  if (R && !D) {
    // Not in the portal editor yet (the first seed, or a lesson just added to the repo).
    const data = repo.f.data;
    toSeed.push({
      subject_slug: slug,
      subject: db?.subject || data.subject,
      year,
      lesson_no: Number(n),
      board: db?.board ?? (repo.lesson.board || data.board || null),
      unit: repo.lesson.unit,
      title: repo.lesson.title,
      objectives: repo.lesson.objectives || [],
      content: repo.lesson,
      content_updated_at: new Date().toISOString(),
      content_updated_by_name: REPO_NAME,
    });
    nowState.push({ scope: k, hash: R });
    continue;
  }
  if (!R && D) {
    if (B && D === B) {
      await store.clearLessonContent(db);
      removedState.push(k);
      counts.received_lessons++;
    } else note(k, `${label}: edited in the portal but removed from the repository, so it was not sent. Ask whoever manages the lesson files.`);
    continue;
  }
  let action;
  if (B == null) action = "export";
  else if (D === B) action = "import";
  else if (R === B) action = "export";
  else {
    action = "export";
    note(k, `${label}: changed both in the portal and in the repository since the last sync; the portal version was kept (the repository version is in the git history).`);
  }
  if (action === "import") {
    if (await store.setLessonContent(db, repo.lesson)) {
      nowState.push({ scope: k, hash: R });
      counts.received_lessons++;
    } else note(k, `${label}: someone was editing it in the portal while the sync ran; it will be compared again next time.`);
    continue;
  }
  const content = orderLike({ ...db.content, n: Number(n) }, repo.lesson);
  const issues = checkLesson(content, label);
  if (issues.length) {
    issues.forEach((x) => note(k, `Not sent yet: ${x}`));
    continue;
  }
  const e = editFor(repo.f);
  e.lessons.set(repo.index, content);
  const entry = { scope: k, hash: contentHash(content) };
  pendingState.push(entry);
  e.scopes.push({ scope: k, entry, label, lesson: k });
  counts.sent_lessons++;
  if (human(db.content_updated_by_name)) editors.add(db.content_updated_by_name);
}
if (toSeed.length) {
  await store.seedLessons(toSeed);
  counts.received_lessons += toSeed.length;
}

// Remember what is already in step (imports, and parts that were equal but never recorded).
if (nowState.length || removedState.length) await store.saveState(nowState, removedState);

// Write the files ------------------------------------------------------------
function render(e) {
  let raw = e.raw;
  if (e.units) raw = replaceSpan(raw, spanAt(spanTree(raw), ["units"]), e.units);
  if (e.years.size) {
    const ym = { ...(e.data.yearMap || {}) };
    let reshape = false;
    for (const [y, v] of e.years) {
      if (!v.length || !(y in ym)) reshape = true;
      if (v.length) ym[y] = v;
      else delete ym[y];
    }
    if (reshape) {
      const ordered = Object.fromEntries(Object.keys(ym).sort((a, b) => yearIndex(a) - yearIndex(b)).map((y) => [y, ym[y]]));
      raw = replaceSpan(raw, spanAt(spanTree(raw), ["yearMap"]), ordered);
    } else for (const [y, v] of e.years) raw = replaceSpan(raw, spanAt(spanTree(raw), ["yearMap", y]), v);
  }
  for (const [index, v] of [...e.lessons.entries()].sort((a, b) => b[0] - a[0])) raw = replaceSpan(raw, spanAt(spanTree(raw), ["lessons", index]), v);
  JSON.parse(raw); // must still be valid JSON
  return raw;
}

// The real validators, as a last guard. Returns Map(absolute file -> [error lines]).
function validatorErrors() {
  const errs = new Map();
  const add = (file, msg) => errs.set(file, [...(errs.get(file) || []), msg]);
  const run = (script, args, env) => {
    try {
      execFileSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return "";
    } catch (x) {
      return `${x.stdout || ""}\n${x.stderr || ""}`;
    }
  };
  const syl = run(path.join(ROOT, "scripts/syllabus/validate.mjs"), [SYLLABUS_DIR], {});
  for (const line of syl.split("\n")) {
    const m = line.match(/^ERROR (\S+?): (.*)$/);
    if (!m) continue;
    // A hub that lost its spec unit is reported against hubs.json: blame that subject's spec file.
    const hub = m[2].match(/: (.+) has no unit /);
    const rel = hub && HUB_SUBJECT_SLUG[hub[1]] ? `ks4/${HUB_SUBJECT_SLUG[hub[1]]}.json` : m[1];
    add(path.join(SYLLABUS_DIR, rel), m[2]);
  }
  const les = run(path.join(ROOT, "scripts/lessons/validate.mjs"), [], { LESSONS_DIR: LESSONS_DIR });
  for (const line of les.split("\n")) {
    // "subject/y5.json: …", "subject/y5.json#3: …" or "subject/y5.json#3 [check] "Heading": …"
    const m = line.match(/^([^\s#:]+\.json)(?:#\d+)?:?\s*(.*)$/);
    if (m) add(path.join(LESSONS_DIR, m[1]), m[2]);
  }
  return errs;
}

const changedFiles = [];
const written = [];
if (fileEdits.size) {
  const baseline = validatorErrors();
  for (const e of fileEdits.values()) {
    let raw;
    try {
      raw = render(e);
    } catch (x) {
      e.scopes.forEach((s) => note(s.scope, `Not sent yet: ${s.label}: could not be written (${x.message}).`));
      e.failed = true;
      continue;
    }
    if (raw !== e.raw) {
      fs.writeFileSync(e.file, raw);
      written.push(e);
    }
  }
  const after = validatorErrors();
  for (const e of written) {
    const was = new Set(baseline.get(e.file) || []);
    const fresh = (after.get(e.file) || []).filter((m) => !was.has(m));
    if (!fresh.length) continue;
    fs.writeFileSync(e.file, e.raw); // put the file back; the other files still go
    e.failed = true;
    e.scopes.forEach((s) => note(s.scope, `Not sent yet: ${s.label}: the content check failed (${fresh[0]}).`));
  }
  for (const e of fileEdits.values()) {
    if (!e.failed) {
      if (written.includes(e)) changedFiles.push(path.relative(ROOT, e.file));
      continue;
    }
    for (const s of e.scopes) {
      const i = pendingState.indexOf(s.entry);
      if (i >= 0) pendingState.splice(i, 1);
      if (s.lesson) counts.sent_lessons--;
    }
  }
  for (const e of fileEdits.values()) if (!e.failed) e.scopes.forEach((s) => s.lesson && inStep.add(s.lesson));
}

// Lessons waiting for slides that can be built now: flagged by the editor, recently, and the
// repo copy already matches the portal (an edit still waiting to be sent is built after it is).
const recent = Date.now() - 3 * 3600 * 1000;
const rebuildReady = dbLessons.some((l) => {
  const k = scopeKey.lesson(l.subject_slug, l.year, l.lesson_no);
  return l.rebuild_requested && inStep.has(k) && l.content_updated_at && Date.parse(l.content_updated_at) > recent;
});
const summary = {
  changedFiles,
  lessonsChanged: written.some((e) => !e.failed && e.lessons.size > 0),
  syllabusChanged: written.some((e) => !e.failed && (e.units || e.years.size)),
  rebuildReady,
  editors: [...editors].sort(),
  ...counts,
  problems,
};
const parts = [];
if (counts.sent_units || counts.sent_lessons) parts.push(`sent ${counts.sent_units} unit change(s) and ${counts.sent_lessons} lesson(s) from the portal`);
if (counts.received_units || counts.received_lessons) parts.push(`brought ${counts.received_units} unit change(s) and ${counts.received_lessons} lesson(s) in from the repository`);
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(outDir, "pending.json"),
  JSON.stringify({
    state: pendingState,
    removed: [],
    run: { started_at: startedAt, trigger: process.env.SYNC_TRIGGER || null, ...counts, problems, message: parts.length ? `The sync ${parts.join(", and ")}.` : "Everything was already in step." },
  }),
);
console.log(`Files changed: ${changedFiles.length}`);
changedFiles.forEach((f) => console.log(`  ${f}`));
console.log(`Sent from the portal: ${counts.sent_units} unit change(s), ${counts.sent_lessons} lesson(s). Brought in from the repo: ${counts.received_units} unit change(s), ${counts.received_lessons} lesson(s).`);
problems.forEach((p) => console.log(`::warning::${p.text}`));
