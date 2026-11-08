// Shared pieces for the curriculum sync (scripts/curriculum/sync.mjs): how a unit in
// content/syllabus/**.json maps to a row of curriculum_units and back, how lessons keep their
// key order, the checks a part must pass before it is written to the repo, and a small JSON
// locator so an exported file only changes where someone actually edited it.
import fs from "node:fs";
import path from "node:path";
import { contentHash, stableStringify } from "../lessons/content-hash.mjs";

export { contentHash, stableStringify };

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const SYLLABUS_DIR = process.env.SYLLABUS_DIR ? path.resolve(process.env.SYLLABUS_DIR) : path.join(ROOT, "content/syllabus");
export const LESSONS_DIR = process.env.LESSONS_DIR ? path.resolve(process.env.LESSONS_DIR) : path.join(ROOT, "content/lessons");

export const HALF_TERMS = ["autumn1", "autumn2", "spring1", "spring2", "summer1", "summer2"];
const YEAR_ORDER = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];
export const yearIndex = (y) => YEAR_ORDER.indexOf(y);

/** "Autumn 1: The Mysterious Woodlands" -> "autumn1"; anything else -> null. */
export function halfTermFromTitle(title) {
  const m = String(title || "").match(/^\s*(autumn|spring|summer)\s*([12])\b/i);
  return m ? `${m[1].toLowerCase()}${m[2]}` : null;
}

// [repo key, column, type]. "arr" = list of text, "str" = text, "json" = any JSON value.
const COMMON = [
  ["skills", "skills", "arr"],
  ["keyTerms", "key_terms", "arr"],
  ["assess", "assess", "str"],
  ["prereq", "prereq", "str"],
  ["leadsTo", "leads_to", "str"],
  ["weeks", "weeks", "weeks"],
  ["resources", "resources", "str"],
  ["foundingYear", "founding_year", "str"],
  ["halfTerm", "half_term", "half"],
];
export const FIELDS = {
  syllabus: [["unit", "title", "title"], ["focus", "focus", "arr"], ...COMMON],
  spec: [["ref", "ref", "str"], ["title", "title", "title"], ["paper", "paper", "str"], ["year", "year", "year"], ["term", "term", "str"], ["points", "focus", "arr"], ...COMMON],
};

const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const fits = (type, v) =>
  type === "arr" ? isStrArr(v) : type === "weeks" ? Array.isArray(v) : type === "year" ? /^Y(10|11)$/.test(v) : type === "half" ? HALF_TERMS.includes(v) : typeof v === "string";

/** A unit object from the repo -> a curriculum_units row (without id). Lossless: see unitToRepo. */
export function unitFromRepo({ kind, slug, subject, year, position }, obj) {
  const row = {
    subject_slug: slug,
    subject,
    kind,
    year,
    half_term: null,
    term: null,
    position,
    ref: null,
    paper: null,
    title: "",
    focus: [],
    skills: [],
    key_terms: [],
    assess: null,
    prereq: null,
    leads_to: null,
    weeks: [],
    resources: null,
    founding_year: null,
    extra: {},
    key_order: Object.keys(obj),
  };
  const known = new Set();
  for (const [key, col, type] of FIELDS[kind]) {
    if (!(key in obj)) continue;
    const v = obj[key];
    if (!fits(type, v)) continue; // kept as-is in extra below
    known.add(key);
    row[col] = type === "year" ? v.toLowerCase() : v;
  }
  for (const k of Object.keys(obj)) if (!known.has(k)) row.extra[k] = obj[k];
  if (kind === "syllabus" && !row.half_term) row.half_term = halfTermFromTitle(row.title);
  return row;
}

const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined);

/** A curriculum_units row -> the unit object written to the repo, keys in their original order. */
export function unitToRepo(row) {
  const order = row.key_order || [];
  const extra = row.extra || {};
  const out = {};
  const emitted = [];
  for (const [key, col, type] of FIELDS[row.kind]) {
    if (key in extra) continue;
    const v = row[col];
    let emit;
    if (type === "title") emit = true;
    else if (type === "year") emit = true;
    else if (type === "half") emit = !!v && (row.kind === "spec" || order.includes(key) || v !== halfTermFromTitle(row.title));
    else if (type === "arr" || type === "weeks") emit = filled(v) || (order.includes(key) && Array.isArray(v));
    else emit = typeof v === "string";
    if (!emit) continue;
    out[key] = type === "year" ? String(v).toUpperCase() : type === "title" ? String(v) : v;
    emitted.push(key);
  }
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v;
    emitted.push(k);
  }
  const keys = [...order.filter((k) => emitted.includes(k)), ...emitted.filter((k) => !order.includes(k))];
  return Object.fromEntries(keys.map((k) => [k, out[k]]));
}

