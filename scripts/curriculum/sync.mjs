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
// How it decides, for each part of the curriculum (one subject's year of units, one KS4
// specification's units, one lesson), using the content as it was when the two last agreed
// (curriculum_sync_state):
//   * same in both                        -> nothing to do
//   * never synced and the portal is empty -> copy the repo into the portal (the first seed)
//   * only the repo changed               -> copy the repo into the portal
//   * only the portal changed             -> write the portal's version into content/
//   * both changed                        -> the portal's version wins (it is the source of
//                                            truth); the clash is logged for the run
// So the seed never overwrites a portal edit, and nothing is committed unless something
// really changed, which is what stops the sync from looping.
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
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
  writeJson,
} from "./lib.mjs";
import { retiredChecker } from "../lessons/retired.mjs";

const [mode = "run", outArg] = process.argv.slice(2);
const outDir = path.resolve(outArg || path.join(ROOT, "out/curriculum-sync"));
const REPO_NAME = "the repository (content/)";
const UNIT_COLS = "id, subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_at, updated_by_name";
const LESSON_COLS = "id, subject_slug, subject, year, board, unit, lesson_no, title, content, content_updated_at, content_updated_by_name, rebuild_requested";

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
    loadUnits: () => all("curriculum_units", UNIT_COLS, "id"),
    loadLessons: () => all("curriculum_lessons", LESSON_COLS, "id"),
    loadState: async () => new Map((await all("curriculum_sync_state", "scope, hash", "scope")).map((r) => [r.scope, r.hash])),
    // Update rows in place by position (ids stay the same), add new ones, remove the rest.
    // Each update only applies if the row has not been edited since it was read.
    async replaceUnitScope(existing, rows) {
      const old = sortRows(existing);
      const inserts = [];
      for (let i = 0; i < rows.length; i++) {
        const patch = { ...rows[i], updated_by: null, updated_by_name: REPO_NAME };
        if (old[i]) {
          const data = must(await sb.from("curriculum_units").update(patch).eq("id", old[i].id).eq("updated_at", old[i].updated_at).select("id"), "update unit");
          if (!data.length) return false;
        } else inserts.push(patch);
      }
      if (inserts.length) must(await sb.from("curriculum_units").insert(inserts), "insert units");
      for (const r of old.slice(rows.length)) {
        const data = must(await sb.from("curriculum_units").delete().eq("id", r.id).eq("updated_at", r.updated_at).select("id"), "delete unit");
        if (!data.length) return false;
      }
      return true;
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
      must(await sb.from("curriculum_lessons").update({ content: null, content_updated_at: new Date().toISOString(), content_updated_by_name: REPO_NAME }).eq("id", row.id), "clear lesson");
    },
    async saveState(entries, removed = []) {
      for (let i = 0; i < entries.length; i += 500) must(await sb.from("curriculum_sync_state").upsert(entries.slice(i, i + 500).map((e) => ({ ...e, synced_at: new Date().toISOString() })), { onConflict: "scope" }), "save sync state");
      for (let i = 0; i < removed.length; i += 200) must(await sb.from("curriculum_sync_state").delete().in("scope", removed.slice(i, i + 200)), "remove sync state");
    },
    async logRun(run) {
      must(await sb.from("curriculum_sync_runs").insert(run), "log run");
    },
  };
}

