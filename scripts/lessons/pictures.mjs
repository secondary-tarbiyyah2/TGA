// Pictures for lesson slides, from Wikimedia Commons (lessons v3).
//
//   node scripts/lessons/pictures.mjs resolve        find a picture for every lesson's `pictures[].find`
//                                                   (or the `file` staff chose) and download it
//   node scripts/lessons/pictures.mjs merge <file>   add another copy of the cache's entries (used when
//                                                   the workflow's push races another commit)
//   node scripts/lessons/pictures.mjs test           offline checks of the filters (no network)
//
// The choice for each search is kept in content/lesson-pictures.json (committed), so builds are
// repeatable and a picture never changes by itself; staff can pin a picture by putting its Commons
// file name in the lesson's `file`. Only these licences are used: CC0, public domain, CC BY,
// CC BY-SA (bitmaps or SVG). A picture is skipped, never guessed, when it might show people or
// faces (Commons categories, the file name, or structured data "depicts" a human), drawn living
// beings (paintings, statues, cartoons), or anything unsuitable for a Muslim school. If Commons
// cannot be reached the slides are simply built without pictures: this never fails the build.
//
// The downloaded images go in .cache/lesson-pictures (not committed; PICTURES_DIR to change it).
// build-decks.mjs reads both with picturesFor().
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = new URL("../../", import.meta.url).pathname;
export const CACHE_FILE = process.env.PICTURES_JSON ? path.resolve(process.env.PICTURES_JSON) : path.join(ROOT, "content/lesson-pictures.json");
export const PICTURES_DIR = process.env.PICTURES_DIR ? path.resolve(process.env.PICTURES_DIR) : path.join(ROOT, ".cache/lesson-pictures");
const LESSONS = process.env.LESSONS_DIR ? path.resolve(process.env.LESSONS_DIR) : path.join(ROOT, "content/lessons");
const API = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks every client to say who it is and how to reach them.
const UA = "TarbiyyahGlobalAcademyLessonBuilder/1.0 (https://globalacademy.tarbiyyah.co.uk; lesson slides for an online school) node";
const RECHECK_DAYS = 60; // a search that found nothing safe is tried again after this long
const THUMB_W = 1200;

// ── Filters ──────────────────────────────────────────────────────────────────
/** Words in a category or file name that mean the picture may show people or faces. */
const PEOPLE = /\b(people|persons?|humans?|portraits?|men|women|man|woman|children|child|kids?|boys?|girls?|faces?|facial|selfies?|crowds?|babies|baby|teenagers?|students|pupils|players|footballers|athletes|soldiers|workers|actors?|actresses|politicians|celebrities|families with|couples?|weddings?|brides?|nude|nudity|naked|smiling|headshots?|self-portraits?)\b/i;
/** Drawn or carved living beings (paintings, statues…): not used. Plant and anatomy diagrams are fine. */
const DRAWN = /\b(paintings?|painted|cartoons?|caricatures?|comics?|sculptures?|statues?|statuettes?|figurines?|dolls?|mannequins?|busts?|icons? \(religious\)|religious icons?|frescos?|frescoes|mosaics of (people|animals)|anime|manga|emoji)\b|\b(animals?|birds?|people|humans?|zoolog\w*|fish|insects?|horses?|lions?|cats?|dogs?) (in )?(art|drawings?|illustrations?|paintings?|clip ?art)\b|\b(drawings?|illustrations?|paintings?|art|clip ?art) of (animals?|birds?|people|humans?|men|women|children)\b/i;
/** Not suitable for the school. */
const UNSUITABLE = /\b(alcohol\w*|wines?|winery|beers?|brewery|pork|bacon|pigs? meat|crucifix\w*|idols?|swimwear|bikinis?|lingerie|erotic\w*|sexual\w*|tattoos?|gambling|casinos?|nightclubs?|weapons? of|gore|corpses?|dead bodies)\b/i;
/** Structured-data "depicts" (P180) values that mean a person: human, woman, man, child, girl, boy, people, group of humans, portrait. */
const PERSON_QIDS = new Set(["Q5", "Q467", "Q8441", "Q7569", "Q3031", "Q3010", "Q2472587", "Q16334295", "Q134307", "Q1028181"]);
const MIMES = new Set(["image/jpeg", "image/png", "image/svg+xml", "image/webp", "image/tiff"]);

