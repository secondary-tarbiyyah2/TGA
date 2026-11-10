// Term resources: shared helpers for the register (register.mjs), the item seeder (seed.mjs), the
// generator (build.mjs) and the uploader (upload.mjs). See docs/agent-briefs/BRIEF-RESOURCES.md.
//
// Every lesson names its resources in `resources` (and sometimes in `homework`). The register
// lists each one once per term, says what it is (type), where it comes from (source) and whether
// it is ready. Resources TGA has to make itself ("generated") are written as data in
// content/resources/items/<subject>/<year>/<id>.json and built into branded A4 PDFs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const LESSONS_DIR = process.env.LESSONS_DIR ? path.resolve(process.env.LESSONS_DIR) : path.join(ROOT, "content/lessons");
export const RES_DIR = path.join(ROOT, "content/resources");
export const ITEMS_DIR = path.join(RES_DIR, "items");

/** The four founding-year terms, in order, with their dates (founding-year calendar). */
export const TERMS = [
  { id: "spring-1", label: "Spring 1", dates: "11 Jan to 8 Feb 2027" },
  { id: "spring-2", label: "Spring 2", dates: "15 Mar to 23 Apr 2027" },
  { id: "summer-1", label: "Summer 1", dates: "26 Apr to 11 Jun 2027" },
  { id: "summer-2", label: "Summer 2", dates: "14 Jun to 9 Jul 2027" },
];
export const termOfUnit = (unit) => {
  const m = /^\s*(spring|summer|autumn)\s*(\d)/i.exec(String(unit || ""));
  return m ? `${m[1].toLowerCase()}-${m[2]}` : null;
};

/** Types shown in the register (and the portal's filter). */
export const TYPES = [
  "worksheet",
  "quiz",
  "test paper",
  "mock paper",
  "mark scheme",
  "knowledge organiser",
  "writing frame",
  "model text",
  "revision set",
  "printable graph/grid",
  "practical guide",
  "school file",
  "textbook",
  "external tool",
  "slides",
  "equipment",
];
/** Where a resource comes from. */
export const SOURCES = {
  school: "School file named in the plan",
  builder: "Made by the deck builder (slides or pupil PDF)",
  external: "External (publisher, exam board or online tool)",
  household: "Pupil's own equipment or household item",
  generated: "Made by TGA (resource generator)",
};

export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const slug = (s, n = 60) =>
  clean(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, n)
    .replace(/-$/, "") || "resource";
export const shortHash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 6);
export const yearLabel = (y) => (/^y(\d+)$/.test(y) ? `Year ${y.slice(1)}` : y === "reception" ? "Reception" : y);
export const yearNum = (y) => (/^y(\d+)$/.test(y) ? Number(y.slice(1)) : 0);

/** Every lesson file: { slug, year, file, data }. */
export function loadLessonFiles() {
  const out = [];
  for (const s of fs.readdirSync(LESSONS_DIR).sort()) {
    const d = path.join(LESSONS_DIR, s);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
      const data = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
      out.push({ slug: s, year: data.year || f.replace(/\.json$/, ""), file: path.join(d, f), data });
    }
  }
  return out;
}

// ── Classification ───────────────────────────────────────────────────────────────────────────
// A resource line is classified by ordered rules on its wording. The register can be corrected
// by hand in content/resources/overrides.json ({ "<id>": { type?, source?, title?, skip? } }).

