// Term resource register: every resource the lessons name, once, per term.
//   node scripts/resources/register.mjs            -> writes content/resources/<term>.json for all four terms
//   node scripts/resources/register.mjs --check    -> fails if a register file is out of date (CI)
//   node scripts/resources/register.mjs --report=spring-1 -> prints counts by type, source and subject
// Reads each lesson's `resources` and its `homework` (when it names a sheet, set or quiz to hand out).
// The term comes from the lesson's unit ("Spring 1: ..."); lessons with no term are not listed.
// Hand corrections live in content/resources/overrides.json: { "<id>": { "type"?, "source"?, "title"?, "skip"? } }.
import fs from "node:fs";
import path from "node:path";
import { TERMS, SOURCES, RES_DIR, ITEMS_DIR, clean, slug, shortHash, termOfUnit, loadLessonFiles, classify, homeworkResource, scopeOf, normTitle, readJson, itemPath } from "./lib.mjs";

const args = process.argv.slice(2);
const check = args.includes("--check");
const report = (args.find((a) => a.startsWith("--report=")) || "").slice(9);
const overrides = readJson(path.join(RES_DIR, "overrides.json"), {});

/** Build the register for every term: Map term -> entries. */
export function buildRegister() {
  const files = loadLessonFiles();
  // 1. Every use: one per lesson per resource line.
  const uses = new Map(); // key subject|year|norm -> { text, uses: [] }
  for (const f of files) {
    for (const l of f.data.lessons || []) {
      const term = termOfUnit(l.unit);
      if (!term) continue;
      const lines = [];
      for (const r of Array.isArray(l.resources) ? l.resources : []) lines.push({ text: clean(r), via: "resources" });
      const hw = homeworkResource(Array.isArray(l.homework) ? l.homework.join(" ") : l.homework);
      if (hw) lines.push({ text: hw, via: "homework" });
      for (const { text, via } of lines) {
        if (!text) continue;
        const norm = normTitle(text).toLowerCase();
        const k = `${f.slug}|${f.year}|${via}|${norm}`;
        if (!uses.has(k)) uses.set(k, { subjectSlug: f.slug, subject: clean(f.data.subject), year: f.year, text, via, uses: [] });
        uses.get(k).uses.push({ term, n: l.n, title: clean(l.title), unit: clean(l.unit) });
      }
    }
  }
  // 2. One entry per resource (split by unit or lesson when a generic title means a different resource each time).
  const entries = [];
  const seen = new Set();
  for (const u of uses.values()) {
    const c = u.via === "homework" ? { ...classify(u.text), ...(classify(u.text).source === "generated" ? {} : { source: "generated" }) } : classify(u.text);
    if (u.via === "homework" && !["revision set", "quiz", "worksheet", "knowledge organiser", "model text", "writing frame", "printable graph/grid", "practical guide"].includes(c.type)) c.type = "revision set";
    const scope = u.via === "homework" ? "lesson" : scopeOf(c.type, c.source, u.text, u.uses);
    const groups = new Map();
    for (const x of u.uses) {
      const g = scope === "lesson" ? `l${x.n}` : scope === "unit" ? `u${shortHash(x.unit)}` : "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(x);
    }
    for (const [g, list] of groups) {
      const base = normTitle(u.text);
      let title = u.via === "homework" ? `Homework, lesson ${list[0].n}: ${base}` : base;
      if (scope === "unit" && u.via !== "homework") title = `${base}: ${list[0].unit.replace(/^(spring|summer|autumn) \d:\s*/i, "")}`;
      if (scope === "lesson" && u.via !== "homework") title = `${base} (lesson ${list[0].n})`;
      let id = `${u.subjectSlug}-${u.year}-${slug(u.via === "homework" ? `homework ${list[0].n} ${base}` : base, 48)}${g ? `-${g}` : ""}`;
      if (seen.has(id)) id = `${id}-${shortHash(u.text + g)}`;
      seen.add(id);
      const o = overrides[id] || {};
      if (o.skip) continue;
      const type = o.type || c.type;
      const source = o.source || c.source;
      const item = source === "generated" ? itemPath(u.subjectSlug, u.year, id) : null;
      const made = !!item && fs.existsSync(item);
      const lessons = [...new Map(list.map((x) => [x.n, x])).values()].sort((a, b) => a.n - b.n);
      const terms = [...new Set(lessons.map((x) => x.term))];
      for (const term of terms) {
        const inTerm = lessons.filter((x) => x.term === term);
        entries.push({
          term,
          id,
          title: clean(o.title || title).slice(0, 220),
          type,
          subject: u.subject,
          subjectSlug: u.subjectSlug,
          year: u.year,
          units: [...new Set(inTerm.map((x) => x.unit))],
          lessons: inTerm.map((x) => ({ n: x.n, title: x.title })),
          via: u.via,
          source,
          status: source === "generated" ? (made ? "made" : "to make") : source === "school" ? "in school files" : "ready",
          wording: u.text.length > 220 ? `${u.text.slice(0, 217)}...` : u.text,
          ...(item ? { item: path.relative(path.dirname(ITEMS_DIR), item).replace(/\\/g, "/") } : {}),
        });
      }
    }
  }
  const byTerm = new Map(TERMS.map((t) => [t.id, []]));
  for (const e of entries) if (byTerm.has(e.term)) byTerm.get(e.term).push(e);
  for (const list of byTerm.values()) list.sort((a, b) => a.subjectSlug.localeCompare(b.subjectSlug) || yearOrder(a.year) - yearOrder(b.year) || (a.lessons[0]?.n ?? 0) - (b.lessons[0]?.n ?? 0) || a.title.localeCompare(b.title));
  return byTerm;
}
const yearOrder = (y) => (/^y(\d+)$/.test(y) ? Number(y.slice(1)) : 0);