/** "CC BY-SA 4.0" | "CC BY 2.0" | "CC0" | "Public domain", or null for any other licence (NC, ND, GFDL only, fair use…). */
export function normaliseLicence(short) {
  const s = String(short || "").replace(/<[^>]+>/g, "").trim();
  if (!s || /\b(nc|nd|non-?commercial|no ?deriv|fair use)\b/i.test(s)) return null;
  if (/^cc0\b|^cc[- ]zero/i.test(s)) return "CC0";
  if (/public domain|^pd\b|^pd-/i.test(s)) return "Public domain";
  let m = s.match(/^cc[- ]by[- ]sa(?:[- ]([\d.]+))?/i);
  if (m) return `CC BY-SA${m[1] ? ` ${m[1]}` : ""}`;
  m = s.match(/^cc[- ]by(?:[- ]([\d.]+))?(?:\s|$)/i);
  if (m) return `CC BY${m[1] ? ` ${m[1]}` : ""}`;
  return null;
}

const strip = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Why a Commons file may not be used (a short reason), or null when it is safe.
 * `page`: a page from the API (title, categories, imageinfo); `depicts`: its P180 ids or null when unknown.
 */
export function rejectReason(page, depicts) {
  const info = page.imageinfo && page.imageinfo[0];
  if (!info) return "no image information";
  if (!MIMES.has(info.mime)) return `not a photo or diagram (${info.mime})`;
  if (info.mime !== "image/svg+xml" && Math.min(info.width || 0, info.height || 0) < 350) return "too small";
  const licence = normaliseLicence(info.extmetadata?.LicenseShortName?.value);
  if (!licence) return `licence not allowed (${strip(info.extmetadata?.LicenseShortName?.value) || "unknown"})`;
  const cats = (page.categories || []).map((c) => String(c.title || c).replace(/^Category:/, ""));
  if (!cats.length) return "no categories, so it cannot be checked";
  const text = [page.title, ...cats, strip(info.extmetadata?.ImageDescription?.value).slice(0, 400)].join(" | ");
  if (PEOPLE.test(text)) return `may show people (${(text.match(PEOPLE) || [])[0]})`;
  if (DRAWN.test(text)) return `drawn or carved figure (${(text.match(DRAWN) || [])[0]})`;
  if (UNSUITABLE.test(text)) return `unsuitable (${(text.match(UNSUITABLE) || [])[0]})`;
  if (depicts == null) return "structured data could not be checked";
  if (depicts.some((q) => PERSON_QIDS.has(q))) return "depicts a person";
  return null;
}

/** The cache entry for an accepted page. */
function entryFor(find, page) {
  const info = page.imageinfo[0];
  const md = info.extmetadata || {};
  let credit = strip(md.Artist?.value) || strip(md.Credit?.value) || "Unknown author";
  if (credit.length > 70) credit = `${credit.slice(0, 67).trim()}…`;
  return {
    find,
    file: page.title,
    credit,
    licence: normaliseLicence(md.LicenseShortName?.value),
    licenceUrl: md.LicenseUrl?.value || null,
    page: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    thumb: info.thumburl || info.url,
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
    checked: new Date().toISOString().slice(0, 10),
  };
}

// ── Cache ────────────────────────────────────────────────────────────────────
export const keyOf = (p) => (p.file ? `file:${String(p.file).trim().replace(/^file:/i, "File:")}` : String(p.find || "").toLowerCase().replace(/\s+/g, " ").trim());

export function readCache(file = CACHE_FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return j && j.pictures ? j : { pictures: {} };
  } catch {
    return { pictures: {} };
  }
}