const htIndex = (h) => (h && HALF_TERMS.includes(h) ? HALF_TERMS.indexOf(h) : HALF_TERMS.length);

/** Teaching order of a scope's rows: KS1-3 by half term (unplaced last), then position; KS4 by position. */
export function sortRows(rows) {
  return [...rows].sort((a, b) => (a.kind === "syllabus" ? htIndex(a.half_term) - htIndex(b.half_term) : 0) || a.position - b.position || String(a.title).localeCompare(String(b.title)));
}

export const scopeKey = {
  syllabus: (slug, year) => `syllabus:${slug}:${year}`,
  spec: (slug) => `spec:${slug}`,
  lesson: (slug, year, n) => `lesson:${slug}/${year}/${n}`,
};

// ── Checks before writing to the repo (the same rules as scripts/*/validate.mjs errors) ──
const str = (v) => typeof v === "string" && v.trim().length > 0;
const strs = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every((x) => typeof x === "string" && x.trim());

// The cross-curricular hubs (content/syllabus/matrices/hubs.json) point at KS4 spec units by
// subject name and ref; scripts/syllabus/validate.mjs fails if a ref they use disappears.
export const HUB_SUBJECT_SLUG = { Science: "gcse-science", Mathematics: "mathematics", Geography: "geography", History: "history", "English Language": "english-language", "English Literature": "english-literature", Business: "business", Computing: "computing", Arabic: "arabic", "Islamic Studies": "islamic-studies" };
let hubCache = null;
/** Spec refs the hubs need, per KS4 subject slug: Map slug -> Map ref -> hub titles. */
export function hubRefs() {
  if (hubCache) return hubCache;
  hubCache = new Map();
  const dir = path.join(SYLLABUS_DIR, "matrices");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith(".json")) : []) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (d.kind !== "hubs") continue;
    for (const h of d.hubs || [])
      for (const n of h.nodes || []) {
        const slug = HUB_SUBJECT_SLUG[n.subject];
        if (!slug) continue;
        if (!hubCache.has(slug)) hubCache.set(slug, new Map());
        const m = hubCache.get(slug);
        m.set(n.ref, [...(m.get(n.ref) || []), h.title || h.id]);
      }
  }
  return hubCache;
}

/** Problems with one exported unit list, in plain English. `slug` adds the hub check for KS4. */
export function checkUnits(kind, units, label, slug) {
  const p = [];
  units.forEach((u, i) => {
    const name = `${label}, unit ${i + 1}${u.unit || u.title ? ` (${u.unit || u.title})` : ""}`;
    if (kind === "syllabus") {
      if (!str(u.unit)) p.push(`${name}: the unit needs a title`);
      if (!strs(u.focus)) p.push(`${name}: add at least one line to "What it covers"`);
    } else {
      for (const k of ["ref", "title", "paper"]) if (!str(u[k])) p.push(`${name}: ${k === "ref" ? "spec reference" : k} is missing`);
      if (!/^Y(10|11)$/.test(u.year || "")) p.push(`${name}: the year must be Year 10 or Year 11`);
      if (!strs(u.points)) p.push(`${name}: add at least one specification point`);
    }
  });
  if (kind === "spec") {
    if (!units.length) p.push(`${label}: a specification needs at least one unit`);
    const refs = units.map((u) => u.ref);
    const dup = refs.filter((r, i) => r && refs.indexOf(r) !== i);
    if (dup.length) p.push(`${label}: the spec reference ${[...new Set(dup)].join(", ")} is used twice`);
    const need = slug ? hubRefs().get(slug) : null;
    for (const [ref, hubs] of need || []) if (!refs.includes(ref)) p.push(`${label}: the cross-curricular hub "${hubs[0]}" links to spec unit ${ref}, which is no longer there. Put the reference ${ref} back (or ask for the hub to be updated)`);
  }
  return p;
}