const R = (re) => (s) => re.test(s);
const has = {
  builderGeneric: R(/^(the )?(lesson )?slides\b|^slides and teams|^pupil pdf( worksheet)?( \(printable[^)]*\))?\.?$|^printable worksheet \(or drawing tablet\): year \d+ .* lesson \d+|\bon (the )?slides?\b|\(on screen\)|^lesson slides|^teams whiteboard|^the slides|^pupil pdf (copy|of the slides)|^pupil pdf worksheet \(printable/i),
  makeHint: R(/portal printable|portal worksheet|portal question sheet|portal quiz|portal (version|sheet|set|homework set|practice set|question set|graph template|template|copy|card|map)|written for this lesson|for this lesson\b|\(pupil pdf|pupil pdf\)|pupil pdf worksheet:|pupil pdf:|\bprintable\b|printout|\bprinted\b|teacher's (own )?(sheet|worksheet|set|quiz|cards?|text|model)|our own (text|map|practice|questions)|own [0-9a-z]+-style|exam-style questions|knowledge organiser \(portal|made with this unit|forms quiz|\(portal\)|portal response box template|portal revision page|(portal|teacher)-made/i),
  school: R(/\bschool('s)?\b|tarbiyyah|scheme of work|long term plan|long-term plan|cornerstones|white rose|little wandle|maestro|kitabi|\bdisplay:|\(school file\)|intervention|workbook|homework set \d|ealing|educational support programme|department mark schemes|prepared by the department|curriculum map/i),
  textbook: R(/pearson ks3|maths progress|hodder|kerboodle|activate [123]|cgp\b|collins|oxford (international|smart)|\btextbook\b|student book|revision guide|madinah (mushaf|arabic|book)|mushaf|qaidah|qa'idah|noorani|norani|al-arabiyyah bayna yadayk|durus al-lughah|\bnovel\b|play script|anthology|\bedition\b|\bpenguin\b|\bfaber\b/i),
  spec: R(/specification|sample assessment|\bsams?\b|past paper|exam board|examiner'?s? report|formulae sheet \(pearson|pls\b|programming language subset/i),
  external: R(/\bteams\b|\bforms\b(?! quiz)|mathsbot|toy theater|toytheater|\bonline\b|website|\bapp\b|youtube|bbc|oak national|seneca|scratch|python|idle|trinket|replit|code\.org|microbit|micro:bit|google|ordnance survey|os maps|digimap|met office|\bportal\b|quran\.com|tanzil|spreadsheet|excel|word processor|powerpoint|canva|blockly|tinkercad|desmos|geogebra|phet|wikimedia|\bnasa\b|\bmap app\b|street view|virtual|simulation|search engine|dictionary\.com|wordwall|kahoot|quizlet|padlet|sketchup|\bpaint\b program|\bmicrosoft\b|\bnotepad\b/i),
  household: R(/mini-?whiteboard|exercise book|\bpencils?\b|\bpens?\b|\bruler\b|calculator|household|\bglue\b|scissors|\bpasta\b|\bbuttons?\b|\blego\b|\bdice\b|\bcoins?\b|kitchen|scales|measuring jug|tape measure|\bcups?\b|\bplates?\b|\begg box|egg-box|\bpaper\b(?!.*(chart|grid|number line|wall|strip printout))|\bcard\b(?!s? \()|counters|cubes|blocks|matchsticks|cotton buds|string|\bjar\b|\bbottle\b|\bwater\b|\bsalt\b|\bsugar\b|\bice\b|\bbowl\b|\bspoon\b|torch|mirror|magnet|\bfoil\b|tissue|sticky|tape\b|\bfood\b|\bfruit\b|\bvegetables?\b|\bseeds?\b|\bsoil\b|\bplants?\b|\bleaves\b|\bstones?\b|\bsand\b|\bclock\b(?! face)|\bwatch\b|stopwatch|timer|thermometer|\bbook\b|reading book|colouring|crayons|felt|paint\b|brushes|sketchbook|sketch book|clay|dough|cardboard|\bbox\b|\btin\b|\bjug\b|\bbag\b|\bbattery|\bbulb\b|\bwires?\b|\bballoons?\b|\bstraws?\b|\bvinegar\b|bicarbonate|\boil\b|\bsponge\b|\btowel\b|\bnewspaper\b|\bleaflet\b|\brecipe\b|\btimetable\b|\bprayer mat\b|\bmiswak\b|\bhighlighters?\b|\bsticky notes\b|post-it|\brubber\b|eraser|sharpener|protractor|compass(es)?\b(?! rose)|set square|headphones|headset|webcam|camera|\blaptop\b|\bcomputer\b|\bdevice\b|tablet\b(?! \()|\bmicrophone\b|\bwhiteboard\b|green pen|purple pen|\brepair list\b(?!.*template)/i),
};

/** Type of a resource made by TGA (or named by the lesson as a printable), from its wording. */
export function makeType(t) {
  if (/\bmock\b/i.test(t) && !/mark scheme(s)? for/i.test(t)) return "mock paper";
  if (/^mark scheme|mark schemes? for|\bmark scheme\b(?!.*(question|paper|set|sheet))/i.test(t) && !/question|paper|set|sheet/i.test(t)) return "mark scheme";
  if (/\b(end[- ]of[- ]unit|half[- ]term|unit) (test|assessment)\b|\btest paper\b|assessment paper|\bassessment\b.*\bpaper\b/i.test(t)) return "test paper";
  if (/\bquiz\b/i.test(t)) return "quiz";
  if (/checklist/i.test(t)) return "worksheet";
  if (/^[^:(]*\bframe\b/i.test(t)) return "writing frame";
  if (/knowledge organiser|key ?words? (card|mat|sheet|list)|vocabulary (sheet|list|mat|card)|word mat|fact sheet|glossary|formulae sheet|formula sheet|command words list|revision (page|map|notes)|quotation bank|key facts|timeline card|periodic table/i.test(t)) return /periodic table/i.test(t) ? "printable graph/grid" : "knowledge organiser";
  if (/frame\b|frames\b|planner|planning (sheet|grid)|scaffold|sentence starters|writing template|story map|story mountain|paragraph plan|answer plan|essay plan/i.test(t)) return "writing frame";
  if (/exam[- ]style|question set|practice set|revision set|retrieval (set|quiz|grid)|homework set|repair list|exam questions|question sheet|practice questions|\bset\b \(\d+ questions\)|mark points/i.test(t)) return "revision set";
  if (/\bgrid\b|graph paper|graph template|squared paper|dot (grid|paper)|isometric|number line|100 square|hundred square|place value chart|fraction (wall|strips?)|ten frame|times[- ]tables? (grid|square|chart)|multiplication (grid|square)|coordinate|axes|\bmap\b|maps\b|clock face|protractor sheet|bar model|part-whole|number cards|price cards|place value cards|digit cards|hundreds chart|tally chart|bar chart template|pictogram template|graph sheet|template/i.test(t)) return "printable graph/grid";
  if (/practical|experiment|investigation|fieldwork|risk assessment|method (sheet|card)|results (table|sheet)|record (sheet|card)|recording sheet|observation (sheet|log)|test record|plan(ning)? the (practical|investigation)|safety card|step[- ]by[- ]step guide|written guide|how-to guide/i.test(t)) return "practical guide";
  if (/model (text|answer|paragraph|report|essay|letter|story|poem|response)|teacher's (short |model )?(story|script|text|report|poem|letter|article|extract|account|description)|\btext [a-z1-9]\b|\bextract\b|\barticle\b|memoir|case study|source (pack|sheet|a\b)|sources? [a-e]\b|\bcase\b|reading text|passage|summary texts|dialogue|transcript|story\b|poem\b/i.test(t)) return "model text";
  return "worksheet";
}

/**
 * Classify one resource line. Returns { type, source }.
 * `where` is "resources" or "homework" (homework lines that name a sheet or set to complete).
 */
export function classify(text) {
  const t = clean(text);
  // Portal features that already exist (revision log, secure test mode, response box, portal lessons).
  if (/^portal (revision log|secure test|response box|lesson|year \d+ lesson|half-term quiz \(secure|unit quiz \(secure)|revision log|secure test mode|^portal lessons?\b|^independent study: portal/i.test(t)) return { type: "external tool", source: "external" };
  // Pupils' own kit (even when it mentions a frame, chart or paper): egg-box ten frames, maths kits, counters.
  if (/\(household\)|^glue|scissors|a sheet of card|^maths kit|egg[- ]box|^counters|^place value counters|^lego|^dice|^real coins|^paper strip|^strip of paper|^paper plates|^a4 paper|^paper fraction strips \(cut|^paper to fold|^mini-?whiteboard|^exercise book|^calculator|^scientific calculator/i.test(t)) return { type: "equipment", source: "household" };
  // Named in the school's own schemes of work (English KS3/KS4 SOW: booklets, organisers, weekly quizzes).
  if (/grammar booklet|vocabulary booklet|knowledge organiser( and quotation banks?)? \(year \d|knowledge organisers and quotation banks \(year|weekly retrieval quiz|weekly progress check|baseline retrieval quiz|\(senco\)/i.test(t)) return { type: "school file", source: "school" };
  if (has.builderGeneric(t) && !/:\s*\S/.test(t.replace(/^printable worksheet \(or drawing tablet\):/i, ""))) return { type: /slides|teams whiteboard|on screen/i.test(t) ? "slides" : "worksheet", source: "builder" };
  if (/\bon (the )?slides?\b/i.test(t)) return { type: /model|teacher's|text|story|script|report|advert|letter/i.test(t) ? "model text" : "slides", source: "builder" };
  if (/^printable worksheet \(or drawing tablet\): year \d+ .* lesson \d+/i.test(t)) return { type: "worksheet", source: "builder" };
  // Things TGA must make (named as a portal printable, written for the lesson, or a pupil PDF item the builder does not make).
  if (has.makeHint(t) && !/secure test mode|revision log|response box(?! template)|portal (lesson|year)|portal's lesson|independent study: portal lessons|portal lessons? y?\d/i.test(t)) return { type: makeType(t), source: "generated" };
  if (has.school(t)) return { type: /knowledge organiser|display/i.test(t) ? "school file" : /workbook/i.test(t) ? "school file" : "school file", source: "school" };
  if (has.spec(t)) return { type: "textbook", source: "external" };
  if (has.textbook(t)) return { type: "textbook", source: "external" };
  // Printables named without "portal": grids, number lines, frames, organisers, cards, templates.
  if (/number line|place value chart|fraction wall|times[- ]tables? grid|100 square|hundred square|squared paper|graph paper|dot grid|isometric|ten frame|number cards|price cards|blank map|\bframe\b|template|knowledge organiser|flashcards|flash cards|sort cards|sorting cards|word cards|picture cards|\bcards\b|worksheet|\bsheet\b|chart\b(?! paper)|word mat|checklist|\bguide\b|organiser|tracker|log\b|record\b|planner|booklet|formulae sheet|command words|key words card|glossary/i.test(t) && !/mini-?whiteboard|exercise book/i.test(t))
    return { type: makeType(t), source: "generated" };
  if (has.external(t)) return { type: "external tool", source: "external" };
  if (has.household(t)) return { type: "equipment", source: "household" };
  return { type: "equipment", source: "household" };
}

/** Homework lines that name something to hand out (a sheet, a set on the portal, a quiz). */
export function homeworkResource(hw) {
  const t = clean(hw);
  if (!t) return null;
  const m =
    /(portal'?s? [^.;]*?\b(?:set|sheet|quiz|worksheet|question set|practice set|homework set|template)\b(?: \(\d+ questions?\))?)/i.exec(t) ||
    /([^.;]*?\b(?:question|practice|homework|exam question|revision) set\b(?: on the portal)?(?: \(\d+ questions?\))?)/i.exec(t) ||
    /(teacher's sheet|portal version|portal sheet|worksheet \d[\w.]*|retrieval quiz|knowledge organiser)/i.exec(t);
  if (!m) return null;
  if (/revision log|response box|portal lessons? y?\d|secure test/i.test(m[1])) return null;
  return t;
}

/**
 * Register key: one entry per distinct resource. Some titles are generic ("Knowledge organiser
 * (pupil PDF)", "Own 4GE1-style exam questions") and mean a different resource in each unit or
 * lesson: those are split by unit or lesson.
 */
export function scopeOf(type, source, text, uses) {
  if (source !== "generated") return "year";
  if (/this lesson|this lesson's|today's|this topic/i.test(text)) return "lesson";
  if (uses.length <= 1) return "year";
  const units = new Set(uses.map((u) => u.unit));
  if (["knowledge organiser", "quiz", "test paper"].includes(type)) return units.size > 1 ? "unit" : "year";
  if (["revision set", "worksheet", "model text"].includes(type) && isGeneric(text)) return "lesson";
  return "year";
}
/** A title that names no topic of its own (so it means a different resource in each lesson). */
export const isGeneric = (t) =>
  /^(own [^ ]+-style exam questions|exam-style questions|[0-9a-z]+ exam-style questions|pupil pdf worksheet|worksheet|portal worksheet|question sheet|practice questions|revision exam-style question set|homework sheet|teacher's sheet|knowledge organiser|unit quiz|retrieval quiz|model answer|model paragraph)\b/i.test(clean(t));

export const normTitle = (t) =>
  clean(t)
    .replace(/\s*\((?:portal printable|portal worksheet|pupil pdf|portal|printable|printable or for a drawing tablet|or drawing tablet)\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
export const itemPath = (subject, year, id) => path.join(ITEMS_DIR, subject, year, `${id}.json`);