function writeCache(cache, file = CACHE_FILE) {
  const sorted = Object.fromEntries(Object.entries(cache.pictures).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    note: "Pictures for lesson slides chosen from Wikimedia Commons by scripts/lessons/pictures.mjs (see content/lessons/README.md). Keyed by the lesson's search phrase (or file:<name> when staff chose the file). To change a picture, put the Commons file name in the lesson's pictures[].file, or delete the entry here to search again.",
    pictures: sorted,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
}

/** Where a cached picture's image is saved locally. */
export const localPath = (entry) => path.join(PICTURES_DIR, `${crypto.createHash("sha1").update(entry.file).digest("hex").slice(0, 16)}${/\.jpe?g($|\?)/i.test(entry.thumb || "") ? ".jpg" : ".png"}`);

/**
 * The pictures of a lesson that are ready to place: [{ for, alt, path, w, h, credit, licence, file }].
 * A picture whose search found nothing safe, or whose image was not downloaded, is left out.
 */
export function picturesFor(lesson, cache) {
  const out = [];
  for (const p of Array.isArray(lesson.pictures) ? lesson.pictures : []) {
    const e = cache.pictures[keyOf(p)];
    if (!e || e.none || !e.file) continue;
    const local = localPath(e);
    if (!fs.existsSync(local)) continue;
    out.push({ for: String(p.for || ""), alt: String(p.alt || ""), find: p.find, path: local, w: e.width || 4, h: e.height || 3, credit: p.credit || e.credit, licence: p.licence || e.licence, file: e.file });
  }
  return out;
}

// ── Commons ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const offline = () => failures >= 4; // Commons looks unreachable: stop trying for this run

async function get(params, attempt = 0) {
  if (offline()) throw new Error("Commons unreachable");
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status >= 500 || res.headers.get("retry-after")) {
      if (attempt < 3) {
        await sleep(2000 * (attempt + 1));
        return get(params, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const j = JSON.parse(text); // a rate-limit page is not JSON: counts as a failure
    if (j.error) throw new Error(j.error.info || j.error.code);
    failures = 0;
    await sleep(300); // be gentle
    return j;
  } catch (e) {
    failures++;
    throw e;
  }
}

const PAGE_PROPS = {
  prop: "imageinfo|categories",
  iiprop: "url|extmetadata|mime|size",
  iiurlwidth: String(THUMB_W),
  iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription",
  cllimit: "max",
  clshow: "!hidden",
};

/** P180 (depicts) ids for each page id; null for a page whose structured data could not be read. */
async function depictsOf(pageids) {
  const out = new Map();
  if (!pageids.length) return out;
  const j = await get({ action: "wbgetentities", ids: pageids.map((id) => `M${id}`).join("|"), props: "claims" });
  for (const id of pageids) {
    const ent = j.entities && j.entities[`M${id}`];
    if (!ent || ent.missing != null) {
      out.set(id, []); // no structured data at all: nothing says it depicts a person
      continue;
    }
    const claims = (ent.statements || ent.claims || {}).P180 || [];
    out.set(id, claims.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean));
  }
  return out;
}

/** Pick the best safe file for a picture, or { none, reason }. Throws when Commons cannot be reached. */
export async function findPicture(p) {
  const params = p.file
    ? { action: "query", titles: String(p.file).replace(/^file:/i, "File:"), ...PAGE_PROPS }
    : { action: "query", generator: "search", gsrsearch: String(p.find), gsrnamespace: "6", gsrlimit: "15", ...PAGE_PROPS };
  const j = await get(params);
  const pages = (j.query?.pages || []).filter((x) => !x.missing).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (!pages.length) return { none: true, reason: p.file ? "file not found on Commons" : "no results" };
  const depicts = await depictsOf(pages.map((x) => x.pageid).filter(Boolean));
  const reasons = [];
  for (const page of pages) {
    const why = rejectReason(page, depicts.has(page.pageid) ? depicts.get(page.pageid) : null);
    if (!why) return entryFor(p.find || page.title, page);
    reasons.push(`${page.title}: ${why}`);
  }
  return { none: true, reason: reasons.slice(0, 3).join("; ") };
}

async function download(entry) {
  const dest = localPath(entry);
  if (fs.existsSync(dest)) return true;
  if (offline()) return false;
  try {
    const res = await fetch(entry.thumb, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) throw new Error("empty image");
    fs.mkdirSync(PICTURES_DIR, { recursive: true });
    fs.writeFileSync(dest, buf);
    failures = 0;
    await sleep(200);
    return true;
  } catch (e) {
    failures++;
    console.log(`::warning::Could not download ${entry.file}: ${e.message}`);
    return false;
  }
}

function walk(d) {
  return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") && !e.name.startsWith("_") ? [path.join(d, e.name)] : [])) : [];
}

async function resolveAll() {
  const cache = readCache();
  const wanted = new Map();
  for (const f of walk(LESSONS)) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    for (const l of j.lessons || []) for (const p of Array.isArray(l.pictures) ? l.pictures : []) if (p && (p.find || p.file)) wanted.set(keyOf(p), p);
  }
  const old = (d) => !d || Date.now() - Date.parse(d) > RECHECK_DAYS * 864e5;
  let found = 0;
  let none = 0;
  let downloaded = 0;
  let skipped = 0;
  for (const [key, p] of wanted) {
    let e = cache.pictures[key];
    if (!e || (e.none && old(e.checked))) {
      if (offline()) {
        skipped++;
        continue;
      }
      try {
        e = await findPicture(p);
        if (e.none) e = { find: p.find || p.file, none: true, reason: e.reason, checked: new Date().toISOString().slice(0, 10) };
        cache.pictures[key] = e;
        e.none ? none++ : found++;
        if (e.none) console.log(`No safe picture for "${p.find || p.file}": ${e.reason}`);
      } catch (err) {
        skipped++;
        console.log(`::warning::Commons search failed for "${p.find || p.file}" (${err.message}); the slides are built without it this time.`);
        continue;
      }
    }
    if (e && !e.none && (await download(e))) downloaded++;
  }
  writeCache(cache);
  console.log(`Pictures: ${wanted.size} wanted, ${found} newly found, ${none} with no safe picture, ${downloaded} ready, ${skipped} not checked (Commons unreachable or busy)`);
}