const BLOCKS = ["model", "check", "quote", "compare", "timeline", "table", "code", "misconception", "cycle"];
/** Problems with one lesson (the checks scripts/lessons/validate.mjs makes). */
export function checkLesson(l, label) {
  const p = [];
  if (!l || typeof l !== "object") return [`${label}: not a lesson`];
  if (!str(l.unit) || !Number.isInteger(l.n) || !str(l.title)) p.push(`${label}: needs a unit, number and title`);
  if (!strs(l.objectives)) p.push(`${label}: add at least one objective`);
  if (!Array.isArray(l.starter) || !l.starter.length) p.push(`${label}: add at least one starter question`);
  if (!Array.isArray(l.teach) || l.teach.length < 3 || l.teach.length > 7) p.push(`${label}: a lesson needs 3 to 7 teaching slides`);
  for (const t of l.teach || []) {
    const kinds = BLOCKS.filter((k) => t?.[k] != null);
    if (kinds.length > 1) p.push(`${label}: slide "${t.heading}" has more than one block`);
    if (!str(t?.heading) || (!kinds.length && !strs(t?.bullets))) p.push(`${label}: every teaching slide needs a heading and at least one bullet point`);
    if (t?.bullets != null && !Array.isArray(t.bullets)) p.push(`${label}: slide bullets must be a list`);
  }
  for (const [k, name] of [["practice", "practice question"], ["independent", "independent task"], ["exit", "exit ticket question"]]) if (!Array.isArray(l[k]) || !l[k].length) p.push(`${label}: add at least one ${name}`);
  if (!(str(l.homework) || strs(l.homework))) p.push(`${label}: add the homework`);
  if (!Array.isArray(l.keywords)) p.push(`${label}: key words must be a list`);
  if (l.successCriteria != null && (!strs(l.successCriteria) || l.successCriteria.length > 3)) p.push(`${label}: success criteria are 1 to 3 lines (all, most, some)`);
  for (const k of ["bigQuestion", "crossCurricular", "smsc"]) if (l[k] != null && !str(l[k])) p.push(`${label}: ${k} must not be empty (leave it out instead)`);
  return p;
}

// ── Lesson key order ─────────────────────────────────────────────────────────
// The database does not keep key order, so a changed lesson is written back in the order
// its repo copy used (or the README order for anything new).
const CANON = [
  "unit", "n", "title", "duration", "board", "bigQuestion", "objectives", "successCriteria", "crossCurricular", "smsc", "keywords", "term", "def",
  "starter", "teach", "heading", "bullets", "note", ...BLOCKS, "problem", "steps", "answer", "q", "options", "why", "wrong", "right", "text", "source",
  "left", "label", "title", "points", "head", "rows", "lang", "output", "practice", "independent", "exit", "homework", "send",
];
export function orderLike(v, template) {
  if (Array.isArray(v)) return v.map((x, i) => orderLike(x, Array.isArray(template) ? template[i] ?? template[0] : undefined));
  if (!v || typeof v !== "object") return v;
  const t = template && typeof template === "object" && !Array.isArray(template) ? Object.keys(template) : [];
  const rank = (k) => {
    const a = t.indexOf(k);
    if (a >= 0) return a;
    const c = CANON.indexOf(k);
    return 1000 + (c >= 0 ? c : CANON.length);
  };
  const keys = Object.keys(v).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return Object.fromEntries(keys.map((k) => [k, orderLike(v[k], template && typeof template === "object" ? template[k] : undefined)]));
}

