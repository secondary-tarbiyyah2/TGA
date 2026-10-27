// Loads Unit revision packs into Supabase (tables revision_units + revision_questions,
// storage bucket revision-media). Migration 0094 defines the tables.
//
//   node scripts/lessons/sync-revision.mjs check   -> builds the packs and prints a summary (no network)
//   node scripts/lessons/sync-revision.mjs sync    -> loads them (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//
// Where packs come from:
//   * content/lessons/<subject>/<year>.json, every unit whose lessons hold at least
//     MIN_QUIZ hinge questions (`check` blocks) gets a pack. The pupil's summary is the
//     unit's own lesson slides. Each lesson's key words also become practice questions.
//   * content/revision/*.json, packs with their own summary slides, questions and
//     (optionally) a video, e.g. Aqeedah 1.
//
// Only questions this script loaded (source = 'content') are ever updated or retired;
// anything staff add in the portal is left alone. A unit staff have unpublished stays
// unpublished.
import fs from "node:fs";
import path from "node:path";
import { retiredChecker } from "./retired.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const LESSONS = path.join(ROOT, "content/lessons");
const REVISION = path.join(ROOT, "content/revision");
const MIN_QUIZ = 4;
const MEDIA_BUCKET = "revision-media";

function seeded(str) {
  let h = 2166136261;
  for (const c of String(str)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle, so re-running the sync never reorders a question's options. */
function shuffle(arr, seed) {
  const r = seeded(seed);
  const b = arr.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** "Which is the correct meaning of …?" questions from a set of key words. */
function keywordQuestions(prefix, topic, lessonNo, words, pool) {
  const out = [];
  words.forEach((k, i) => {
    const others = [...new Map(pool.filter((p) => p.t !== k.t && p.d !== k.d).map((p) => [p.d, p])).values()];
    if (others.length < 3) return;
    const options = shuffle([k.d, ...shuffle(others, `${prefix}${i}${k.t}`).slice(0, 3).map((p) => p.d)], k.t);
    out.push({
      qkey: `${prefix}-k${i + 1}`,
      lesson_no: lessonNo,
      topic,
      question: `Which is the correct meaning of “${k.t}”?`,
      options,
      answer: options.indexOf(k.d),
      explanation: `${k.t}: ${k.d}.`,
      hint: `Look back at the key words for “${topic}”.`,
      wrong: {},
      in_quiz: false,
    });
  });
  return out;
}

function lessonPacks() {
  const isRetired = retiredChecker();
  const packs = [];
  if (!fs.existsSync(LESSONS)) return packs;
  for (const subjectSlug of fs.readdirSync(LESSONS).sort()) {
    const dir = path.join(LESSONS, subjectSlug);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const year = file.replace(/\.json$/, "");
      const units = new Map();
      (j.lessons || []).forEach((l, idx) => {
        const n = l.n || idx + 1;
        if (isRetired(subjectSlug, year, n)) return; // content/retired-lessons.json
        const unit = l.unit || "Lessons";
        if (!units.has(unit)) units.set(unit, []);
        units.get(unit).push({ ...l, n });
      });
      for (const [unit, ls] of units) {
        const pool = ls.flatMap((l) => (l.keywords || []).map((k) => ({ t: k.term, d: k.def })));
        const questions = [];
        for (const l of ls) {
          const mis = (l.teach || []).map((t) => t.misconception).filter(Boolean);
          const hint = mis[0]?.right || (l.keywords?.[0] ? `${l.keywords[0].term}: ${l.keywords[0].def}` : null);
          (l.teach || [])
            .map((t) => t.check)
            .filter((c) => c && Array.isArray(c.options) && Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.options.length)
            .forEach((c, i) =>
              questions.push({
                qkey: `L${l.n}-c${i + 1}`,
                lesson_no: l.n,
                topic: l.title,
                question: c.q,
                options: c.options,
                answer: c.answer,
                explanation: c.why || null,
                hint,
                wrong: {},
                in_quiz: true,
              }),
            );
          // Common mistakes become true/false checks: pupils judge the wrong statement, then see the right one.
          mis.forEach((m, i) => {
            if (!m || !m.wrong || !m.right) return;
            questions.push({
              qkey: `L${l.n}-m${i + 1}`,
              lesson_no: l.n,
              topic: l.title,
              question: `Is this statement correct? “${String(m.wrong).trim()}”`,
              options: ["Correct", "Not correct"],
              answer: 1,
              explanation: `Not correct. ${String(m.right).trim()}`,
              hint,
              wrong: {},
              in_quiz: true,
            });
          });
          questions.push(...keywordQuestions(`L${l.n}`, l.title, l.n, (l.keywords || []).map((k) => ({ t: k.term, d: k.def })), pool));
        }
        // Units with few hinge questions still get a pack: key-word questions fill the quiz up to the minimum.
        const quizCount = () => questions.filter((q) => q.in_quiz).length;
        for (const q of questions) {
          if (quizCount() >= MIN_QUIZ + 2) break;
          if (!q.in_quiz) q.in_quiz = true;
        }
        if (quizCount() < MIN_QUIZ) continue;
        packs.push({
          subject_slug: subjectSlug,
          subject: j.subject,
          year,
          unit,
          title: unit,
          kind: "lessons",
          summary: [],
          sort_order: Math.min(...ls.map((l) => l.n)),
          questions,
          video: null,
        });
      }
    }
  }
  return packs;
}

function summaryPacks() {
  const packs = [];
  if (!fs.existsSync(REVISION)) return packs;
  for (const file of fs.readdirSync(REVISION).filter((f) => f.endsWith(".json")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(REVISION, file), "utf8"));
    const slides = j.summary || [];
    const pool = slides.flatMap((s) => s.keywords || []);
    const questions = (j.questions || []).map((q, i) => {
      const qkey = `Q${i + 1}`;
      const order = shuffle(q.options.map((_, k) => k), `${qkey}${q.question}`);
      const wrong = {};
      Object.entries(q.wrong || {}).forEach(([k, v]) => (wrong[String(order.indexOf(Number(k)))] = v));
      const slide = slides.find((s) => s.title === q.topic);
      return {
        qkey,
        lesson_no: slide ? slides.indexOf(slide) + 1 : null,
        topic: q.topic,
        question: q.question,
        options: order.map((k) => q.options[k]),
        answer: order.indexOf(q.answer),
        explanation: q.explanation || null,
        hint: q.hint || slide?.hint || null,
        wrong,
        in_quiz: true,
      };
    });
    slides.forEach((s, i) => questions.push(...keywordQuestions(`S${i + 1}`, s.title, i + 1, s.keywords || [], pool)));
    packs.push({
      subject_slug: j.subject_slug,
      subject: j.subject,
      year: j.year,
      unit: j.unit,
      title: j.title || j.unit,
      kind: "summary",
      // A slide's own chapter video ("video": path under this folder) is uploaded by
      // sync() and stored on the slide as video_path.
      // `hint` is deliberately dropped from the stored summary (it is for the practice coach only).
      summary: slides.map(({ keywords, video, ...s }) => ({ ...s, hint: undefined, keywords: (keywords || []).map((k) => k.t), ...(video ? { video: path.join(REVISION, video) } : {}) })),
      sort_order: j.sort_order ?? 0,
      questions,
      video: j.video ? path.join(REVISION, j.video) : null,
    });
  }
  return packs;
}

export function buildPacks() {
  const packs = [...summaryPacks(), ...lessonPacks()];
  for (const p of packs) {
    const seen = new Set();
    for (const q of p.questions) {
      if (seen.has(q.qkey)) throw new Error(`${p.subject_slug}/${p.year} ${p.unit}: duplicate question key ${q.qkey}`);
      seen.add(q.qkey);
      if (!q.question || q.question.length < 3 || q.question.length > 600) throw new Error(`${p.unit} ${q.qkey}: question length`);
      if (q.options.length < 2 || q.options.length > 6) throw new Error(`${p.unit} ${q.qkey}: needs 2-6 options`);
      if (q.answer < 0 || q.answer >= q.options.length) throw new Error(`${p.unit} ${q.qkey}: answer out of range`);
    }
    if (p.video && !fs.existsSync(p.video)) throw new Error(`${p.unit}: video file missing (${p.video})`);
    for (const s of p.summary || []) if (s.video && !fs.existsSync(s.video)) throw new Error(`${p.unit}, ${s.title}: chapter video missing (${s.video})`);
  }
  return packs;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function sync(packs) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let units = 0;
  let qs = 0;
  let retired = 0;
  for (const p of packs) {
    // A pack a teacher made in the portal for this unit wins; never overwrite it.
    const { data: own } = await supabase.from("revision_units").select("source").eq("subject_slug", p.subject_slug).eq("year", p.year).eq("unit", p.unit).maybeSingle();
    if (own?.source === "staff") {
      console.log(`Skipping ${p.unit} (${p.year}): a teacher made this pack in the portal.`);
      continue;
    }
    let videoPath = null;
    if (p.video) {
      videoPath = `${p.subject_slug}/${p.year}/${slug(p.unit)}/${path.basename(p.video)}`;
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(videoPath, fs.readFileSync(p.video), { contentType: "video/mp4", upsert: false });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(`Video upload for ${p.unit}: ${up.error.message}`);
    }
    // Chapter videos: one per summary slide, uploaded next to the unit video.
    const summary = [];
    for (const s of p.summary || []) {
      if (!s.video) {
        summary.push(s);
        continue;
      }
      const { video, ...rest } = s;
      const chapterPath = `${p.subject_slug}/${p.year}/${slug(p.unit)}/${path.basename(video)}`;
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(chapterPath, fs.readFileSync(video), { contentType: "video/mp4", upsert: false });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(`Chapter video for ${p.unit}: ${up.error.message}`);
      summary.push({ ...rest, video_path: chapterPath });
    }
    const row = {
      subject_slug: p.subject_slug,
      subject: p.subject,
      year: p.year,
      unit: p.unit,
      title: p.title,
      kind: p.kind,
      summary,
      sort_order: p.sort_order,
      updated_at: new Date().toISOString(),
      ...(videoPath ? { video_path: videoPath } : {}),
    };
    const { data: u, error } = await supabase.from("revision_units").upsert(row, { onConflict: "subject_slug,year,unit" }).select("id").single();
    if (error) throw new Error(`Unit ${p.unit}: ${error.message}`);
    units++;

    const rows = p.questions.map((q) => ({ ...q, unit_id: u.id, source: "content", active: true, updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error: e2 } = await supabase.from("revision_questions").upsert(rows.slice(i, i + 200), { onConflict: "unit_id,qkey" });
      if (e2) throw new Error(`Questions for ${p.unit}: ${e2.message}`);
    }
    qs += rows.length;

    const { data: existing, error: e3 } = await supabase.from("revision_questions").select("id, qkey").eq("unit_id", u.id).eq("source", "content").eq("active", true);
    if (e3) throw new Error(`Questions for ${p.unit}: ${e3.message}`);
    const keep = new Set(rows.map((r) => r.qkey));
    const gone = (existing || []).filter((r) => !keep.has(r.qkey)).map((r) => r.id);
    if (gone.length) {
      const { error: e4 } = await supabase.from("revision_questions").update({ active: false }).in("id", gone);
      if (e4) throw new Error(`Retiring questions for ${p.unit}: ${e4.message}`);
      retired += gone.length;
    }
  }
  // Units built from content that content no longer produces (their lessons were retired in
  // content/retired-lessons.json, or the unit was renamed): switch off the questions this script
  // loaded, and unpublish the unit unless staff have added questions of their own to it.
  let unpublished = 0;
  const live = new Set(packs.map((p) => `${p.subject_slug}/${p.year}/${p.unit}`));
  const { data: contentUnits, error: e5 } = await supabase.from("revision_units").select("id, subject_slug, year, unit, published").eq("source", "content");
  if (e5) throw new Error(`Listing revision units: ${e5.message}`);
  for (const u of contentUnits || []) {
    if (live.has(`${u.subject_slug}/${u.year}/${u.unit}`)) continue;
    const { data: off, error: e6 } = await supabase.from("revision_questions").update({ active: false }).eq("unit_id", u.id).eq("source", "content").eq("active", true).select("id");
    if (e6) throw new Error(`Retiring questions for ${u.unit}: ${e6.message}`);
    retired += (off || []).length;
    if (!u.published) continue;
    const { count } = await supabase.from("revision_questions").select("id", { count: "exact", head: true }).eq("unit_id", u.id).eq("active", true);
    if (count) continue;
    const { error: e7 } = await supabase.from("revision_units").update({ published: false, updated_at: new Date().toISOString() }).eq("id", u.id);
    if (e7) throw new Error(`Unpublishing ${u.unit}: ${e7.message}`);
    unpublished++;
  }
  console.log(`Synced ${units} revision units, ${qs} questions${retired ? `, retired ${retired}` : ""}${unpublished ? `, unpublished ${unpublished} unit(s) no longer in content` : ""}.`);
}

const mode = process.argv[2] || "check";
const packs = buildPacks();
const quiz = packs.reduce((n, p) => n + p.questions.filter((q) => q.in_quiz).length, 0);
const practice = packs.reduce((n, p) => n + p.questions.filter((q) => !q.in_quiz).length, 0);
console.log(`${packs.length} revision packs · ${quiz} quiz questions · ${practice} practice-only questions`);
if (mode === "sync") {
  sync(packs).catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
} else if (mode !== "check") {
  console.error("Usage: node scripts/lessons/sync-revision.mjs check|sync");
  process.exit(1);
}