function counts(list) {
  const by = (f) => list.reduce((m, e) => ((m[f(e)] = (m[f(e)] || 0) + 1), m), {});
  return { total: list.length, byType: by((e) => e.type), bySource: by((e) => e.source), byStatus: by((e) => e.status) };
}

function fileFor(term, list) {
  const t = TERMS.find((x) => x.id === term);
  return {
    term,
    label: t.label,
    dates: t.dates,
    note: "Generated by scripts/resources/register.mjs from content/lessons (resources and homework). Do not edit by hand: change the lesson, or content/resources/overrides.json, and run the script again.",
    sources: SOURCES,
    counts: counts(list),
    resources: list.map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "term"))),
  };
}

/** Readable but compact: the header indented, then one resource per line (keeps the files small and diffs clear). */
function format(o) {
  const { resources, ...head } = o;
  const h = JSON.stringify(head, null, 1).replace(/\n}$/, "");
  return `${h},\n "resources": [\n${resources.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n ]\n}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const byTerm = buildRegister();
  let stale = 0;
  for (const [term, list] of byTerm) {
    const file = path.join(RES_DIR, `${term}.json`);
    const next = format(fileFor(term, list));
    if (report === term) {
      const c = counts(list);
      console.log(JSON.stringify(c, null, 1));
      const gen = list.filter((e) => e.source === "generated");
      const bySub = {};
      for (const e of gen) bySub[e.subjectSlug] = (bySub[e.subjectSlug] || 0) + 1;
      console.log("generated by subject", bySub);
    }
    if (check) {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (cur !== next) {
        stale++;
        console.error(`${path.relative(process.cwd(), file)} is out of date: run node scripts/resources/register.mjs`);
      }
      continue;
    }
    fs.mkdirSync(RES_DIR, { recursive: true });
    fs.writeFileSync(file, next);
    if (!report) console.log(`${term}: ${list.length} resources (${list.filter((e) => e.source === "generated").length} for TGA to make: ${list.filter((e) => e.status === "made").length} made, ${list.filter((e) => e.status === "to make").length} still to make)`);
  }
  if (stale) process.exit(1);
}