// A JSON file standing in for the tables, so the sync can be tested without a database.
function fixtureStore(file) {
  const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  db.units ||= [];
  db.lessons ||= [];
  db.state ||= {};
  db.runs ||= [];
  db.lessonVersions ||= [];
  const save = () => fs.writeFileSync(file, JSON.stringify(db, null, 1));
  const now = () => new Date().toISOString();
  let seq = db.units.length + db.lessons.length;
  const id = () => `fx-${++seq}`;
  return {
    loadUnits: async () => structuredClone(db.units),
    loadLessons: async () => structuredClone(db.lessons),
    loadState: async () => new Map(Object.entries(db.state)),
    async replaceUnitScope(existing, rows) {
      const old = sortRows(existing);
      rows.forEach((r, i) => {
        const at = old[i] ? db.units.findIndex((u) => u.id === old[i].id) : -1;
        const row = { ...r, id: at >= 0 ? db.units[at].id : id(), updated_at: now(), updated_by_name: REPO_NAME };
        if (at >= 0) db.units[at] = row;
        else db.units.push(row);
      });
      const drop = new Set(old.slice(rows.length).map((r) => r.id));
      db.units = db.units.filter((u) => !drop.has(u.id));
      save();
      return true;
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
      for (const e of entries) db.state[e.scope] = e.hash;
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
const startedAt = new Date().toISOString();
const problems = [];
const nowState = []; // safe to remember straight away (the repo already has it)
const pendingState = []; // remember only once the commit is pushed
const removedState = [];
const editors = new Set();
const counts = { sent_units: 0, sent_lessons: 0, received_units: 0, received_lessons: 0 };
const fileEdits = new Map(); // file -> { raw, kind, years: Map, units?, lessons: Map(index -> value) }
const editFor = (f) => {
  if (!fileEdits.has(f.file)) fileEdits.set(f.file, { file: f.file, raw: f.raw, data: f.data, years: new Map(), units: null, lessons: new Map() });
  return fileEdits.get(f.file);
};
const yearName = (y) => (y === "reception" ? "Reception" : `Year ${String(y).slice(1)}`);

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

for (const k of [...new Set([...repoScopes.keys(), ...dbScopes.keys()])].sort()) {
  const repo = repoScopes.get(k);
  const db = dbScopes.get(k);
  const meta = repo || db;
  const file = repo?.file || fileFor[meta.kind].get(meta.slug);
  const label = `${meta.subject}${meta.kind === "spec" ? " (Years 10 and 11)" : `, ${yearName(meta.year)}`}`;
  const repoUnits = repo?.units || [];
  const rows = db?.rows || [];
  const dbValue = sortRows(rows).map(unitToRepo);
  const R = contentHash(repoUnits);
  const D = contentHash(dbValue);
  const B = state.get(k);
  if (R === D) {
    if (B !== R) nowState.push({ scope: k, hash: R });
    continue;
  }
  let action;
  if (!rows.length && B == null) action = "import";
  else if (B == null) action = "export";
  else if (D === B) action = "import";
  else if (R === B) action = "export";
  else {
    action = "export";
    problems.push(`${label}: changed both in the portal and in the repository since the last sync. The portal version was kept; the repository version is in the git history.`);
  }
  if (action === "import") {
    const newRows = repoUnits.map((u, i) => unitFromRepo({ kind: meta.kind, slug: meta.slug, subject: meta.subject, year: meta.year || "y10", position: i }, u));
    if (await store.replaceUnitScope(rows, newRows)) {
      nowState.push({ scope: k, hash: R });
      counts.received_units += newRows.length;
    } else problems.push(`${label}: someone was editing it in the portal while the sync ran; it will be compared again next time.`);
    continue;
  }
  if (!file) {
    problems.push(`${label}: there is no syllabus file for this subject in the repository, so it could not be sent.`);
    continue;
  }
  const issues = checkUnits(meta.kind, dbValue, label);
  if (issues.length) {
    problems.push(...issues.map((x) => `Not sent yet: ${x}`));
    continue;
  }
  const e = editFor(file);
  if (meta.kind === "spec") e.units = dbValue;
  else e.years.set(meta.year, dbValue);
  pendingState.push({ scope: k, hash: D });
  const before = new Map(repoUnits.map((u) => [contentHash(u), true]));
  const changed = rows.filter((r) => !before.has(contentHash(unitToRepo(r))));
  counts.sent_units += Math.max(changed.length, 1);
  changed.forEach((r) => r.updated_by_name && r.updated_by_name !== REPO_NAME && editors.add(r.updated_by_name));
}

// Lessons --------------------------------------------------------------------
const isRetired = retiredChecker();
const repoLessons = new Map();
for (const f of lessonFiles) f.data.lessons.forEach((l, index) => repoLessons.set(scopeKey.lesson(f.slug, f.year, l.n), { f, index, lesson: l }));
const dbLessonMap = new Map(dbLessons.map((l) => [scopeKey.lesson(l.subject_slug, l.year, l.lesson_no), l]));
const toSeed = [];
for (const k of [...new Set([...repoLessons.keys(), ...dbLessonMap.keys()])].sort()) {
  const repo = repoLessons.get(k);
  const db = dbLessonMap.get(k);
  const [slug, year, n] = k.slice("lesson:".length).split("/");
  if (isRetired(slug, year, Number(n))) continue;
  const label = `${db?.subject || repo?.f.data.subject || slug}, ${yearName(year)}, lesson ${n}${db?.title || repo?.lesson.title ? ` (${db?.title || repo?.lesson.title})` : ""}`;
  const R = repo ? contentHash(repo.lesson) : null;
  const D = db?.content ? contentHash(db.content) : null;
  const B = state.get(k);
  if (R && R === D) {
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
    } else problems.push(`${label}: edited in the portal but removed from the repository, so it was not sent. Ask whoever manages the lesson files.`);
    continue;
  }
  let action;
  if (B == null) action = "export";
  else if (D === B) action = "import";
  else if (R === B) action = "export";
  else {
    action = "export";
    problems.push(`${label}: changed both in the portal and in the repository since the last sync. The portal version was kept; the repository version is in the git history.`);
  }
  if (action === "import") {
    if (await store.setLessonContent(db, repo.lesson)) {
      nowState.push({ scope: k, hash: R });
      counts.received_lessons++;
    } else problems.push(`${label}: someone was editing it in the portal while the sync ran; it will be compared again next time.`);
    continue;
  }
  const content = orderLike({ ...db.content, n: Number(n) }, repo.lesson);
  const issues = checkLesson(content, label);
  if (issues.length) {
    problems.push(...issues.map((x) => `Not sent yet: ${x}`));
    continue;
  }
  editFor(repo.f).lessons.set(repo.index, content);
  pendingState.push({ scope: k, hash: contentHash(content) });
  counts.sent_lessons++;
  if (db.content_updated_by_name && db.content_updated_by_name !== REPO_NAME) editors.add(db.content_updated_by_name);
}
if (toSeed.length) {
  await store.seedLessons(toSeed);
  counts.received_lessons += toSeed.length;
}

// Remember what is already in step (imports, and parts that were equal but never recorded).
if (nowState.length || removedState.length) await store.saveState(nowState, removedState);

// Write the files ------------------------------------------------------------
const changedFiles = [];
for (const e of fileEdits.values()) {
  let raw = e.raw;
  const tree0 = spanTree(raw);
  if (e.units) raw = replaceSpan(raw, spanAt(tree0, ["units"]), e.units);
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
    } else
      for (const [y, v] of e.years) raw = replaceSpan(raw, spanAt(spanTree(raw), ["yearMap", y]), v);
  }
  for (const [index, v] of [...e.lessons.entries()].sort((a, b) => b[0] - a[0])) raw = replaceSpan(raw, spanAt(spanTree(raw), ["lessons", index]), v);
  try {
    JSON.parse(raw);
  } catch {
    // Should not happen; fall back to rewriting the whole file.
    const data = JSON.parse(e.raw);
    if (e.units) data.units = e.units;
    for (const [y, v] of e.years) if (v.length) data.yearMap[y] = v;
    else delete data.yearMap[y];
    for (const [index, v] of e.lessons) data.lessons[index] = v;
    writeJson(e.file, data, e.raw);
    changedFiles.push(path.relative(ROOT, e.file));
    continue;
  }
  if (raw !== e.raw) {
    fs.writeFileSync(e.file, raw);
    changedFiles.push(path.relative(ROOT, e.file));
  }
}

const rebuildRequested = dbLessons.some((l) => l.rebuild_requested);
const summary = {
  changedFiles,
  lessonsChanged: changedFiles.some((f) => f.startsWith("content/lessons/")),
  syllabusChanged: changedFiles.some((f) => f.startsWith("content/syllabus/")),
  rebuildRequested,
  editors: [...editors].sort(),
  ...counts,
  problems,
};
const parts = [];
if (counts.sent_units || counts.sent_lessons) parts.push(`sent ${counts.sent_units} unit change(s) and ${counts.sent_lessons} lesson(s) from the portal`);
if (counts.received_units || counts.received_lessons) parts.push(`brought ${counts.received_units} unit(s) and ${counts.received_lessons} lesson(s) in from the repository`);
fs.mkdirSync(outDir, { recursive: true });
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
console.log(`Sent from the portal: ${counts.sent_units} unit change(s), ${counts.sent_lessons} lesson(s). Brought in from the repo: ${counts.received_units} unit(s), ${counts.received_lessons} lesson(s).`);
problems.forEach((p) => console.log(`::warning::${p}`));