function mergeFrom(other) {
  const a = readCache();
  const b = readCache(other);
  for (const [k, v] of Object.entries(b.pictures)) if (!a.pictures[k] || (a.pictures[k].none && !v.none)) a.pictures[k] = v;
  writeCache(a);
}

function selfTest() {
  let bad = 0;
  const ok = (c, m) => {
    console.log(`${c ? "ok  " : "FAIL"} ${m}`);
    if (!c) bad++;
  };
  const page = (title, cats, licence = "CC BY-SA 4.0", mime = "image/jpeg", desc = "") => ({ title, categories: cats.map((c) => ({ title: `Category:${c}` })), imageinfo: [{ mime, width: 2000, height: 1500, extmetadata: { LicenseShortName: { value: licence }, ImageDescription: { value: desc } } }] });
  ok(rejectReason(page("File:Olive oil bottle.jpg", ["Olive oil", "Bottles"]), []) === null, "a plain object photo is accepted");
  ok(/people/.test(rejectReason(page("File:Market.jpg", ["People in markets"]), [])), "a 'people' category is refused");
  ok(/people/.test(rejectReason(page("File:Portrait of a man.jpg", ["Hats"]), [])), "a portrait in the file name is refused");
  ok(/people/.test(rejectReason(page("File:Elements.jpg", ["Women of Syria"]), [])), "'women' is refused");
  ok(rejectReason(page("File:Elements table.png", ["Chemical elements", "Monuments"]), []) === null, "'elements' and 'monuments' do not match 'men'");
  ok(rejectReason(page("File:Rosa.jpg", ["Family Rosaceae"]), []) === null, "a plant family is fine");
  ok(rejectReason(page("File:X.jpg", ["Bread"]), ["Q5"]) === "depicts a person", "structured data 'depicts human' is refused");
  ok(/structured/.test(rejectReason(page("File:X.jpg", ["Bread"]), null)), "unknown structured data is refused (when unsure, skip)");
  ok(/licence/.test(rejectReason(page("File:X.jpg", ["Bread"], "CC BY-NC 2.0"), [])), "NC licences are refused");
  ok(/licence/.test(rejectReason(page("File:X.jpg", ["Bread"], "GFDL"), [])), "GFDL-only is refused");
  ok(rejectReason(page("File:X.svg", ["Leaf anatomy diagrams"], "Public domain", "image/svg+xml"), []) === null, "a public-domain SVG diagram is accepted");
  ok(/drawn/.test(rejectReason(page("File:Lion.jpg", ["Paintings of lions"]), [])), "a painting is refused");
  ok(/unsuitable/.test(rejectReason(page("File:Glass.jpg", ["Red wine"]), [])), "wine is refused");
  ok(/categories/.test(rejectReason(page("File:X.jpg", []), [])), "no categories: skipped");
  ok(normaliseLicence("CC BY-SA 3.0") === "CC BY-SA 3.0" && normaliseLicence("CC0") === "CC0" && normaliseLicence("Public domain") === "Public domain" && normaliseLicence("CC BY 2.0") === "CC BY 2.0", "licences are normalised");
  ok(keyOf({ find: "  Olive  Oil " }) === "olive oil" && keyOf({ find: "x", file: "File:A.jpg" }) === "file:File:A.jpg", "cache keys");
  console.log(bad ? `${bad} check(s) failed` : "All checks passed");
  process.exit(bad ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "resolve") await resolveAll();
  else if (cmd === "merge" && arg) mergeFrom(arg);
  else if (cmd === "test") selfTest();
  else {
    console.error("Usage: node scripts/lessons/pictures.mjs resolve | merge <file> | test");
    process.exit(1);
  }
}
