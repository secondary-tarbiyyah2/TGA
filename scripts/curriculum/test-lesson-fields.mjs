// Offline test: the lesson format's newer fields (answers, minutes and models on questions, hook,
// pictures, islamicLink,
// routines, resources, chart / numberline / fraction / diagram / sort blocks) survive the round
// trip repo -> portal -> repo through the curriculum sync, invalid portal edits are held back,
// and the content hash (which decides rebuilds) changes when only an answer changes.
//   node scripts/curriculum/test-lesson-fields.mjs
// Runs against a JSON fixture in a temporary folder (CURRICULUM_FIXTURE); no database needed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { contentHash, stableStringify } from "../lessons/content-hash.mjs";

const itemText = (x) => (x && typeof x === "object" ? x.q : x);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-fields-"));
const lessons = path.join(dir, "lessons");
fs.cpSync(path.join(ROOT, "content/syllabus"), path.join(dir, "syllabus"), { recursive: true });

// One real lesson, enriched with every new field.
const file = JSON.parse(fs.readFileSync(path.join(ROOT, "content/lessons/mathematics/y7.json"), "utf8"));
const l = structuredClone([...file.lessons].sort((a, b) => a.n - b.n)[0]);
// v2 hook, replaced below by the v3 ponder hook
l.hook = { type: "odd-one-out", text: "Which is the odd one out for 3, 5, 5, 8, 9?", options: ["5 (mode)", "5 (median)", "6 (range)", "6 (mean)"], a: "The range: a spread, not an average." };
l.routines = { starter: "show-me", hinge: "teams-poll", exit: "chat-waterfall" };
l.resources = ["Slides", "Mini-whiteboard and pen"];
l.starter = l.starter.map((q, i) => (i === 0 ? { q, a: "3, 7, 7, 12, 19", mins: 2 } : q));
l.exit = l.exit.map((q) => ({ q, a: "See the worked solution" }));
// Lessons v3: the ponder hook, pictures, the Islamic link and worked models on items.
l.hook = { type: "ponder", text: "Is the average always the fairest way to describe a group?" };
l.pictures = [{ find: "abacus wooden", alt: "A wooden abacus", for: "hook" }, { find: "bar chart diagram", alt: "A bar chart", for: "teach:3", file: "File:Example.svg", credit: "A. Person", licence: "CC BY-SA 4.0" }];
l.islamicLink = { text: "Allah has created everything in due measure (al-Qamar 54:49).", at: "start" };
l.practice = l.practice.map((q, i) => (i === 0 ? { q: itemText(q), a: "6", model: "Add the values: 30. Divide by 5: 6.", mins: 3 } : q));
l.independent = l.independent.map((q, i) => (i === 0 ? { q: itemText(q), model: "Write the values in order first." } : q));
l.teach = l.teach.slice(0, 2).concat([
  { heading: "A chart", bullets: ["Mode: the tallest bar"], chart: { kind: "bar", labels: ["0", "1", "2"], values: [1, 3, 6], unit: "Pupils" } },
  { heading: "A number line", routine: "show-me", numberline: { min: 0, max: 10, step: 1, marks: [{ at: 3, label: "Start" }] } },
  { heading: "Fractions", fraction: [{ parts: 15, shaded: 6 }, { parts: 5, shaded: 2 }] },
  { heading: "Concept map", diagram: { centre: "Averages", items: ["mode", "median", "mean"] } },
  { heading: "Card sort", sort: { columns: ["Average", "Spread"], cards: ["mode", "range", "median", "mean"], answer: [0, 1, 0, 0] } },
]);
fs.mkdirSync(path.join(lessons, "mathematics"), { recursive: true });
fs.writeFileSync(path.join(lessons, "mathematics", "y7.json"), JSON.stringify({ ...file, lessons: [l] }, null, 2) + "\n");

const fixture = path.join(dir, "db.json");
const env = { ...process.env, CURRICULUM_FIXTURE: fixture, LESSONS_DIR: lessons, SYLLABUS_DIR: path.join(dir, "syllabus") };
const sync = () => execFileSync(process.execPath, [path.join(ROOT, "scripts/curriculum/sync.mjs"), "run", path.join(dir, "out")], { env, encoding: "utf8", cwd: ROOT });
const repoLesson = () => JSON.parse(fs.readFileSync(path.join(lessons, "mathematics", "y7.json"), "utf8")).lessons[0];
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed++;
};

const validate = () => {
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/lessons/validate.mjs")], { env: { ...process.env, LESSONS_DIR: lessons }, encoding: "utf8" });
    return true;
  } catch (e) {
    console.log(e.stdout, e.stderr);
    return false;
  }
};
ok(validate(), "the enriched lesson passes validate.mjs");

sync();
let db = JSON.parse(fs.readFileSync(fixture, "utf8"));
const row = () => db.lessons.find((r) => r.subject_slug === "mathematics" && r.year === "y7" && r.lesson_no === l.n);
ok(stableStringify(row().content) === stableStringify(repoLesson()), "seeding copies every new field into the portal");

// A portal edit to an answer, a routine and a chart is written back exactly.
const before = contentHash(repoLesson());
row().content.starter[0].a = "3, 7, 7, 12 and 19";
row().content.routines.practice = "think-pair-share";
row().content.teach[2].chart.values = [2, 3, 5];
row().content_updated_at = new Date(Date.now() + 5000).toISOString();
row().content_updated_by_name = "A teacher";
fs.writeFileSync(fixture, JSON.stringify(db, null, 1));
sync();
db = JSON.parse(fs.readFileSync(fixture, "utf8"));
ok(stableStringify(repoLesson()) === stableStringify(row().content), "a portal edit to answers, routines and a chart reaches the repo unchanged");
ok(contentHash(repoLesson()) !== before, "the content hash changes, so the deck and plan are rebuilt");
ok(validate(), "the written file still passes validate.mjs");

// An invalid edit (a sort answer naming a column that does not exist) is held back.
const good = stableStringify(repoLesson());
row().content.teach[6].sort.answer = [0, 1, 0, 5];
row().content_updated_at = new Date(Date.now() + 10000).toISOString();
fs.writeFileSync(fixture, JSON.stringify(db, null, 1));
sync();
ok(stableStringify(repoLesson()) === good, "an invalid block is not written to the repo");
ok(/sort answer/.test(fs.readFileSync(path.join(dir, "out", "summary.json"), "utf8")), "and the reason is reported");

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} check(s) failed` : "All checks passed");
process.exit(failed ? 1 : 0);