// ── JSON locator ─────────────────────────────────────────────────────────────
/** Parse JSON text into a tree of {start, end, kind, keys?/items?} spans (offsets into the text). */
export function spanTree(raw) {
  let i = 0;
  const ws = () => {
    while (i < raw.length && /\s/.test(raw[i])) i++;
  };
  const strEnd = () => {
    i++;
    while (raw[i] !== '"') i += raw[i] === "\\" ? 2 : 1;
    i++;
  };
  const value = () => {
    ws();
    const start = i;
    const c = raw[i];
    if (c === "{") {
      i++;
      const keys = new Map();
      ws();
      if (raw[i] === "}") i++;
      else
        for (;;) {
          ws();
          const ks = i;
          strEnd();
          const key = JSON.parse(raw.slice(ks, i));
          ws();
          i++; // :
          keys.set(key, value());
          ws();
          if (raw[i++] === "}") break;
        }
      return { start, end: i, kind: "object", keys };
    }
    if (c === "[") {
      i++;
      const items = [];
      ws();
      if (raw[i] === "]") i++;
      else
        for (;;) {
          items.push(value());
          ws();
          if (raw[i++] === "]") break;
        }
      return { start, end: i, kind: "array", items };
    }
    if (c === '"') strEnd();
    else while (i < raw.length && !/[\s,\]}]/.test(raw[i])) i++;
    return { start, end: i, kind: "scalar" };
  };
  return value();
}

export function spanAt(tree, pathParts) {
  let n = tree;
  for (const p of pathParts) {
    if (!n) return null;
    n = typeof p === "number" ? n.items?.[p] : n.keys?.get(p);
  }
  return n || null;
}

const scalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);

/**
 * JSON.stringify(value, null, 2), indented to start at `indent`. With `inline`, small objects of
 * plain values go on one line ({ "term": "ratio", "def": "…" }), the way some lesson files are written.
 */
export function formatJson(value, indent = "", inline = false) {
  const f = (v, ind) => {
    if (scalar(v)) return JSON.stringify(v);
    const inner = ind + "  ";
    if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => inner + f(x, inner)).join(",\n")}\n${ind}]` : "[]";
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!keys.length) return "{}";
    if (inline && keys.every((k) => scalar(v[k]))) {
      const one = `{ ${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(", ")} }`;
      if (ind.length + one.length <= 160) return one;
    }
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${f(v[k], inner)}`).join(",\n")}\n${ind}}`;
  };
  return f(value, indent);
}

/** Replace one value in JSON text, indenting the new JSON to sit where the old one was. */
export function replaceSpan(raw, span, value) {
  const lineStart = raw.lastIndexOf("\n", span.start - 1) + 1;
  const indent = raw.slice(lineStart, span.start).match(/^\s*/)[0];
  const inline = /\{ "[^"\n]+": [^\n]*\}/.test(raw.slice(span.start, span.end));
  return raw.slice(0, span.start) + formatJson(value, indent, inline) + raw.slice(span.end);
}

/** Write a JSON file the way the repo's files are written (2 spaces, newline at the end if it had one). */
export function writeJson(file, value, previousRaw) {
  const nl = previousRaw == null || previousRaw.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + nl);
}

// ── Reading the repo ─────────────────────────────────────────────────────────
export function readSyllabusFiles() {
  const out = [];
  for (const dir of ["ks1-3", "ks4"]) {
    const d = path.join(SYLLABUS_DIR, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
      const file = path.join(d, f);
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw);
      if (data.kind !== "syllabus" && data.kind !== "spec") continue;
      out.push({ file, raw, data, kind: data.kind, slug: data.slug || f.replace(/\.json$/, ""), subject: data.subject });
    }
  }
  return out;
}

export function readLessonFiles() {
  const out = [];
  if (!fs.existsSync(LESSONS_DIR)) return out;
  for (const s of fs.readdirSync(LESSONS_DIR).sort()) {
    const d = path.join(LESSONS_DIR, s);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
      const file = path.join(d, f);
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw);
      out.push({ file, raw, data, slug: s, year: data.year || f.replace(/\.json$/, "") });
    }
  }
  return out;
}

/** The repo's units for every scope: Map scopeKey -> { kind, slug, subject, year?, units: [repo objects] }. */
export function repoUnitScopes(files) {
  const scopes = new Map();
  for (const f of files) {
    if (f.kind === "spec") scopes.set(scopeKey.spec(f.slug), { kind: "spec", slug: f.slug, subject: f.subject, file: f, units: f.data.units || [] });
    else for (const [year, units] of Object.entries(f.data.yearMap || {})) scopes.set(scopeKey.syllabus(f.slug, year), { kind: "syllabus", slug: f.slug, subject: f.subject, year, file: f, units });
  }
  return scopes;
}
