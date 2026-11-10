// Builds branded PowerPoint decks from content/lessons/**/*.json.
//   node scripts/lessons/build-decks.mjs [outDir=out/decks] [--only=subject/year] [--limit=N]
// Output: <outDir>/<subject>/<year>/<NN>-<slug>.pptx, a teacher lesson plan
// <NN>-<slug>-plan.docx next to it, and <outDir>/manifest.json
// Requires `pptxgenjs` (devDependency). Logos come from public/brand.
//
// Each deck is designed for its age group, not one template for everyone:
//   early  (Reception–Year 3): huge text, bright friendly colours, round
//          shapes, a plain eight-pointed star motif (no face: a symbol, not
//          a character), a star collected at each stage of the "mission",
//          word cards, a movement break and a "Show me!" check.
//   junior (Years 4–6): the lesson as a mission, warm-up timer, varied
//          layouts, a brain break, bronze/silver/gold challenges.
//   senior (Years 7–11): Do now with timer, key vocabulary, think–pair–share,
//          core/extend/stretch tasks, exam board label, confidence check.
// Every deck: an optional hook slide, a lesson-journey tracker, teach slides
// that change layout so no two in a row look the same, "Think about it"
// questions lifted from the teacher's notes, timer and routine badges on task
// slides (show-me, chat waterfall, Teams poll…), "Check your answers" reveal
// slides when the lesson gives answers, and a preview of the next lesson.
// Assessment lessons (assessmentMode "test", "mock" or "quiz", or a title such as
// "End-of-year test"): an exam-conditions slide with the timer before the questions,
// the questions labelled Question 1, 2… or Section A, B… with their marks (not
// core / extend / stretch), no answer slides in the pupils' flow or PDF, and the
// answers and mark scheme after a "Teacher only" divider at the end of the deck.
//
// Lessons v3 (deck-v3.mjs): a "ponder" first slide, the online class promise on the
// title slide, the Islamic link (start or end), one objective set apart from the
// success-criteria steps, "I do" model slides, Teams poll and poll-answer slides,
// key words in each teach slide's corner and the unit's topic key words near the end,
// Wikimedia Commons pictures (pictures.mjs), and a pupil PDF deck per lesson
// (<NN>-<slug>-pupil.pptx, A4, the slides pupils need plus a worksheet).
//
// Text is sized here (fitSize) rather than relying on PowerPoint's autofit,
// which only kicks in after a teacher edits a box.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildPlan } from "./lesson-plan.mjs";
import { themeFor, makeParts } from "./deck-parts.mjs";
import { makeV3 } from "./deck-v3.mjs";
import { readCache as readPictures, picturesFor } from "./pictures.mjs";
import { BLOCKS, ISLAMIC_SUBJECTS, ROUTINES, ASSESSMENT_LABEL, assessmentLabels, assessmentModeOf, itemQ, itemA, itemMins, itemMarks, itemModel, itemOptions, hasAnswers, phaseMinutes, routineFor } from "../../src/lib/learn/lessonSchema.mjs";
import { retiredChecker } from "./retired.mjs";
import { HAS_AR, QURANIC, QURAN_FONT, ARABIC_FONT, AR_LANG, arabicFont, arabicSegments, isArabicOnly, visibleLen } from "./arabic.mjs";

// Cross-curricular hubs: lessons that teach a hub's spec unit get a "Connect it" slide (see content/syllabus/matrices/hubs.json).
const HUBS_BY_LESSON = (() => {
  const out = new Map();
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../../src/lib/learn/syllabusIndex.json"), "utf8"));
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z]/g, "");
    for (const hub of idx.hubs || []) {
      for (const node of hub.nodes) {
        const slug = Object.keys(idx.specs).find((k) => norm(idx.specs[k].subject) === norm(node.subject));
        const unit = slug && idx.specs[slug].units.find((u) => u.ref === node.ref);
        if (!unit) continue;
        for (const id of unit.lessons || []) {
          const key = `${slug}/${id}`;
          const list = out.get(key) || [];
          if (!list.some((h) => h.id === hub.id)) list.push({ id: hub.id, title: hub.title, hook: hub.hook, others: hub.nodes.filter((n) => n !== node) });
          out.set(key, list);
        }
      }
    }
  } catch {
    /* hubs are optional */
  }
  return out;
})();

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const ROOT = new URL("../../", import.meta.url).pathname;
const LESSONS = process.env.LESSONS_DIR ? path.resolve(process.env.LESSONS_DIR) : path.join(ROOT, "content/lessons"); // LESSONS_DIR: for previews
const LOGO_DARK = path.join(ROOT, "public/brand/ga-wordmark.png"); // for light backgrounds
const LOGO_WHITE = path.join(ROOT, "public/brand/ga-wordmark-white.png"); // for dark backgrounds
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(ROOT, "out/decks"));
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const limit = Number((args.find((a) => a.startsWith("--limit=")) || "").slice(8)) || Infinity;
// ONLY_LESSONS="english/y2/2,science/y8/1": build just these lessons (previews and checks).
const ONLY_LESSONS = process.env.ONLY_LESSONS ? new Set(process.env.ONLY_LESSONS.split(",").map((x) => x.trim())) : null;
// The pupil PDF (all the slides pupils need plus a worksheet) is opened from this portal page,
// which checks the pupil is signed in and in that year (src/app/learn/lesson-pdf).
const PUPIL_PDF_URL = process.env.PUPIL_PDF_URL || "https://learn.tarbiyyah.co.uk/lesson-pdf/";
const pupilUrlFor = (subject, year, n) => `${PUPIL_PDF_URL}?s=${encodeURIComponent(subject)}&y=${encodeURIComponent(year)}&n=${n}`;
// A4 landscape for the pupil PDF: each slide is scaled to fit, with a name line above it.
const A4 = { w: 11.69, h: 8.27 };
const PK = A4.w / 13.33;
const PTOP = 0.62;

// ── Brand ────────────────────────────────────────────────────────────────
const INK = "1B1E21";
const MUTED = "5B6168";
const GOLD = "B08E45";
const GOLD_DARK = "7D6428";
const GOLD_SOFT = "F5ECD6";
const CREAM = "FBF7EE";
const TEAL = "1F6F6B";
const TEAL_DARK = "0F3D3A";
const TEAL_SOFT = "E3F2F0";
const EMERALD = "0B4F45";
const LINE = "E3DED2";
const FONT = "Calibri";
const LOGO_RATIO = 393 / 120;
const W = 13.33;

// One accent colour per subject so a pupil can tell a deck at a glance.
const ACCENTS = {
  mathematics: "2F5DA8", english: "8A3B5B", "english-language": "8A3B5B", "english-literature": "8A3B5B",
  science: "2E7D4F", "gcse-science": "2E7D4F", history: "8C5A2B", geography: "3C7A8C", computing: "4C4C9A",
  arabic: "A5472B", "islamic-studies": "1F6F6B", quran: "0F5A52", art: "B4538F", pe: "B5651D", pshe: "6B5CA5", business: "2A6F97",
};
const YEAR_LABEL = (y) => (y === "reception" ? "Reception" : `Year ${y.slice(1)}`);

// Bright, friendly palette for the youngest (always with ink text on the tints).
const PLAY = [
  { solid: "F2A93B", tint: "FFF1D6" }, // sunshine
  { solid: "4FA3D9", tint: "E3F2FC" }, // sky
  { solid: "5BB36A", tint: "E5F5E7" }, // leaf
  { solid: "EE7A5B", tint: "FDE8E2" }, // coral
  { solid: "9B7BD0", tint: "EFE8FA" }, // lilac
];

// ── Age bands ──────────────────────────────────────────────────────────────
function bandFor(year) {
  if (year === "reception" || year === "y1" || year === "y2" || year === "y3") return "early";
  const n = Number(year.slice(1));
  return n <= 6 ? "junior" : "senior";
}

const BAND = {
  early: {
    stages: ["Hello", "Learn", "Together", "My turn", "Show me"],
    titleSize: 40, bodyMax: 40, bodyMin: 24, cardMax: 34,
    objectivesTitle: "Today we will…", objectivesKicker: "Our learning",
    starterTitle: "Hello, everyone!", starterKicker: "Let's warm up",
    wordsTitle: "Our special words", wordsKicker: "Say them with me",
    practiceTitle: "Let's do it together!", practiceKicker: "Together",
    independentTitle: "Your turn!", independentKicker: "My turn",
    exitTitle: "Show me!", exitKicker: "What did we learn?",
    homeworkKicker: "Home learning",
  },
  junior: {
    stages: ["Warm up", "Learn", "We do", "You do", "Check"],
    titleSize: 36, bodyMax: 32, bodyMin: 18, cardMax: 28,
    objectivesTitle: "Today's mission", objectivesKicker: "Mission goals",
    starterTitle: "Warm-up challenge", starterKicker: "Get your brain ready",
    wordsTitle: "Word bank", wordsKicker: "Words to use today",
    practiceTitle: "We do: let's try together", practiceKicker: "Guided practice",
    independentTitle: "You do: choose your challenge", independentKicker: "Challenge levels",
    exitTitle: "Exit ticket", exitKicker: "Show what you know",
    homeworkKicker: "Mission complete!",
  },
  senior: {
    stages: ["Do now", "Explain", "Guided", "Independent", "Review"],
    titleSize: 34, bodyMax: 28, bodyMin: 16, cardMax: 24,
    objectivesTitle: "Learning objectives", objectivesKicker: "This lesson",
    starterTitle: "Do now", starterKicker: "Retrieval practice",
    wordsTitle: "Key vocabulary", wordsKicker: "Use these accurately",
    practiceTitle: "Guided practice", practiceKicker: "Worked together",
    independentTitle: "Independent practice", independentKicker: "Core · Extend · Stretch",
    exitTitle: "Exit ticket", exitKicker: "Check your understanding",
    homeworkKicker: "Homework",
  },
};

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Drop a leading "1." / "2)" / "Step 3:" when the slide numbers items itself. */
const unnumber = (s) => clean(s).replace(/^(step\s*)?\d+\s*[.):-]\s+/i, "");
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";

/**
 * Largest font size (pt) at which `texts` fit in a w×h inch box, assuming
 * an average character is ~0.52em wide and lines are 1.2em tall, plus
 * `gapPt` between paragraphs. Conservative on purpose.
 */
// Arabic: vowel marks take no width, and Arabic lines are taller: LibreOffice spaces both Arabic fonts at
// about 1.27em and an Arabic box adds 1.3x (Qur'an) or 1.15x (other Arabic). Set per deck in buildDeck.
let quranText = false;
const lineEm = (t) => (!HAS_AR.test(t) ? 1.17 : quranText || QURANIC.test(t) ? 1.68 : 1.48);
// Joined Arabic letters are narrower: about 0.40em each in Scheherazade New (measured on a rendered ayah).
const charEm = (t) => (isArabicOnly(t) ? 0.42 : 0.48);
const perLine = (t, w, size) => Math.max(4, Math.floor((w * 72 - 16) / (size * charEm(t))));
function fitSize(texts, w, h, max, min, gapPt = 8) {
  const list = (Array.isArray(texts) ? texts : [texts]).map(clean).filter(Boolean);
  // The longest word must fit on one line: a word is never broken in the middle ("trie / d").
  const longest = Math.max(1, ...list.flatMap((t) => t.split(" ").map(visibleLen)));
  for (let size = max; size > min; size -= 1) {
    if (longest * size * 0.56 > w * 72 - 16) continue;
    let lines = 0;
    for (const t of list) {
      const charsPerLine = perLine(t, w, size);
      // Word-wrap estimate.
      let line = 0;
      let count = 1;
      for (const word of t.split(" ")) {
        const wl = visibleLen(word);
        const len = wl + (line ? 1 : 0);
        if (line + len > charsPerLine && line > 0) {
          count++;
          line = wl;
        } else line += len;
      }
      lines += count * lineEm(t);
    }
    const need = (lines * size + (list.length - 1) * gapPt + 10) / 72;
    if (need <= h) return size;
  }
  return min;
}

/** Height (inches) the texts need at `size` pt in a box `w` wide (the same estimate as fitSize). */
function textHeight(texts, w, size, gapPt = 8) {
  const list = (Array.isArray(texts) ? texts : [texts]).map(clean).filter(Boolean);
  let lines = 0;
  for (const t of list) {
    const charsPerLine = perLine(t, w, size);
    let line = 0;
    let count = 1;
    for (const word of t.split(" ")) {
      const wl = visibleLen(word);
      const len = wl + (line ? 1 : 0);
      if (line + len > charsPerLine && line > 0) {
        count++;
        line = wl;
      } else line += len;
    }
    lines += count * lineEm(t);
  }
  return (lines * size + (list.length - 1) * gapPt + 10) / 72;
}

/** Fonts wider than Calibri need a narrower box in fitSize's estimate. */
const FONT_WIDTH = { Georgia: 0.84, Consolas: 0.74, "Trebuchet MS": 0.88, Cambria: 0.92 };
const fw = (w, font) => w * (FONT_WIDTH[font] || 1);

/** First question in a teacher note, cleaned up for a slide ("Ask: why…?" → "Why…?"). */
function questionFrom(note) {
  const m = String(note || "").match(/[^.!?]*\?/);
  if (!m) return null;
  let q = m[0]
    .replace(/^\s*(then\s+)?(ask|discuss|say|challenge|prompt|question)(\s+(the\s+)?(pupils|children|class|students|them))?\s*[:,]?\s*/i, "")
    .replace(/^[\s'"‘“]+|[\s'"’”]+$/g, "")
    .trim();
  if (q.length < 8 || q.length > 130) return null;
  if (/^(e\.g|i\.e)/i.test(q)) return null;
  q = q[0].toUpperCase() + q.slice(1);
  if (!q.endsWith("?")) q += "?";
  return q;
}

// ── Shared building blocks ─────────────────────────────────────────────────

/** Lesson-journey tracker: five dots along the top right, current one filled. */
function tracker(slide, ctx, stage) {
  if (stage == null) return;
  const labels = BAND[ctx.band].stages;
  const x0 = 7.15;
  const step = 1.18;
  slide.addShape("line", { x: x0 + 0.12, y: 0.47, w: step * (labels.length - 1), h: 0, line: { color: LINE, width: 2 } });
  labels.forEach((label, i) => {
    const x = x0 + i * step;
    const on = i === stage;
    const done = i < stage;
    // The youngest collect a star at each stage of their mission; older pupils see dots.
    if (ctx.band === "early") slide.addShape("star5", { x: x - 0.06, y: 0.29, w: 0.36, h: 0.36, fill: { color: on ? ctx.accent : done ? "F2B33D" : "FFFFFF" }, line: { color: on ? ctx.accent : done ? "D99A22" : "C9C2B3", width: 1.25 } });
    else slide.addShape("ellipse", { x, y: 0.35, w: 0.24, h: 0.24, fill: { color: on ? ctx.accent : done ? GOLD : "FFFFFF" }, line: { color: on ? ctx.accent : done ? GOLD : "C9C2B3", width: 1.5 } });
    const target = ctx.nav?.stage?.[i];
    const runs = target ? [{ text: label, options: { hyperlink: { slide: target, tooltip: `Jump to: ${ctx.nav.stageTitle?.[i] || label}` } } }] : label;
    slide.addText(runs, { x: x - 0.4, y: 0.6, w: 1.05, h: 0.26, fontFace: FONT, fontSize: 10, bold: on, color: on ? ctx.accent : MUTED, align: "center" });
  });
}

/** Timer badge ("5 min" with a clock face), right-aligned so it ends at `right`. Returns its width. */
function timerBadge(slide, ctx, minutes, right, y) {
  const w = minutes >= 10 ? 1.85 : 1.7;
  const x = right - w;
  slide.addShape("roundRect", { x, y, w, h: 0.66, rectRadius: 0.33, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2.5 } });
  slide.addShape("ellipse", { x: x + 0.12, y: y + 0.11, w: 0.44, h: 0.44, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2 } });
  slide.addShape("line", { x: x + 0.34, y: y + 0.17, w: 0, h: 0.16, line: { color: ctx.accent, width: 2 } });
  slide.addShape("line", { x: x + 0.34, y: y + 0.33, w: 0.1, h: 0.0, line: { color: ctx.accent, width: 2 } });
  slide.addText(`${minutes} min`, { x: x + 0.62, y, w: w - 0.7, h: 0.66, fontFace: FONT, fontSize: 18, bold: true, color: ctx.accent, valign: "middle", margin: 0 });
  return w;
}

/**
 * Slide header: kicker, title, journey tracker, and on task slides a timer
 * badge (`minutes`) and a routine badge (`routine`, e.g. "show-me").
 */
function header(slide, ctx, title, kicker, stage, minutes, routine, terms) {
  const B = BAND[ctx.band];
  slide.background = { color: ctx.band === "early" ? "FFFBF3" : "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.05, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
  if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.8, y: 0.3, w: 6.2, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3 });
  let right = 12.6;
  // Lessons v3: the key words used on this slide, in a small box in the corner.
  if (terms && terms.length) right -= v3.keywordCorner(slide, ctx, terms, right, 0.98) + 0.15;
  if (minutes) right -= timerBadge(slide, ctx, minutes, right, 1.0) + 0.15;
  if (routine && ROUTINES[routine]) {
    const w = parts.routineWidth(routine);
    parts.routineBadge(slide, ctx, routine, right - w, 1.0);
    right -= w + 0.15;
  }
  const titleW = right - 0.8;
  const size = fitSize(title, ctx.band === "early" ? titleW : fw(titleW, ctx.theme.head), 0.95, B.titleSize, 20);
  slide.addText(clean(title), { x: 0.8, y: 0.85, w: titleW, h: 0.95, fontFace: ctx.band === "early" ? FONT : ctx.theme.head, fontSize: size, bold: true, color: INK, valign: "middle" });
  slide.addShape("line", { x: 0.8, y: 1.85, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
  tracker(slide, ctx, stage);
  // Navigation: remember where each stage starts (pass one), and add a way back to the lesson map (pass two).
  const no = ctx.slideNo ? ctx.slideNo() : 0;
  if (ctx.rec && no) {
    if (stage != null && ctx.rec.stage[stage] == null) {
      ctx.rec.stage[stage] = no;
      ctx.rec.stageTitle[stage] = clean(title);
    }
    if (stage == null && ctx.rec.objectives == null) ctx.rec.objectives = no;
  }
  if (ctx.nav?.agenda) {
    slide.addText([{ text: "↩ Lesson map", options: { hyperlink: { slide: ctx.nav.agenda, tooltip: "Back to the lesson map" } } }], { x: 10.0, y: 7.1, w: 2.1, h: 0.34, fontFace: FONT, fontSize: 11, bold: true, color: ctx.accent, align: "right", valign: "middle" });
  }
}

/**
 * The youngest decks' motif: a plain eight-pointed star (the khatam shape), gold with a lighter
 * star inside. Deliberately no face: it is a symbol, not a character.
 */
function khatam(slide, x, y, size) {
  slide.addShape("star8", { x, y, w: size, h: size, fill: { color: "F2B33D" }, line: { color: "D99A22", width: 1.5 } });
  const i = size * 0.5;
  slide.addShape("star8", { x: x + (size - i) / 2, y: y + (size - i) / 2, w: i, h: i, rotate: 22.5, fill: { color: "FFE3A3" }, line: { color: "D99A22", width: 1 } });
  const c = size * 0.16;
  slide.addShape("octagon", { x: x + (size - c) / 2, y: y + (size - c) / 2, w: c, h: c, fill: { color: "F2B33D" }, line: { color: "D99A22", width: 0.75 } });
}

/** Question box: a callout with a small label like "Think about it" (a plain rounded box for the youngest). */
function bubble(slide, ctx, text, box, label) {
  const B = BAND[ctx.band];
  const size = fitSize(text, box.w - 0.5, box.h - (label ? 0.55 : 0.3), ctx.band === "early" ? 30 : 22, 14);
  slide.addShape(ctx.band === "early" ? "roundRect" : "wedgeRoundRectCallout", { ...box, fill: { color: ctx.band === "early" ? "FFFFFF" : GOLD_SOFT }, line: { color: ctx.band === "early" ? "F2B33D" : GOLD, width: 2 }, rectRadius: 0.2 });
  if (label) slide.addText(label.toUpperCase(), { x: box.x + 0.25, y: box.y + 0.12, w: box.w - 0.5, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: GOLD_DARK, charSpacing: 2 });
  slide.addText(clean(text), { x: box.x + 0.25, y: box.y + (label ? 0.42 : 0.1), w: box.w - 0.5, h: box.h - (label ? 0.55 : 0.2), fontFace: FONT, fontSize: size, bold: ctx.band === "early", color: INK, valign: "middle" });
  void B;
}

/** Numbered cards stacked vertically (questions/tasks). */
function stackedCards(slide, ctx, rawItems, box, opts = {}) {
  const items = rawItems.map(itemQ); // items may be strings or { q, a, mins }
  const n = items.length || 1;
  const gap = 0.16;
  const h = Math.min(opts.maxH || 1.45, (box.h - gap * (n - 1)) / n);
  const textW = box.w - 1.25;
  const size = Math.min(...items.map((t) => fitSize(t, textW, h - 0.12, BAND[ctx.band].cardMax, BAND[ctx.band].bodyMin)));
  items.forEach((t, i) => {
    const y = box.y + i * (h + gap);
    const play = PLAY[i % PLAY.length];
    const fill = ctx.band === "early" ? play.tint : i % 2 ? "FFFFFF" : CREAM;
    const dot = ctx.band === "early" ? play.solid : ctx.accent;
    slide.addShape("roundRect", { x: box.x, y, w: box.w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: ctx.band === "early" ? play.solid : LINE, width: ctx.band === "early" ? 1.5 : 0.75 } });
    const d = Math.min(0.7, h - 0.2);
    slide.addShape("ellipse", { x: box.x + 0.22, y: y + h / 2 - d / 2, w: d, h: d, fill: { color: dot }, line: { color: dot, width: 0 } });
    slide.addText(String(i + 1), { x: box.x + 0.22, y: y + h / 2 - d / 2, w: d, h: d, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    slide.addText(unnumber(t), { x: box.x + 1.1, y, w: textW, h, fontFace: FONT, fontSize: size, color: INK, valign: "middle" });
  });
}

// ── Teach slide layouts ────────────────────────────────────────────────────

/** Bullets side by side as cards, each with a big number. */
function layoutCards(slide, ctx, bullets, area) {
  const n = bullets.length;
  const gap = 0.25;
  const w = (area.w - gap * (n - 1)) / n;
  const short = bullets.every((b) => clean(b).length <= 14);
  const size = Math.min(...bullets.map((b) => fitSize(b, w - 0.4, area.h - 1.15, short ? (ctx.band === "early" ? 60 : 44) : BAND[ctx.band].bodyMax, BAND[ctx.band].bodyMin)));
  // Size the cards to their text (a short line in a tall empty box looks unfinished) and centre the row.
  const need = Math.max(...bullets.map((b) => textHeight(b, w - 0.4, size)));
  const h = Math.min(area.h, Math.max(2.3, 1.15 + need + 0.45));
  area = { ...area, y: area.y + (area.h - h) / 2, h };
  bullets.forEach((b, i) => {
    const x = area.x + i * (w + gap);
    const play = PLAY[i % PLAY.length];
    const fill = ctx.band === "early" ? play.tint : ctx.band === "junior" ? (i % 2 ? TEAL_SOFT : CREAM) : "FFFFFF";
    const top = ctx.band === "early" ? play.solid : ctx.accent;
    slide.addShape("roundRect", { x, y: area.y, w, h: area.h, rectRadius: 0.12, fill: { color: fill }, line: { color: ctx.band === "senior" ? LINE : top, width: ctx.band === "senior" ? 1 : 2 } });
    if (ctx.band === "senior") slide.addShape("rect", { x, y: area.y, w, h: 0.12, fill: { color: top }, line: { color: top, width: 0 } });
    slide.addShape("ellipse", { x: x + 0.25, y: area.y + 0.3, w: 0.75, h: 0.75, fill: { color: top }, line: { color: top, width: 0 } });
    slide.addText(String(i + 1), { x: x + 0.25, y: area.y + 0.3, w: 0.75, h: 0.75, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    slide.addText(clean(b), { x: x + 0.2, y: area.y + 1.15, w: w - 0.4, h: area.h - 1.3, fontFace: FONT, fontSize: size, bold: ctx.band === "early" || short, color: INK, valign: short ? "middle" : "top", align: short ? "center" : "left" });
  });
}

/** A sequence: chevrons along the top, the step text underneath each. */
function layoutSteps(slide, ctx, bullets, area) {
  const n = bullets.length;
  const w = area.w / n;
  const size = Math.min(...bullets.map((b) => fitSize(b, w - 0.35, area.h - 1.3, BAND[ctx.band].bodyMax - 4, BAND[ctx.band].bodyMin)));
  bullets.forEach((b, i) => {
    const x = area.x + i * w;
    const play = PLAY[i % PLAY.length];
    const c = ctx.band === "early" ? play.solid : ctx.accent;
    slide.addShape(i === 0 ? "homePlate" : "chevron", { x, y: area.y, w: w - 0.05, h: 0.85, fill: { color: c, transparency: ctx.band === "early" ? 0 : i * 12 }, line: { color: c, width: 0 } });
    slide.addText(`Step ${i + 1}`, { x: x + 0.25, y: area.y, w: w - 0.6, h: 0.85, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    slide.addText(clean(b), { x: x + 0.1, y: area.y + 1.1, w: w - 0.35, h: area.h - 1.2, fontFace: FONT, fontSize: size, color: INK, valign: "top" });
  });
}

/** The first point big and centred, the rest as smaller supporting points. */
function layoutSpotlight(slide, ctx, bullets, area) {
  const [first, ...rest] = bullets;
  const topH = rest.length ? area.h * 0.5 : area.h;
  const fill = ctx.band === "early" ? PLAY[ctx.n % PLAY.length].tint : ctx.band === "junior" ? TEAL_SOFT : CREAM;
  slide.addShape("roundRect", { x: area.x, y: area.y, w: area.w, h: topH, rectRadius: 0.12, fill: { color: fill }, line: { color: fill, width: 0 } });
  slide.addShape("rect", { x: area.x, y: area.y + 0.25, w: 0.12, h: topH - 0.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
  const s1 = fitSize(first, area.w - 1.0, topH - 0.4, BAND[ctx.band].bodyMax + 4, BAND[ctx.band].bodyMin + 2);
  slide.addText(clean(first), { x: area.x + 0.5, y: area.y + 0.2, w: area.w - 1.0, h: topH - 0.4, fontFace: FONT, fontSize: s1, bold: true, color: INK, valign: "middle" });
  if (!rest.length) return;
  const y = area.y + topH + 0.25;
  const h = area.h - topH - 0.25;
  const colW = (area.w - 0.25 * (rest.length - 1)) / rest.length;
  const s2 = Math.min(...rest.map((b) => fitSize(b, colW - 0.5, h - 0.2, BAND[ctx.band].bodyMax - 6, BAND[ctx.band].bodyMin)));
  rest.forEach((b, i) => {
    const x = area.x + i * (colW + 0.25);
    slide.addShape("roundRect", { x, y, w: colW, h, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 } });
    slide.addShape("star8", { x: x + 0.18, y: y + 0.2, w: 0.32, h: 0.32, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    slide.addText(clean(b), { x: x + 0.6, y: y + 0.1, w: colW - 0.75, h: h - 0.2, fontFace: FONT, fontSize: s2, color: INK, valign: "middle" });
  });
}

/** Left: a coloured panel (key word definition or the point in focus); right: the list. */
function layoutSplit(slide, ctx, bullets, area, keyword) {
  const leftW = 4.2;
  const fill = ctx.band === "senior" ? TEAL_DARK : ctx.accent;
  slide.addShape("roundRect", { x: area.x, y: area.y, w: leftW, h: area.h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill, width: 0 } });
  if (keyword) {
    slide.addText("KEY WORD", { x: area.x + 0.35, y: area.y + 0.35, w: leftW - 0.7, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: "E3C98F", charSpacing: 3 });
    slide.addText(clean(keyword.term), { x: area.x + 0.35, y: area.y + 0.7, w: leftW - 0.7, h: 1.0, fontFace: FONT, fontSize: fitSize(keyword.term, leftW - 0.7, 1.0, 34, 18), bold: true, color: "FFFFFF", valign: "top" });
    slide.addText(clean(keyword.def), { x: area.x + 0.35, y: area.y + 1.75, w: leftW - 0.7, h: area.h - 2.0, fontFace: FONT, fontSize: fitSize(keyword.def, leftW - 0.7, area.h - 2.0, 22, 13), color: "E8F1EF", valign: "top" });
  } else {
    starIcon(slide, area.x + 0.35, area.y + 0.35, 0.7, "E3C98F");
    slide.addText("IN FOCUS", { x: area.x + 0.35, y: area.y + 1.2, w: leftW - 0.7, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: "E3C98F", charSpacing: 3 });
    slide.addText(clean(bullets[0]), { x: area.x + 0.35, y: area.y + 1.55, w: leftW - 0.7, h: area.h - 1.8, fontFace: FONT, fontSize: fitSize(bullets[0], leftW - 0.7, area.h - 1.8, 26, 14), bold: true, color: "FFFFFF", valign: "top" });
  }
  const list = keyword ? bullets : bullets.slice(1).length ? bullets.slice(1) : bullets;
  const x = area.x + leftW + 0.35;
  const w = area.w - leftW - 0.35;
  const gap = 0.18;
  const h = Math.min(1.5, (area.h - gap * (list.length - 1)) / list.length);
  const size = Math.min(...list.map((b) => fitSize(b, w - 0.9, h - 0.15, BAND[ctx.band].bodyMax - 4, BAND[ctx.band].bodyMin)));
  const yStart = area.y + Math.max(0, (area.h - (list.length * h + (list.length - 1) * gap)) / 2);
  list.forEach((b, i) => {
    const y = yStart + i * (h + gap);
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: i % 2 ? "FFFFFF" : CREAM }, line: { color: LINE, width: 0.75 } });
    slide.addShape("rect", { x: x + 0.25, y: y + h / 2 - 0.09, w: 0.18, h: 0.18, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 }, rotate: 45 });
    slide.addText(clean(b), { x: x + 0.65, y, w: w - 0.85, h, fontFace: FONT, fontSize: size, color: INK, valign: "middle" });
  });
}

function starIcon(slide, x, y, size, color) {
  slide.addShape("star8", { x, y, w: size, h: size, fill: { color }, line: { color, width: 0 } });
}

/** True when a teach slide carries a block (model, check, chart…). */
const BLOCKS_IN = (t) => BLOCKS.some((k) => t && t[k] != null);

const STEP_WORDS = /^(first|firstly|then|next|after|finally|lastly|step \d|\d+\s*[.)])/i;
function chooseLayout(ctx, t, i) {
  const bullets = t.bullets || [];
  const longest = Math.max(...bullets.map((b) => clean(b).length));
  const looksLikeSteps = bullets.length >= 3 && bullets.length <= 5 && (bullets.filter((b) => STEP_WORDS.test(clean(b))).length >= 2 || /\b(how to|steps?|method|process|sequence|order)\b/i.test(t.heading));
  if (looksLikeSteps) return "steps";
  if (bullets.length > 4 || longest > 95) return "split";
  const firstIsStatement = clean(bullets[0]).split(" ").length >= 5;
  const cycle = ctx.band === "early" ? ["cards", "spotlight", "cards"] : ctx.band === "junior" ? ["cards", "split", "spotlight"] : ["split", "cards", "spotlight"];
  let pick = cycle[(i + ctx.n) % cycle.length];
  if (pick === "spotlight" && !firstIsStatement && bullets.length > 1) pick = longest > 80 ? "split" : "cards";
  if (pick === "cards" && (bullets.length < 2 || longest > 80)) pick = firstIsStatement ? "spotlight" : "split";
  return pick;
}

// ── Breaks ─────────────────────────────────────────────────────────────────
const BREAK_SECONDS = 60;
const MOVE_EARLY = [
  { name: "Stand like a tree", steps: ["Stand up tall like a tree trunk", "Stretch your arms out like branches", "Wiggle your fingers like leaves in the wind"] },
  { name: "Copy the teacher!", steps: ["Teacher makes a shape with their body", "Copy it as fast as you can", "Freeze… and sit down slowly"] },
  { name: "Count and jump", steps: ["Stand up", "Count to five together", "Do a little jump on every number"] },
  { name: "Air writing", steps: ["Hold up your magic finger", "Write today's special word in the air", "Now write it really big, then really small"] },
  { name: "Say SubhanAllah", steps: ["Take a big breath in", "Breathe out slowly and say SubhanAllah", "Do it three times, quietly"] },
];
const MOVE_JUNIOR = [
  { name: "Stand up if…", steps: ["Teacher reads a statement from today's lesson", "Stand up if it's true, stay sitting if it's false", "One person explains why"] },
  { name: "Air writing", steps: ["Pick a key word from today", "Write it in the air with your elbow", "Your partner guesses the word"] },
  { name: "Freeze frame", steps: ["Teacher says a key idea from the lesson", "Make a still pose that shows it", "Hold it for five seconds on camera"] },
  { name: "Quick-fire recall", steps: ["Teacher asks three quick questions", "Answer on your whiteboard as fast as you can", "Hold it up to the camera on 'show me'"] },
  { name: "Stretch and SubhanAllah", steps: ["Stand and stretch your arms up high", "Roll your shoulders back three times", "Sit, breathe out and say SubhanAllah"] },
];
const QURAN_BREAKS = [
  { name: "Echo recitation", steps: ["Teacher recites a short phrase from today's text", "Class echoes it in a whisper", "Then again at full voice, then humming the ghunnah"] },
  { name: "Makhraj mirror", steps: ["Teacher calls out a letter", "Everyone points to where it comes from: throat, tongue, lips or nose", "Fastest correct pointers win a smile"] },
  { name: "Count with your fingers", steps: ["Teacher stretches a sound", "Show 2, 4 or 6 counts on your fingers", "Hold them up on the camera together"] },
  { name: "Rule or not?", steps: ["Teacher reads a statement about today's rule", "Thumbs up if true, thumbs down if false", "Explain one answer to the class"] },
  { name: "Silent recitation", steps: ["Mouth an ayah with no sound", "Classmates watch your lips and guess it", "Swap, then check against the mushaf"] },
  { name: "Breathe and remember Allah", steps: ["Sit tall and breathe in slowly", "Breathe out saying SubhanAllah", "Repeat with Alhamdulillah, then Allahu Akbar"] },
  { name: "Colour hunt", steps: ["Look at today's text", "Find a letter that matches one colour in our key", "Type the letter and the rule in the chat"] },
  { name: "Teach your neighbour", steps: ["Turn to a partner (or breakout room)", "You have 20 seconds to explain today's rule", "Then swap roles"] },
  { name: "Stand, stretch, bismillah", steps: ["Stand up and stretch tall", "Roll your shoulders three times", "Sit and say Bismillah before we carry on"] },
  { name: "Fastest finger", steps: ["Teacher asks a quick recall question", "Type the answer in the chat but do not press send", "On 'go', everyone sends together"] },
];

function starPattern(slide, x0, y0, cols, rows, size, gap, color, transparency) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (size + gap) + (r % 2 ? (size + gap) / 2 : 0);
      const y = y0 + r * (size + gap) * 0.62;
      slide.addShape("star8", { x, y, w: size, h: size, fill: { color, transparency }, line: { color, width: 0.5, transparency: Math.max(0, transparency - 20) } });
    }
  }
}

function breakSlide(pptx, ctx, act) {
  const s = pptx.addSlide();
  const early = ctx.band === "early";
  s.background = { color: early ? "FFF1D6" : GOLD_SOFT };
  starPattern(s, 8.2, -0.5, 4, 7, 1.4, 0.15, early ? "F2A93B" : GOLD, 82);
  s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: early ? "F2A93B" : GOLD }, line: { color: GOLD, width: 0 } });
  s.addText(early ? "WIGGLE BREAK!" : "BRAIN BREAK", { x: 0.9, y: 0.7, w: 7, h: 0.4, fontFace: FONT, fontSize: early ? 22 : 16, bold: true, color: GOLD_DARK, charSpacing: 6 });
  s.addText(act.name, { x: 0.9, y: 1.2, w: 7.6, h: 1.4, fontFace: FONT, fontSize: fitSize(act.name, 7.6, 1.4, early ? 54 : 46, 28), bold: true, color: EMERALD, valign: "top" });
  act.steps.forEach((t, i) => {
    const y = 3.0 + i * 1.15;
    const c = early ? PLAY[i % PLAY.length].solid : EMERALD;
    s.addShape("ellipse", { x: 0.9, y, w: 0.8, h: 0.8, fill: { color: c }, line: { color: c, width: 0 } });
    s.addText(String(i + 1), { x: 0.9, y, w: 0.8, h: 0.8, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    s.addText(t, { x: 1.95, y: y - 0.1, w: 6.6, h: 1.0, fontFace: FONT, fontSize: fitSize(t, 6.6, 1.0, early ? 28 : 24, 16), color: INK, valign: "middle" });
  });
  if (early) khatam(s, 9.4, 2.4, 3.0);
  else {
    s.addShape("ellipse", { x: 9.6, y: 2.7, w: 2.6, h: 2.6, fill: { color: "FFFFFF" }, line: { color: EMERALD, width: 6 } });
    s.addText(String(BREAK_SECONDS), { x: 9.6, y: 2.95, w: 2.6, h: 1.5, fontFace: FONT, fontSize: 72, bold: true, color: EMERALD, align: "center", valign: "middle" });
    s.addText("seconds", { x: 9.6, y: 4.2, w: 2.6, h: 0.5, fontFace: FONT, fontSize: 20, color: MUTED, align: "center" });
  }
  s.addNotes(`Keep this to about ${BREAK_SECONDS} seconds. Start a timer on screen. It resets attention before the next part of the lesson. No music needed.`);
  return s;
}

// ── Qur'an extras ──────────────────────────────────────────────────────────
const TAJWEED_KEY = [
  { name: "Madd", what: "Stretch the sound", color: "D9534F" },
  { name: "Ghunnah", what: "Nasal hum", color: "2E9E5B" },
  { name: "Qalqalah", what: "Little echo", color: "3B82C4" },
  { name: "Ikhfa / Idgham", what: "Hide or merge", color: "8E5BB5" },
  { name: "Tafkhim", what: "Heavy letter, full mouth", color: "5B4636" },
  { name: "Izhar", what: "Clear, no blending", color: "7A8793" },
];

function tajweedKeySlide(pptx, ctx) {
  const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
  header(s, ctx, "Our tajweed colour key", "Look for these in today's slides", 1);
  const w = 3.75;
  const h = 2.0;
  TAJWEED_KEY.forEach((k, i) => {
    const x = 0.8 + (i % 3) * (w + 0.3);
    const y = 2.15 + Math.floor(i / 3) * (h + 0.3);
    s.addShape("roundRect", { x, y, w, h, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { color: k.color, width: 2.5 } });
    s.addShape("ellipse", { x: x + 0.3, y: y + 0.3, w: 0.7, h: 0.7, fill: { color: k.color }, line: { color: k.color, width: 0 } });
    s.addShape("star8", { x: x + 0.43, y: y + 0.43, w: 0.44, h: 0.44, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
    s.addText(k.name, { x: x + 1.15, y: y + 0.25, w: w - 1.3, h: 0.8, fontFace: FONT, fontSize: 22, bold: true, color: INK, valign: "middle" });
    s.addText(k.what, { x: x + 0.3, y: y + 1.1, w: w - 0.6, h: 0.7, fontFace: FONT, fontSize: 18, color: MUTED, valign: "top" });
  });
  s.addNotes("This colour key is used on our slides to help pupils spot rules. If a pupil's mushaf uses different colours, that is fine: always follow the colours in the mushaf you read from.");
}

const parts = makeParts({ fitSize, clean, FONT, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, CREAM, LINE });
// v3 is made after hookIcon (below) is defined: see makeV3 call after hookSlide.

// ── Hook, answers and routines ───────────────────────────────────────────────

const HOOK_KICKER = {
  question: ["THINK ABOUT THIS", "I WONDER…"],
  "image-prompt": ["PICTURE THIS", "IMAGINE…"],
  story: ["A STORY TO START", "STORY TIME"],
  puzzle: ["PUZZLE", "PUZZLE TIME"],
  "odd-one-out": ["ODD ONE OUT", "ODD ONE OUT"],
};

/** A large drawn icon for the hook type, in a square box (shapes only). */
function hookIcon(s, type, x, y, d) {
  const g = "E3C98F";
  const w = { color: "FFFFFF", transparency: 88 };
  if (type === "question") {
    s.addShape("ellipse", { x, y, w: d, h: d, fill: w, line: { color: g, width: 5 } });
    s.addText("?", { x, y: y - d * 0.04, w: d, h: d, fontFace: "Georgia", fontSize: Math.round(d * 72 * 0.62), bold: true, color: g, align: "center", valign: "middle", margin: 0 });
  } else if (type === "image-prompt") {
    s.addShape("roundRect", { x, y: y + d * 0.12, w: d, h: d * 0.76, rectRadius: 0.12, fill: w, line: { color: g, width: 5 } });
    s.addShape("ellipse", { x: x + d * 0.66, y: y + d * 0.24, w: d * 0.16, h: d * 0.16, fill: { color: g }, line: { color: g, width: 0 } });
    s.addShape("triangle", { x: x + d * 0.08, y: y + d * 0.42, w: d * 0.5, h: d * 0.4, fill: { color: "FFFFFF", transparency: 35 }, line: { color: "FFFFFF", width: 0 } });
    s.addShape("triangle", { x: x + d * 0.4, y: y + d * 0.52, w: d * 0.5, h: d * 0.3, fill: { color: g, transparency: 20 }, line: { color: g, width: 0 } });
  } else if (type === "story") {
    [0, 1].forEach((i) => {
      const px = x + (i ? d * 0.5 : 0.02);
      s.addShape("roundRect", { x: px, y: y + d * 0.14, w: d * 0.48, h: d * 0.72, rectRadius: 0.06, fill: w, line: { color: g, width: 4 } });
      for (let k = 0; k < 5; k++) s.addShape("line", { x: px + d * 0.07, y: y + d * (0.27 + k * 0.11), w: d * 0.34, h: 0, line: { color: "FFFFFF", width: 2, transparency: 40 } });
    });
  } else if (type === "puzzle") {
    const c = d / 3;
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) {
        const gap = r === 2 && k === 2;
        s.addShape("roundRect", { x: x + k * c + 0.05, y: y + r * c + 0.05, w: c - 0.1, h: c - 0.1, rectRadius: 0.06, fill: gap ? { color: "FFFFFF", transparency: 100 } : (r + k) % 2 ? w : { color: g, transparency: 15 }, line: { color: g, width: 2, dashType: gap ? "dash" : "solid" } });
        if (gap) s.addText("?", { x: x + k * c, y: y + r * c, w: c, h: c, fontFace: "Georgia", fontSize: Math.round(c * 72 * 0.55), bold: true, color: g, align: "center", valign: "middle", margin: 0 });
      }
  } else {
    const c = d / 2;
    [0, 1, 2, 3].forEach((i) => {
      const px = x + (i % 2) * c + 0.1;
      const py = y + Math.floor(i / 2) * c + 0.1;
      if (i === 3) s.addShape("rect", { x: px + 0.08, y: py + 0.08, w: c - 0.36, h: c - 0.36, rotate: 12, fill: { color: g }, line: { color: g, width: 0 } });
      else s.addShape("ellipse", { x: px, y: py, w: c - 0.2, h: c - 0.2, fill: w, line: { color: "FFFFFF", width: 3, transparency: 20 } });
    });
  }
}

/** The hook: a striking full-bleed slide straight after the title, to grab attention in the first minute. */
function hookSlide(pptx, ctx, lesson) {
  const h = lesson.hook;
  const early = ctx.band === "early";
  const s = pptx.addSlide();
  s.background = { color: ctx.theme.dark };
  s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
  if (early) [[11.3, -1.0, 2.6, 0], [-0.8, 6.3, 2.0, 1], [6.8, 6.8, 1.2, 2]].forEach(([x, y, d, c]) => s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: PLAY[c].solid, transparency: 55 }, line: { color: PLAY[c].solid, width: 0 } }));
  const kicker = (HOOK_KICKER[h.type] || HOOK_KICKER.question)[early ? 1 : 0];
  s.addText(kicker, { x: 0.9, y: 0.75, w: 8, h: 0.45, fontFace: FONT, fontSize: early ? 22 : 18, bold: true, color: "E3C98F", charSpacing: 6 });
  const opts = (h.options || []).slice(0, 5).map(clean);
  const textW = 8.2;
  const textH = opts.length ? 2.9 : 4.4;
  const head = early ? FONT : ctx.theme.head;
  s.addText(clean(h.text), { x: 0.9, y: 1.35, w: textW, h: textH, fontFace: head, fontSize: fitSize(h.text, early ? textW : fw(textW, head), textH, early ? 48 : 44, early ? 28 : 22), bold: true, color: "FFFFFF", valign: "middle", italic: h.type === "story" && !early });
  if (early) khatam(s, 9.6, 1.25, 2.9);
  else hookIcon(s, h.type, 9.7, 1.35, 2.8);
  if (opts.length) {
    const gap = 0.25;
    const w = (11.7 - gap * (opts.length - 1)) / opts.length;
    const oy = 4.55;
    const oh = 1.35;
    const size = Math.min(...opts.map((o) => fitSize(o, w - 1.05, oh - 0.15, early ? 30 : 26, 14)));
    opts.forEach((o, i) => {
      const x = 0.9 + i * (w + gap);
      s.addShape("roundRect", { x, y: oy, w, h: oh, rectRadius: early ? 0.3 : 0.12, fill: { color: "FFFFFF" }, line: { color: "E3C98F", width: 2 } });
      s.addShape("ellipse", { x: x + 0.2, y: oy + oh / 2 - 0.3, w: 0.6, h: 0.6, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      s.addText("ABCDE"[i], { x: x + 0.2, y: oy + oh / 2 - 0.3, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      s.addText(o, { x: x + 0.9, y: oy, w: w - 1.05, h: oh, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, bold: early, color: INK, valign: "middle" });
    });
  }
  const routine = routineFor(lesson, "hook", h.type);
  const bw = parts.routineBadge(s, ctx, routine, 0.9, 6.35, 0.6, true);
  s.addText(h.type === "odd-one-out" ? "Which one does not belong, and why? There may be more than one good answer." : "About one minute", { x: 0.9 + bw + 0.25, y: 6.35, w: 9, h: 0.6, fontFace: FONT, fontSize: 15, color: "D9D4C7", valign: "middle" });
  s.addNotes(`HOOK (about one minute, before the lesson map). ${ROUTINES[routine] ? `${ROUTINES[routine].label}: ${ROUTINES[routine].how} ` : ""}Take a few answers and do not settle it yet: the lesson will answer it.${h.a ? ` What to draw out: ${clean(h.a)}` : ""}`);
  return s;
}

const v3 = makeV3({ header, fitSize, textHeight, clean, fw, khatam, hookIcon, parts, FONT, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, CREAM, LINE, PLAY, BAND });

/** A thin strip saying how to answer (routine icon, name and what pupils do). */
function routineStrip(s, ctx, id, y, h = 0.6) {
  const r = ROUTINES[id];
  if (!r) return;
  s.addShape("roundRect", { x: 0.8, y, w: 11.8, h, rectRadius: 0.1, fill: { color: ctx.theme.soft }, line: { color: ctx.theme.soft, width: 0 } });
  parts.routineIcon(s, id, 1.0, y + (h - 0.36) / 2, 0.36, ctx.accent);
  s.addText([{ text: `${r.label.toUpperCase()}   `, options: { bold: true, color: ctx.accent, charSpacing: 2, fontSize: 12 } }, { text: r.how, options: { color: INK } }], { x: 1.55, y, w: 10.9, h, fontFace: FONT, fontSize: fitSize(`${r.label} ${r.how}`, 10.0, h, 16, 11), valign: "middle" });
}

const TICK = "3E9B57";

/**
 * "Check your answers": the answers to one set of questions, revealed after pupils have
 * had a go. `labels` (optional) names each item (Core, Extend…). `teacherOnly`: the exit
 * ticket key, placed after the last slide so it is never shown by accident.
 */
function answersSlide(pptx, ctx, items, { kicker, stage, labels, teacherOnly, title }) {
  const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
  const early = ctx.band === "early";
  header(s, ctx, title || (early ? "Did you get it?" : "Check your answers"), kicker, teacherOnly ? null : stage);
  if (teacherOnly) {
    s.addShape("roundRect", { x: 9.6, y: 0.95, w: 3.0, h: 0.66, rectRadius: 0.33, fill: { color: "C0392B" }, line: { color: "C0392B", width: 0 } });
    s.addText("TEACHER ONLY", { x: 9.6, y: 0.95, w: 3.0, h: 0.66, fontFace: FONT, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 3 });
  }
  const list = items.slice(0, 5);
  const top = 2.15;
  const avail = 4.25;
  const gap = 0.16;
  const h = Math.min(early ? 1.5 : 1.3, (avail - gap * (list.length - 1)) / list.length);
  const qH = h * 0.42;
  const aH = h - qH - 0.08;
  const TIER = /^(core|extend|extension|stretch|challenge|bronze|silver|gold)\s*[:\-–]\s*/i;
  const qs = list.map((x, i) => `${labels && labels[i] ? `${labels[i]}: ` : ""}${unnumber(itemQ(x)).replace(labels ? TIER : /^$/, "")}`);
  const as = list.map((x) => itemA(x) || "Answers will vary: take two or three and discuss.");
  // Each question line is sized on its own (they are prompts); the answers share one size.
  const qSizes = qs.map((q) => fitSize(q, 10.3, qH, early ? 20 : 17, 10));
  const aSize = Math.min(...as.map((a) => fitSize(a, 10.3, aH, early ? 30 : 24, early ? 16 : 12)));
  list.forEach((x, i) => {
    const y = top + i * (h + gap);
    const has = !!itemA(x);
    s.addShape("roundRect", { x: 0.8, y, w: 11.8, h, rectRadius: early ? 0.25 : 0.1, fill: { color: "FFFFFF" }, line: { color: has ? TICK : LINE, width: has ? 1.5 : 1 } });
    s.addShape("rect", { x: 0.8, y: y + 0.12, w: 0.1, h: h - 0.24, fill: { color: has ? TICK : "C9C2B3" }, line: { color: has ? TICK : "C9C2B3", width: 0 } });
    const d = Math.min(0.62, h - 0.3);
    s.addShape("ellipse", { x: 1.1, y: y + h / 2 - d / 2, w: d, h: d, fill: { color: has ? TICK : "C9C2B3" }, line: { color: "FFFFFF", width: 0 } });
    s.addText(has ? "✓" : String(i + 1), { x: 1.1, y: y + h / 2 - d / 2, w: d, h: d, fontFace: has ? "DejaVu Sans" : FONT, fontSize: has ? 22 : 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
    s.addText(`${i + 1}.  ${qs[i]}`, { x: 2.0, y: y + 0.06, w: 10.4, h: qH, fontFace: FONT, fontSize: qSizes[i], color: MUTED, valign: "middle", margin: 0 });
    s.addText(as[i], { x: 2.0, y: y + 0.06 + qH, w: 10.4, h: aH, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: aSize, bold: has, italic: !has, color: has ? INK : MUTED, valign: "middle", margin: 0 });
  });
  if (!teacherOnly) {
    const line = early ? "Got it right? Give yourself a star! Not yet? Fix it with your teacher." : "Mark in a different colour: tick what is right and correct the rest.";
    s.addShape("star5", { x: 0.8, y: 6.5, w: 0.36, h: 0.36, fill: { color: "F2B33D" }, line: { color: "D99A22", width: 1 } });
    s.addText(line, { x: 1.3, y: 6.45, w: 11.2, h: 0.45, fontFace: FONT, fontSize: early ? 20 : 16, italic: !early, bold: early, color: early ? INK : MUTED, valign: "middle" });
  }
  s.addNotes(
    teacherOnly
      ? "TEACHER ONLY: exit ticket answers, for marking. This slide comes after the end of the lesson so it is never shown by accident."
      : "Reveal once everyone has answered. Pupils self-mark in a different colour. Re-explain any question most pupils got wrong before moving on.",
  );
  return s;
}

// ── The deck ───────────────────────────────────────────────────────────────
/**
 * One lesson's deck. `opts`: { pics: picturesFor(lesson), unitKeywords: [{term, def}] for the
 * unit, pupilUrl: the pupil PDF link, pupil: true to build the pupil PDF's deck instead (A4
 * landscape, the slides pupils need with a name line, no teacher slides or answers, and a worksheet).
 */
function buildDeck(file, lesson, nextLesson, nav = null, opts = {}) {
  const pptx = new PptxGenJS();
  const pupil = !!opts.pupil;
  if (pupil) {
    pptx.defineLayout({ name: "A4_LANDSCAPE", width: A4.w, height: A4.h });
    pptx.layout = "A4_LANDSCAPE";
  } else pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.title = `${file.subject} ${YEAR_LABEL(file.year)} – ${lesson.title}`;
  pptx.author = "Tarbiyyah Global Academy";
  pptx.company = "Tarbiyyah Global Academy";
  // Count slides as they're added so the lesson plan can point to them.
  const addSlide = pptx.addSlide.bind(pptx);
  let slideCount = 0;
  // Recurring-decimal dots and other combining marks (U+0300-036F) garble in Calibri/Carlito/
  // Georgia under LibreOffice, which makes the PDF copies wrong; DejaVu Sans anchors them
  // correctly (verified by rendering). Any text run containing one is switched to DejaVu Sans.
  const COMB = /[\u0300-\u036f\u20d0-\u20dc]/;
  // Arrows (→ ⇌ ← in word and chemical equations) come out as a short dash in Cambria under
  // LibreOffice, so the PDF copies were wrong (verified by rendering). Each arrow becomes its own run
  // in DejaVu Sans; the rest of the text keeps its font (runs inherit the box's size and colour).
  const ARROW = /([\u2190-\u21ff\u27f0-\u27ff\u2900-\u297f])/;
  const splitRun = (text, options) => {
    const bits = String(text).split(ARROW).filter((b) => b !== "");
    return bits.map((b, i) => {
      const o = { ...(options || {}) };
      if (o.breakLine && i < bits.length - 1) delete o.breakLine; // a line break goes after the last piece only
      if (ARROW.test(b)) o.fontFace = "DejaVu Sans";
      return { text: b, options: o };
    });
  };
  const withArrows = (txt) => {
    if (typeof txt === "string") return ARROW.test(txt) ? splitRun(txt, {}) : txt;
    if (!Array.isArray(txt)) return txt;
    if (!txt.some((r) => r && typeof r === "object" && typeof r.text === "string" && ARROW.test(r.text))) return txt;
    return txt.flatMap((r) => (r && typeof r === "object" && typeof r.text === "string" && ARROW.test(r.text) ? splitRun(r.text, r.options) : [r]));
  };
  // Arabic: every stretch of Arabic is its own run, marked Arabic, in Scheherazade New (Qur'an lessons and any
  // ayah) or Noto Naskh Arabic. A box that is all Arabic is right-to-left; Arabic inside an English
  // sentence is drawn 15% larger so it reads at the same size as the English around it.
  const quranDeck = path.basename(path.dirname(file.path)) === "quran";
  quranText = quranDeck;
  const arOpts = (o, text, quran) => {
    const f = arabicFont(text, quran || o.fontFace === QURAN_FONT);
    return { ...o, fontFace: f, lang: AR_LANG };
  };
  const arRuns = (text, options, boxSize, boxQuran) => {
    const segs = arabicSegments(text);
    const mixed = segs.some((g) => !g.ar && /[A-Za-z0-9]/.test(g.text));
    return segs.map((g, i) => {
      let o = { ...(options || {}) };
      if (o.breakLine && i < segs.length - 1) delete o.breakLine;
      if (g.ar) {
        o = arOpts(o, g.text, quranDeck || boxQuran);
        const base = o.fontSize || boxSize;
        if (mixed && base) o.fontSize = Math.round(base * 1.15 * 2) / 2;
      }
      return { text: g.text, options: o };
    });
  };
  const runText = (r) => (typeof r === "string" ? r : r && typeof r === "object" && typeof r.text === "string" ? r.text : "");
  const withArabic = (txt, opts) => {
    const all = Array.isArray(txt) ? txt.map(runText).join("") : typeof txt === "string" ? txt : "";
    if (!HAS_AR.test(all)) return [txt, opts];
    const boxQuran = opts.fontFace === QURAN_FONT;
    if (isArabicOnly(all)) {
      // A whole Arabic box: the box itself is Arabic and right-to-left.
      // LibreOffice spaces Arabic lines at about 1.27em; the marks above and below need a little more.
      const o = { ...arOpts(opts, all, quranDeck || boxQuran), rtlMode: true };
      o.lineSpacingMultiple = opts.lineSpacingMultiple || (o.fontFace === QURAN_FONT ? 1.3 : 1.15);
      return [Array.isArray(txt) ? txt.map((r) => (r && typeof r === "object" && r.options ? { ...r, options: { ...r.options, lang: AR_LANG, fontFace: o.fontFace, rtlMode: true } } : r)) : txt, o];
    }
    const runs = typeof txt === "string" ? arRuns(txt, {}, opts.fontSize, boxQuran) : txt.flatMap((r) => (HAS_AR.test(runText(r)) ? arRuns(runText(r), typeof r === "string" ? {} : r.options, opts.fontSize, boxQuran) : [r]));
    return [runs, opts];
  };
  pptx.addSlide = (o) => {
    slideCount++;
    const s = addSlide(o);
    const at = s.addText.bind(s);
    s.addText = (txt0, opts0 = {}) => {
      let [txt, opts] = withArabic(txt0, opts0);
      if (typeof txt === "string" && COMB.test(txt)) return at(txt, { ...opts, fontFace: "DejaVu Sans" });
      if (Array.isArray(txt)) txt = txt.map((r) => (r && typeof r === "object" && typeof r.text === "string" && COMB.test(r.text) ? { ...r, options: { ...(r.options || {}), fontFace: "DejaVu Sans" } } : r));
      return at(withArrows(txt), opts);
    };
    const atb = s.addTable.bind(s);
    const fixCell = (c, tableSize) => {
      const ct = runText(c);
      if (HAS_AR.test(ct)) {
        const base = (c && typeof c === "object" && c.options) || {};
        if (isArabicOnly(ct)) {
          const o = { ...arOpts(base, ct, quranDeck), rtlMode: true };
          return { text: ct, options: o };
        }
        return { text: arRuns(ct, {}, base.fontSize || tableSize, false), options: base };
      }
      if (typeof c === "string" && COMB.test(c)) return { text: c, options: { fontFace: "DejaVu Sans" } };
      if (typeof c === "string" && ARROW.test(c)) return { text: splitRun(c, {}), options: {} };
      if (c && typeof c === "object" && typeof c.text === "string" && COMB.test(c.text)) return { ...c, options: { ...(c.options || {}), fontFace: "DejaVu Sans" } };
      if (c && typeof c === "object" && typeof c.text === "string" && ARROW.test(c.text)) return { ...c, text: splitRun(c.text, {}) };
      return c;
    };
    s.addTable = (rows, opts) => atb(Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map((c) => fixCell(c, opts && opts.fontSize)) : r)) : rows, opts);
    if (pupil) toA4(s, slideCount);
    return s;
  };
  /**
   * Pupil PDF: every slide is drawn at 13.33 x 7.5 inches, so on an A4 page each position, size,
   * font and line is scaled by PK and moved down by PTOP, under a band with the lesson and a name line.
   */
  function toA4(s, page) {
    const num = (v) => typeof v === "number";
    const fs = (v) => Math.max(6, Math.round(v * PK * 2) / 2);
    const sc = (o) => {
      if (!o || typeof o !== "object") return o;
      const r = { ...o };
      for (const k of ["x", "w", "h"]) if (num(r[k])) r[k] *= PK;
      if (num(r.y)) r.y = r.y * PK + PTOP;
      for (const k of ["fontSize", "titleFontSize", "legendFontSize", "dataLabelFontSize", "catAxisLabelFontSize", "valAxisLabelFontSize"]) if (num(r[k])) r[k] = fs(r[k]);
      if (r.line && num(r.line.width)) r.line = { ...r.line, width: r.line.width * PK };
      if (Array.isArray(r.colW)) r.colW = r.colW.map((v) => v * PK);
      else if (num(r.colW)) r.colW *= PK;
      if (Array.isArray(r.rowH)) r.rowH = r.rowH.map((v) => v * PK);
      else if (num(r.rowH)) r.rowH *= PK;
      if (num(r.margin)) r.margin *= PK;
      if (r.border && num(r.border.pt)) r.border = { ...r.border, pt: r.border.pt * PK };
      return r;
    };
    const runs = (t) => (Array.isArray(t) ? t.map((x) => (x && typeof x === "object" && x.options ? { ...x, options: sc(x.options) } : x)) : t);
    const raw = { text: s.addText.bind(s), shape: s.addShape.bind(s), image: s.addImage.bind(s), table: s.addTable.bind(s), chart: s.addChart.bind(s) };
    s.addText = (t, o = {}) => raw.text(runs(t), sc(o));
    s.addShape = (k, o = {}) => raw.shape(k, sc(o));
    s.addImage = (o = {}) => raw.image(sc(o));
    s.addTable = (rows, o = {}) => raw.table(Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map((c) => (c && typeof c === "object" && c.options ? { ...c, options: sc(c.options) } : c)) : r)) : rows, sc(o));
    s.addChart = (k, d, o = {}) => raw.chart(k, d, sc(o));
    // A dark slide background would hide the name line: paint it into the slide's own area instead.
    Object.defineProperty(s, "background", { configurable: true, set: (v) => v && v.color && raw.shape("rect", { x: 0, y: PTOP, w: A4.w, h: 7.5 * PK, fill: { color: v.color }, line: { color: v.color, width: 0 } }), get: () => undefined });
    raw.text(`${file.subject} · ${YEAR_LABEL(file.year)} · Lesson ${lesson.n}: ${clean(lesson.title)}`, { x: 0.35, y: 0.12, w: 6.6, h: 0.36, fontFace: FONT, fontSize: 10, color: MUTED, valign: "middle", fit: "shrink" });
    raw.text(page === 1 ? "Name: ________________________   Date: ____________" : "Name: ________________________", { x: 6.9, y: 0.12, w: 4.45, h: 0.36, fontFace: FONT, fontSize: 11, bold: true, color: INK, align: "right", valign: "middle" });
    raw.shape("line", { x: 0.35, y: 0.52, w: A4.w - 0.7, h: 0, line: { color: LINE, width: 0.75 } });
    raw.shape("rect", { x: 0, y: PTOP, w: A4.w, h: 7.5 * PK, fill: { color: "FFFFFF", transparency: 100 }, line: { color: LINE, width: 0.75 } });
    raw.text(`Tarbiyyah Global Academy · Lesson PDF · page ${page}`, { x: 0.35, y: A4.h - 0.5, w: A4.w - 0.7, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED, align: "center" });
  }
  const S = { teach: [] };
  let breaksAdded = 0;
  const subjectSlug = path.basename(path.dirname(file.path));
  const band = bandFor(file.year);
  const B = BAND[band];
  const theme = themeFor(subjectSlug);
  const ctx = { band, enquiry: band !== "early" || file.year === "y3", n: lesson.n, theme, accent: theme.accent || ACCENTS[subjectSlug] || TEAL, mathy: /^(mathematics|science|gcse-science|business)$/.test(subjectSlug), subjectLabel: file.subject, yearLabel: YEAR_LABEL(file.year), yearKey: file.year, nav: nav || null, rec: { stage: {}, stageTitle: {}, agenda: null, close: null }, slideNo: () => slideCount, pupil, pupilUrl: pupil ? null : opts.pupilUrl || null };
  const pics = opts.pics || [];
  const picFor = (where) => pics.find((p) => p.for === where) || null;
  const ponder = lesson.hook && lesson.hook.type === "ponder" && lesson.hook.text ? lesson.hook : null;
  S.polls = [];
  const quran = subjectSlug === "quran";
  // Lessons v3: the Arabic bismillah heading on the title slide only in Qur'an, Islamic Studies and Arabic.
  const islamicSubject = ISLAMIC_SUBJECTS.includes(subjectSlug);
  const ks4 = file.year === "y10" || file.year === "y11";
  const duration = lesson.duration || defaultDuration(file.year);
  ctx.duration = duration;
  const keywords = (lesson.keywords || []).filter((k) => k && k.term);
  const teach = lesson.teach || [];
  // Assessment lessons: the independent questions are the test (lessonSchema.mjs: assessmentModeOf).
  const A = (() => {
    const mode = assessmentModeOf(lesson);
    if (!mode) return null;
    const items = (lesson.independent || []).filter((x) => clean(itemQ(x)));
    const labels = assessmentLabels(items, mode);
    const rows = items.map((x, i) => ({ ...labels[i], marks: itemMarks(x), mins: itemMins(x), a: itemA(x), poll: !!itemOptions(x) }));
    // "Q3 … (an alternative to Q1 or Q2)": a choice, so its marks are not added to the total.
    const known = rows.filter((r) => !/\balternative\b/i.test(r.rest)).map((r) => r.marks).filter((m) => m != null);
    const oral = /\b(speaking|oral|recit\w*|hifdh|phonics|1:1|role play)\b/i.test(`${lesson.title} ${lesson.unit}`);
    const mathy = /^(mathematics|science|gcse-science|business)$/.test(subjectSlug);
    const how = oral
      ? "Wait for your name, unmute, give your answer, then mute again."
      : rows.length && rows.every((r) => r.poll)
        ? "Choose one answer for each question."
        : band === "early"
          ? "Write your answers on your lesson sheet, or in the portal response box."
          : `Write in the portal response box, or on paper: put the question number first${mathy ? " and show your working" : ""}.`;
    const counted = rows.filter((r) => r.label !== "Warm-up" && r.label !== "Afterwards" && !/\balternative\b/i.test(r.rest));
    return { mode, label: ASSESSMENT_LABEL[mode], rows, count: counted.length, sections: counted.length > 0 && counted.every((r) => /^Section/.test(r.label)), marks: known.length ? known.reduce((a, b) => a + b, 0) : null, minutes: phaseMinutes("independent", items, duration), how, before: itemModel(items[0]), polls: [] };
  })();
  ctx.assess = A;
  let breakNo = lesson.n * 3; // rotates the activities so neighbouring lessons differ
  const breaks = quran ? QURAN_BREAKS : band === "early" ? MOVE_EARLY : MOVE_JUNIOR;
  const nextBreak = () => breaks[breakNo++ % breaks.length];

  // Footer on a master so the logo is stored once in the file.
  const M = (o) => (pupil ? { ...o, x: o.x * PK, y: o.y * PK + PTOP, w: o.w * PK, h: o.h * PK, ...(o.fontSize ? { fontSize: Math.round(o.fontSize * PK) } : {}), ...(o.charSpacing ? { charSpacing: 1 } : {}) } : o);
  pptx.defineSlideMaster({
    title: "TGA_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: M({ x: 0, y: 7.05, w: W, h: 0.45, fill: { color: "FFFFFF" }, line: { color: "E5E5E5", width: 0.5 } }) },
      { text: { text: "TARBIYYAH GLOBAL ACADEMY", options: M({ x: 0.45, y: 7.1, w: 2.5, h: 0.34, fontFace: FONT, fontSize: 9, bold: true, color: GOLD_DARK, charSpacing: 2, valign: "middle" }) } },
      { text: { text: `${ctx.subjectLabel} · ${ctx.yearLabel} · Lesson ${lesson.n}`, options: M({ x: 3.1, y: 7.1, w: 6.9, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, valign: "middle" }) } },
    ],
    ...(pupil ? {} : { slideNumber: { x: 12.2, y: 7.1, w: 0.7, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, align: "right" } }),
  });

  // 0. Ponder (lessons v3): the first slide, on screen while pupils join.
  if (ponder) S.ponder = (v3.ponderSlide(pptx, ctx, lesson, picFor("hook")), slideCount);

  // 1. Title ---------------------------------------------------------------
  {
    const s = pptx.addSlide();
    if (band === "early") {
      s.background = { color: "FFFBF3" };
      [[10.9, -1.2, 3.4, 1], [11.6, 5.6, 2.6, 2], [-0.9, 6.0, 2.4, 3], [6.4, 6.4, 1.4, 0]].forEach(([x, y, d, c]) =>
        s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: PLAY[c].solid, transparency: 25 }, line: { color: PLAY[c].solid, width: 0, transparency: 25 } }),
      );
      s.addImage({ path: LOGO_DARK, x: 1.0, y: 0.55, w: 0.7 * LOGO_RATIO, h: 0.7 });
      if (islamicSubject) s.addText("بسم الله الرحمن الرحيم", { x: 5.6, y: 0.6, w: 4.8, h: 0.6, fontFace: ARABIC_FONT, fontSize: 24, color: GOLD_DARK, align: "right", rtlMode: true });
      const chip = `Mission ${lesson.n} · ${file.subject} · ${ctx.yearLabel}`;
      const chipW = Math.min(7.6, 0.6 + (chip.length * 18 * 0.5) / 72);
      s.addShape("roundRect", { x: 1.0, y: 1.75, w: chipW, h: 0.55, rectRadius: 0.27, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addText(chip, { x: 1.0, y: 1.75, w: chipW, h: 0.55, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      s.addText(lesson.title, { x: 1.0, y: 2.55, w: 7.6, h: 2.6, fontFace: FONT, fontSize: fitSize(lesson.title, 7.6, 2.5, 56, 30), bold: true, color: INK, valign: "top" });
      khatam(s, 9.0, 1.9, 3.0);
      s.addShape("roundRect", { x: 8.75, y: 5.1, w: 3.5, h: 0.8, rectRadius: 0.4, fill: { color: "FFFFFF" }, line: { color: "F2B33D", width: 2 } });
      s.addText("Let's learn!", { x: 8.9, y: 5.1, w: 3.2, h: 0.8, fontFace: FONT, fontSize: 18, bold: true, color: INK, align: "center", valign: "middle" });
      if (ponder || !ctx.pupilUrl) s.addText(`Lesson ${lesson.n}`, { x: 1.0, y: 5.3, w: 7, h: 0.45, fontFace: FONT, fontSize: 18, color: MUTED });
      else v3.pdfLink(s, ctx, 1.0, 5.25, 7.0, false);
      v3.promiseStrip(s, ctx, 6.35, false);
    } else {
      s.background = { color: theme.dark };
      s.addShape("rect", { x: 0, y: 0, w: 0.5, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addShape("rect", { x: 0.5, y: 0, w: 0.06, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      parts.motif(s, theme, { x: 9.0, y: 1.5, w: 4.0, h: 4.75 });
      s.addImage({ path: LOGO_WHITE, x: 1.0, y: 0.6, w: 0.8 * LOGO_RATIO, h: 0.8 });
      if (islamicSubject) s.addText("بسم الله الرحمن الرحيم", { x: 7.3, y: 0.7, w: 5.5, h: 0.7, fontFace: ARABIC_FONT, fontSize: 26, color: "E3C98F", align: "right", rtlMode: true });
      const chip = band === "junior" ? `MISSION ${lesson.n}  ·  ${file.subject.toUpperCase()}  ·  ${ctx.yearLabel.toUpperCase()}` : `${file.subject.toUpperCase()}  ·  ${ctx.yearLabel.toUpperCase()}${ks4 && (file.examShort || file.exam) ? `  ·  EXAM: ${clean(file.examShort || file.exam).toUpperCase()}` : ks4 && (lesson.boardShort || lesson.board || file.boardShort || file.board) ? `  ·  ${clean(lesson.boardShort || lesson.board || file.boardShort || file.board).toUpperCase()}` : ""}`;
      s.addText(chip, { x: 1.0, y: 2.2, w: 7.9, h: 0.45, fontFace: FONT, fontSize: Math.min(16, fitSize(chip, 7.0, 0.42, 16, 9)), bold: true, color: "E3C98F", charSpacing: 3, fit: "shrink" });
      s.addText(lesson.title, { x: 1.0, y: 2.75, w: 7.8, h: 2.0, fontFace: theme.head, fontSize: fitSize(lesson.title, fw(7.8, theme.head), 2.0, 46, 22), bold: true, color: "FFFFFF", valign: "top" });
      s.addText(clean(lesson.unit), { x: 1.0, y: 4.9, w: 7.8, h: 0.5, fontFace: FONT, fontSize: fitSize(lesson.unit, 7.8, 0.5, 20, 12), color: "D9D4C7" });
      s.addText(`Lesson ${lesson.n}`, { x: 1.0, y: 5.45, w: 7.8, h: 0.4, fontFace: FONT, fontSize: 15, color: "B9B3A5" });
      if (ponder || !ctx.pupilUrl) s.addText("Tarbiyyah Global Academy  ·  A British education, rooted in faith", { x: 1.0, y: 5.9, w: 7.8, h: 0.35, fontFace: FONT, fontSize: 13, color: "B9B3A5" });
      else v3.pdfLink(s, ctx, 1.0, 5.85, 7.6, true);
      v3.promiseStrip(s, ctx, 6.5, true);
    }
    s.addNotes(`Lesson ${lesson.n}: ${clean(lesson.title)}. ${clean(lesson.unit)}. Our online class promise: cameras on, mic muted until asked, respect and kind words, stay on this lesson's window, try your best. Remind pupils of it briefly; praise those keeping it.${ctx.pupilUrl ? ` Today's lesson PDF: ${ctx.pupilUrl}` : ""}`);
  }

  // 1a. The hook: grabs attention in the first minute, before the lesson map.
  if (lesson.hook && lesson.hook.text && !ponder) S.hook = (hookSlide(pptx, ctx, lesson), slideCount);

  // 1b. The big question: the lesson's enquiry, revisited at the exit ticket.
  if (lesson.bigQuestion && ctx.enquiry && !ponder) {
    const s = pptx.addSlide();
    s.background = { color: theme.dark };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    parts.motif(s, theme, { x: 9.3, y: 0.5, w: 3.8, h: 6.5 });
    s.addText(band !== "senior" ? "TODAY'S BIG QUESTION" : "ENQUIRY QUESTION", { x: 0.9, y: 1.1, w: 8, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: "E3C98F", charSpacing: 5 });
    s.addText(clean(lesson.bigQuestion), { x: 0.9, y: 1.7, w: 8.0, h: 3.4, fontFace: theme.head, fontSize: fitSize(lesson.bigQuestion, fw(8.0, theme.head), 3.4, 42, 20), bold: true, color: "FFFFFF", valign: "middle" });
    if (lesson.crossCurricular) {
      s.addShape("line", { x: 0.9, y: 5.45, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
      s.addText([{ text: "LINKS  ", options: { bold: true, color: "E3C98F", charSpacing: 2 } }, { text: clean(lesson.crossCurricular), options: { color: "D9D4C7" } }], { x: 0.9, y: 5.6, w: 8.0, h: 0.9, fontFace: FONT, fontSize: fitSize(lesson.crossCurricular, 7.0, 0.9, 16, 11), valign: "top" });
    }
    s.addNotes(`Read the question aloud and take two or three first ideas. Do not answer it yet: pupils return to it at the exit ticket, which is where progress is evidenced.${lesson.smsc ? ` SMSC: ${clean(lesson.smsc)}` : ""}`);
  }

  // 1c. Lessons v3: the Islamic foundation, then one objective (the destination) and its steps.
  if (lesson.islamicLink && lesson.islamicLink.text && lesson.islamicLink.at !== "end") S.islamicStart = (v3.islamicSlide(pptx, ctx, lesson.islamicLink), slideCount);
  S.objectives = (v3.destinationSlide(pptx, ctx, lesson), slideCount);

  // 1d. Lesson map: every stage of the lesson, each one a link to its first slide (not in the pupil PDF).
  if (!pupil) {
    const s = pptx.addSlide();
    ctx.rec.agenda = slideCount;
    const dark = band !== "early";
    s.background = { color: band === "early" ? "FFFBF3" : CREAM };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    s.addText(band === "early" ? "OUR LESSON" : "LESSON MAP", { x: 0.8, y: 0.45, w: 8, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: ctx.accent, charSpacing: 4 });
    s.addText(clean(lesson.title), { x: 0.8, y: 0.85, w: 11.7, h: 0.9, fontFace: dark ? theme.head : FONT, fontSize: fitSize(lesson.title, fw(11.7, dark ? theme.head : FONT), 0.9, 32, 20), bold: true, color: INK, valign: "middle" });
    s.addText("Click a stage to jump to it. Use “Lesson map” at the bottom of any slide to come back.", { x: 0.8, y: 1.75, w: 11.7, h: 0.35, fontFace: FONT, fontSize: 13, color: MUTED });
    const labels = B.stages;
    const rows = [];
    if (ctx.nav?.objectives || true) rows.push({ label: B.objectivesTitle, sub: "What we are learning", target: ctx.nav?.objectives, n: "" });
    labels.forEach((l, i) => rows.push({ label: l, sub: ctx.nav?.stageTitle?.[i] || "", target: ctx.nav?.stage?.[i], n: String(i + 1) }));
    if (lesson.homework) rows.push({ label: B.homeworkKicker, sub: "Home learning and next lesson", target: ctx.nav?.close, n: "" });
    const top = 2.3;
    const rowH = Math.min(0.62, 4.5 / rows.length);
    rows.forEach((r, i) => {
      const y = top + i * (rowH + 0.06);
      s.addShape("roundRect", { x: 0.8, y, w: 11.7, h: rowH, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 } });
      s.addShape("ellipse", { x: 1.0, y: y + (rowH - 0.38) / 2, w: 0.38, h: 0.38, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addText(r.n || "•", { x: 1.0, y: y + (rowH - 0.38) / 2, w: 0.38, h: 0.38, fontFace: FONT, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      const lab = r.target ? [{ text: r.label, options: { bold: true, color: ctx.accent, hyperlink: { slide: r.target, tooltip: `Go to: ${r.label}` } } }] : [{ text: r.label, options: { bold: true, color: ctx.accent } }];
      s.addText(lab, { x: 1.6, y, w: 3.0, h: rowH, fontFace: FONT, fontSize: 18, valign: "middle" });
      s.addText(clean(r.sub), { x: 4.7, y, w: 7.6, h: rowH, fontFace: FONT, fontSize: fitSize(r.sub || " ", 7.6, rowH, 16, 11), color: INK, valign: "middle", fit: "shrink" });
    });
    s.addNotes("Show the lesson map at the start so pupils can see the journey. Each stage name is a link: use it to jump, for example straight to the independent task. The Lesson map link at the bottom of every slide returns here.");
  }

  // 3. Key words -------------------------------------------------------------
  if (keywords.length) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, B.wordsTitle, B.wordsKicker, null);
    const words = keywords.slice(0, band === "early" ? 4 : 6);
    // Lessons v3: a picture of a key word goes in that word's card (else the next card without one).
    const kwPics = pics.filter((p) => p.for === "keywords");
    const cardPic = new Map();
    for (const p of kwPics) {
      const txt = `${p.alt} ${p.find}`.toLowerCase();
      const i = words.findIndex((k, j) => !cardPic.has(j) && txt.includes(clean(k.term).toLowerCase()));
      const j = i >= 0 ? i : words.findIndex((k, j2) => !cardPic.has(j2));
      if (j >= 0) cardPic.set(j, p);
    }
    const cols = words.length <= 2 ? words.length : words.length <= 4 ? 2 : 3;
    const rows = Math.ceil(words.length / cols);
    const gap = 0.25;
    const cardW = (11.8 - gap * (cols - 1)) / cols;
    const h = (4.7 - gap * (rows - 1)) / rows;
    words.forEach((k, i) => {
      const x = 0.8 + (i % cols) * (cardW + gap);
      const y = 2.1 + Math.floor(i / cols) * (h + gap);
      let w = cardW;
      const p = PLAY[i % PLAY.length];
      const edge = band === "early" ? p.solid : ctx.accent;
      s.addShape("roundRect", { x, y, w: cardW, h, rectRadius: 0.14, fill: { color: band === "early" ? p.tint : "FFFFFF" }, line: { color: band === "senior" ? LINE : edge, width: band === "senior" ? 1 : 2 } });
      s.addShape("rect", { x, y: y + 0.18, w: 0.1, h: h - 0.36, fill: { color: edge }, line: { color: edge, width: 0 } });
      const termH = band === "early" ? h * 0.48 : 0.75;
      const pic = cardPic.get(i);
      const pw = pic ? Math.min(w * 0.42, (h - 0.2) * 1.5) : 0;
      if (pic) v3.keywordCardPicture(s, pic, x + w - pw - 0.12, y + 0.1, pw, h - 0.2);
      w -= pw ? pw + 0.15 : 0;
      s.addText(clean(k.term), { x: x + 0.35, y: y + 0.12, w: w - 0.6, h: termH, fontFace: FONT, fontSize: fitSize(k.term, w - 0.6, termH, band === "early" ? 44 : 28, 11), bold: true, color: band === "early" ? INK : ctx.accent, valign: "middle" });
      s.addText(clean(k.def), { x: x + 0.35, y: y + 0.12 + termH, w: w - 0.6, h: h - termH - 0.25, fontFace: FONT, fontSize: fitSize(k.def, w - 0.6, h - termH - 0.25, band === "early" ? 24 : 20, 12), color: band === "early" ? MUTED : INK, valign: "top" });
    });
    s.addNotes(band === "early" ? "Say each word slowly, clap the syllables, and have the children say it back three times." : band === "junior" ? "Read each word aloud. Ask pupils to use one of them in a sentence during the lesson." : "Pupils should use this vocabulary precisely in written answers. Check pronunciation and spelling.");
  }

  if (quran) tajweedKeySlide(pptx, ctx);

  /** Lessons v3: a poll slide (and, for the teacher's deck, its answer slide) for each item. */
  function pollSlides(items, section, title, stage) {
    items.forEach((x, i) => {
      const poll = itemOptions(x);
      const at = (v3.pollSlide(pptx, ctx, poll, { title, kicker: `${title} · Teams poll${items.length > 1 ? ` ${i + 1} of ${items.length}` : ""}`, stage, mins: phaseMinutes(section, [x], duration), answer: itemA(x) }), slideCount);
      if (section === "starter" && S.starter == null) S.starter = at;
      if (section === "exit" && S.exit == null) S.exit = at;
      // An assessment shows no answers in the lesson: poll answers go to the teacher-only section at the end.
      if (A && !pupil && itemA(x)) A.polls.push({ poll, kicker: `${title} · poll answer`, answer: itemA(x) });
      const answerAt = !pupil && !A && itemA(x) ? (v3.pollAnswerSlide(pptx, ctx, poll, { kicker: `${title} · poll answer`, stage, answer: itemA(x) }), slideCount) : null;
      S.polls.push({ section, q: poll.q, options: poll.options, answer: itemA(x), slide: at, answerSlide: answerAt });
    });
  }

  // 4. Starter ---------------------------------------------------------------
  // A Teams poll starter: each question with options gets its own poll slide and answer slide;
  // any other questions go on the usual starter slide first.
  const starterAll = (lesson.starter || []).slice(0, 4);
  const starterPolls = routineFor(lesson, "starter") === "teams-poll" ? starterAll.filter((x) => itemOptions(x)) : [];
  const starterRest = starterAll.filter((x) => !starterPolls.includes(x));
  if (starterRest.length) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.starter = slideCount;
    const items = starterRest;
    const mins = phaseMinutes("starter", items, duration);
    const routine = starterPolls.length ? "show-me" : routineFor(lesson, "starter");
    header(s, ctx, B.starterTitle, B.starterKicker, 0, mins, routine);
    if (band === "early") {
      khatam(s, 0.9, 2.5, 2.4);
      stackedCards(s, ctx, items, { x: 3.7, y: 2.15, w: 8.9, h: 4.65 });
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 4.2 });
      const how = ROUTINES[routine] ? ROUTINES[routine].how : "Have a go on your whiteboard, then we check together.";
      s.addText(band === "senior" ? `From memory, in silence, no notes. ${how}` : how, { x: 0.8, y: 6.45, w: 11.8, h: 0.4, fontFace: FONT, fontSize: 15, italic: true, color: MUTED });
    }
    s.addNotes(`${band === "early" ? "Keep it warm and lively: greet each child by name. Praise every try." : `Pupils answer from memory, without notes. About ${mins} minutes. Then reveal and correct misconceptions.`}${ROUTINES[routine] ? ` Routine: ${ROUTINES[routine].label}. ${ROUTINES[routine].how}` : ""}`);
    if (hasAnswers(items) && !pupil && !A) S.starterAnswers = (answersSlide(pptx, ctx, items, { kicker: `${B.starterTitle} · answers`, stage: 0 }), slideCount);
  }
  pollSlides(starterPolls, "starter", B.starterTitle, 0);

  // 5. Teach slides ----------------------------------------------------------
  teach.forEach((t, i) => {
    const pic = picFor(`teach:${i + 1}`);
    const hasBlock = BLOCKS_IN(t);
    // A picture for a slide with a block gets its own "Look closely" slide first (no room beside the block).
    if (pic && hasBlock) (S.pictures = S.pictures || []).push((v3.pictureSlide(pptx, ctx, pic, t.heading, t.check ? 2 : 1), slideCount));
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.teach.push(slideCount);
    const terms = v3.termsIn(t, keywords).slice(0, 3);
    const blockKicker = t.model ? "I do · worked example" : t.check ? "Check for understanding" : t.misconception ? "Common mistake" : t.quote ? "Read closely" : t.code ? "Read the code" : t.chart ? "Read the chart" : t.numberline ? "Number line" : t.fraction ? "Fractions" : t.diagram ? "Concept map" : t.sort ? "Card sort" : null;
    const kicker = band === "early" ? "Let's learn" : blockKicker ? `${blockKicker} · ${i + 1} of ${teach.length}` : band === "junior" ? `Learn · part ${i + 1} of ${teach.length}` : `Explain · ${i + 1} of ${teach.length}`;
    const routine = ROUTINES[t.routine] ? t.routine : t.check ? routineFor(lesson, "hinge") : routineFor(lesson, "teach");
    header(s, ctx, clean(t.heading), kicker, t.check ? 2 : 1, null, routine, terms);
    const blockBullets = (t.bullets || []).map(clean).filter(Boolean);
    ctx.slideRoutine = routine;
    const kwNote = terms.length ? `\n\nKey words on this slide: ${terms.map((k) => `${clean(k.term)} (${clean(k.def)})`).join("; ")}.` : "";
    if (parts.renderBlock(s, ctx, t, blockBullets, { x: 0.8, y: 2.15, w: 11.8, h: 4.7 })) {
      s.addNotes(clean(t.note) + parts.blockNotes(t) + (ROUTINES[routine] ? `\n\nRoutine: ${ROUTINES[routine].label}. ${ROUTINES[routine].how}` : "") + kwNote);
      // A hinge question run as a Teams poll: the answer slide follows (not in the pupil PDF).
      if (t.check && routine === "teams-poll" && !pupil && A) A.polls.push({ poll: { q: t.check.q, options: (t.check.options || []).map(String) }, kicker: "Hinge question · poll answer", index: Number(t.check.answer), why: t.check.why });
      else if (t.check && routine === "teams-poll" && !pupil) {
        const poll = { q: t.check.q, options: (t.check.options || []).map(String) };
        S.polls.push({ section: "hinge", q: poll.q, options: poll.options, answer: `${"ABCD"[Number(t.check.answer)]}) ${clean(poll.options[Number(t.check.answer)])}`, slide: slideCount, answerSlide: (v3.pollAnswerSlide(pptx, ctx, poll, { kicker: "Hinge question · poll answer", stage: 2, index: Number(t.check.answer), why: t.check.why }), slideCount) });
      }
      if (!pupil && !quran && band !== "senior" && i === Math.min(1, teach.length - 2)) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
      return;
    }
    const rawBullets = blockBullets;
    const numbered = rawBullets.filter((b) => /^\d+\s*[.)]/.test(b)).length >= 2;
    const bullets = numbered ? rawBullets.map(unnumber) : rawBullets;
    const q = questionFrom(t.note);
    const kw = keywords.find((k) => bullets.some((b) => b.toLowerCase().includes(clean(k.term).toLowerCase())) || clean(t.heading).toLowerCase().includes(clean(k.term).toLowerCase()));
    // Qur'an decks: when the teacher note quotes the Arabic, show it big on the slide.
    const ar = quran ? (String(t.note || "").match(/[؀-ۿݐ-ݿ][؀-ۿݐ-ݿً-ٰٟ\s،؛؟]{10,}/) || [])[0] : null;
    const withBubble = !!q && !ar;
    // Lessons v3: a picture for this slide sits on the right; the layout takes the rest.
    const sidePic = pic && !ar ? pic : null;
    const area = { x: 0.8, y: 2.15, w: sidePic ? 8.15 : 11.8, h: withBubble ? 3.45 : 4.65 };
    if (sidePic) v3.picture(s, sidePic, { x: 9.2, y: 2.15, w: 3.4, h: area.h });
    if (ar) {
      layoutSpotlight(s, ctx, bullets, { ...area, h: 2.5 });
      s.addShape("roundRect", { x: 0.8, y: 4.85, w: 11.8, h: 1.95, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: GOLD, width: 1.5 } });
      s.addText(clean(ar), { x: 1.0, y: 4.9, w: 11.4, h: 1.85, fontFace: ARABIC_FONT, fontSize: fitSize(ar, 11.4, 1.85, 40, 22), color: EMERALD, align: "center", valign: "middle", rtlMode: true });
    } else {
      const layout = numbered && bullets.length >= 2 && bullets.length <= 5 ? "steps" : chooseLayout(ctx, { ...t, bullets }, i);
      if (layout === "cards") layoutCards(s, ctx, bullets, area);
      else if (layout === "steps") layoutSteps(s, ctx, bullets, area);
      else if (layout === "split") layoutSplit(s, ctx, bullets, area, ctx.band === "early" ? null : kw);
      else layoutSpotlight(s, ctx, bullets, area);
    }
    if (withBubble) {
      if (band === "early") {
        khatam(s, 0.85, 5.75, 1.2);
        bubble(s, ctx, q, { x: 2.3, y: 5.8, w: 10.3, h: 1.05 });
      } else {
        bubble(s, ctx, q, { x: 0.8, y: 5.8, w: 11.8, h: 1.05 }, band === "junior" ? "Think about it" : "Think · pair · share");
      }
    }
    s.addNotes(clean(t.note) + (ROUTINES[routine] ? `\n\nRoutine: ${ROUTINES[routine].label}. ${ROUTINES[routine].how}` : "") + kwNote + (sidePic ? `\n\nPicture: ${clean(sidePic.alt)}. ${v3.creditLine(sidePic)}.` : ""));
    if (pupil) return; // no movement breaks in the pupil PDF
    if (quran && teach.length >= 4 && i === 1) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
    else if (!quran && band !== "senior" && i === Math.min(1, teach.length - 2)) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
  });

  // 6. Guided practice ---------------------------------------------------------
  // Lessons v3: when item 1 has the teacher's model, it is shown first ("I do"), then "We do".
  {
    const all = (lesson.practice || []).slice(0, 5);
    const modelled = itemModel(all[0]);
    if (modelled) S.iDo = (v3.modelSlide(pptx, ctx, all[0], { title: band === "early" ? "Watch me first!" : "I do: watch the model", kicker: `${B.practiceKicker} · I do`, stage: 2, next: "then pupils try the next ones with you" }), slideCount);
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.guided = slideCount;
    const items = modelled && all.length > 1 ? all.slice(1) : all;
    const routine = routineFor(lesson, "practice");
    header(s, ctx, modelled && band === "senior" ? "We do: guided practice" : B.practiceTitle, modelled ? `${B.practiceKicker} · We do` : B.practiceKicker, 2, phaseMinutes("practice", items, duration), routine);
    if (band === "senior") {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 3.75 });
      if (routine === "think-pair-share")
        ["Think on your own", "Pair: compare answers", "Share with the class"].forEach((label, i) => {
          const x = 0.8 + i * 3.95;
          s.addShape(i === 0 ? "homePlate" : "chevron", { x, y: 6.1, w: 3.9, h: 0.7, fill: { color: ctx.accent, transparency: i * 18 }, line: { color: ctx.accent, width: 0 } });
          s.addText(label, { x: x + 0.3, y: 6.1, w: 3.3, h: 0.7, fontFace: FONT, fontSize: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        });
      else routineStrip(s, ctx, routine, 6.15, 0.65);
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: band === "early" ? 8.9 : 11.8, h: 4.65 });
      if (band === "early") {
        khatam(s, 10.0, 2.6, 2.4);
        s.addText("Say it together!", { x: 9.75, y: 5.2, w: 2.9, h: 0.6, fontFace: FONT, fontSize: 20, bold: true, color: GOLD_DARK, align: "center" });
      }
    }
    s.addNotes(`Work through these with the class, modelling your thinking aloud. Check every pupil before moving on.${ROUTINES[routine] ? ` Routine: ${ROUTINES[routine].label}. ${ROUTINES[routine].how}` : ""}`);
    if (hasAnswers(items) && !pupil && !A) S.guidedAnswers = (answersSlide(pptx, ctx, items, { kicker: `${B.practiceKicker} · answers`, stage: 2 }), slideCount);
  }

  if (quran && !pupil) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);

  // 7. Independent -------------------------------------------------------------
  // 7a. An assessment: the exam conditions and timer, then the questions with their marks.
  if (A) {
    S.examConditions = (v3.examConditionsSlide(pptx, ctx, lesson, A), slideCount);
    S.assessment = v3.assessmentQuestionSlides(pptx, ctx, A, () => slideCount);
    S.independent = S.assessment[0] || S.examConditions;
  } else {
    const items = (lesson.independent || []).slice(0, 4);
    // Lessons v3: the teacher goes through task 1 first.
    if (itemModel(items[0])) S.indModel = (v3.modelSlide(pptx, ctx, items[0], { title: band === "early" ? "Let's do number 1 together" : "Task 1: watch it done first", kicker: `${B.independentKicker} · task 1 modelled`, stage: 3, next: "then pupils carry on with the tasks on their own" }), slideCount);
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const tiered = items.length >= 3;
    S.independent = slideCount;
    const routine = routineFor(lesson, "independent");
    header(s, ctx, B.independentTitle, B.independentKicker, 3, phaseMinutes("independent", items, duration), routine);
    if (tiered) {
      const tiers =
        band !== "senior"
          ? [{ name: "Bronze", c: "A86A33" }, { name: "Silver", c: "7F8790" }, { name: "Gold", c: "B08E45" }]
          : [{ name: "Core", c: ctx.accent }, { name: "Extend", c: TEAL }, { name: "Stretch", c: GOLD_DARK }];
      const groups = [[items[0]], [items[1]], items.slice(2)];
      const w = (11.8 - 0.3 * 2) / 3;
      groups.forEach((g, i) => {
        const x = 0.8 + i * (w + 0.3);
        const tier = tiers[i];
        const early = band === "early";
        s.addShape("roundRect", { x, y: 2.15, w, h: 4.65, rectRadius: early ? 0.3 : 0.12, fill: { color: "FFFFFF" }, line: { color: tier.c, width: early ? 3 : 2 } });
        if (early) s.addShape("roundRect", { x, y: 2.15, w, h: 0.85, rectRadius: 0.3, fill: { color: tier.c }, line: { color: tier.c, width: 0 } });
        else s.addShape("rect", { x, y: 2.15, w, h: 0.75, fill: { color: tier.c }, line: { color: tier.c, width: 0 } });
        if (early) for (let k = 0; k <= i; k++) s.addShape("star5", { x: x + w - 0.6 - k * 0.45, y: 2.35, w: 0.42, h: 0.42, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
        if (band === "junior") s.addShape("star8", { x: x + 0.2, y: 2.27, w: 0.5, h: 0.5, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
        if (band === "junior") s.addText(i === 0 ? "Good start" : i === 1 ? "Push yourself" : "Super challenge", { x: x + 0.8, y: 2.15, w: w - 1.0, h: 0.75, fontFace: FONT, fontSize: 13, color: "FFFFFF", align: "right", valign: "middle" });
        s.addText(tier.name, { x: x + (band === "junior" ? 0.8 : 0.3), y: 2.15, w: w - 1, h: early ? 0.85 : 0.75, fontFace: FONT, fontSize: early ? 26 : 22, bold: true, color: "FFFFFF", valign: "middle" });
        // Tasks sometimes start with their own level ("Stretch: …"); the column already says it.
        const text = g.map((x) => clean(itemQ(x)).replace(/^(core|extend|extension|stretch|challenge|bronze|silver|gold|easy|medium|hard)\s*[:\-–]\s*/i, ""));
        s.addText(
          text.map((t2) => ({ text: t2, options: { breakLine: true, paraSpaceAfter: 10 } })),
          { x: x + 0.25, y: early ? 3.15 : 3.05, w: w - 0.5, h: early ? 3.5 : 3.6, fontFace: FONT, fontSize: fitSize(text, w - 0.5, early ? 3.5 : 3.6, B.cardMax, B.bodyMin, 10), color: INK, valign: "top" },
        );
      });
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 4.65 });
    }
    s.addNotes(`${tiered ? "Pupils choose a starting level; most should reach the middle column. " : ""}${ROUTINES[routine] ? `Routine: ${ROUTINES[routine].label}. ${ROUTINES[routine].how} ` : ""}${lesson.send ? `Adaptation (SEND / EAL / stretch): ${clean(lesson.send)}` : ""}`.trim());
    if (hasAnswers(items) && !pupil) {
      const names = tiered ? (band === "senior" ? ["Core", "Extend", "Stretch", "Stretch"] : ["Bronze", "Silver", "Gold", "Gold"]) : null;
      S.independentAnswers = (answersSlide(pptx, ctx, items, { kicker: `${band === "senior" ? "Independent practice" : B.independentKicker} · answers`, stage: 3, labels: names }), slideCount);
    }
  }

  // 7b. Connect it ----------------------------------------------------------------
  {
    const yearKey = path.basename(file.path, ".json");
    const hub = (HUBS_BY_LESSON.get(`${subjectSlug}/${yearKey}/${lesson.n}`) || [])[0];
    const links = (lesson.crossCurricular ? clean(lesson.crossCurricular).split(/;\s*/) : []).filter(Boolean).slice(0, 3).map((t) => {
      const m = t.match(/^([^:]{2,30}):\s*(.+)$/);
      return m ? { head: m[1], text: m[2] } : { head: "Link", text: t };
    });
    const cards = hub ? hub.others.slice(0, 3).map((n) => ({ head: n.subject, text: n.note })) : links;
    if (ctx.enquiry && cards.length) {
      const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
      header(s, ctx, "Where else will you meet this idea?", "Connect it", 3);
      let y = 2.15;
      if (hub) {
        s.addShape("roundRect", { x: 0.8, y, w: 11.8, h: 1.1, rectRadius: 0.12, fill: { color: theme.dark }, line: { color: theme.dark, width: 0 } });
        s.addText([{ text: "BIG IDEA   ", options: { bold: true, color: "E3C98F", fontSize: 12, charSpacing: 2 } }, { text: clean(hub.title), options: { bold: true, color: "FFFFFF", fontSize: 22, breakLine: true } }, { text: clean(hub.hook), options: { color: "E8E4D8", fontSize: 14 } }], { x: 1.05, y, w: 11.3, h: 1.1, fontFace: FONT, valign: "middle", fit: "shrink" });
        y += 1.3;
      }
      const n = cards.length;
      const gap = 0.3;
      const w = Math.min(n === 1 ? 7.6 : 5.9, (11.8 - gap * (n - 1)) / n);
      // Cards as tall as their text needs (not a short line in a big empty box), the group centred.
      const maxH = hub ? 2.3 : 3.6;
      const size = Math.min(...cards.map((c) => fitSize(clean(c.text), w - 0.5, maxH - 0.92, band === "early" ? 26 : 24, 13)));
      const need = Math.max(...cards.map((c) => textHeight(clean(c.text), w - 0.5, size)));
      const h = Math.min(maxH, Math.max(1.9, 0.62 + need + 0.5));
      if (!hub) y += Math.max(0, (4.7 - (h + 0.25 + 0.8)) / 2);
      const x0 = 0.8 + (11.8 - (w * n + gap * (n - 1))) / 2;
      cards.forEach((c, i) => {
        const x = x0 + i * (w + gap);
        s.addShape("roundRect", { x, y, w, h, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2 } });
        s.addShape("rect", { x, y, w, h: 0.62, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
        s.addText(clean(c.head), { x: x + 0.25, y, w: w - 0.5, h: 0.62, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", valign: "middle" });
        s.addText(clean(c.text), { x: x + 0.25, y: y + 0.66, w: w - 0.5, h: h - 0.8, fontFace: FONT, fontSize: size, color: INK, valign: "middle" });
      });
      y += h + 0.25;
      s.addShape("roundRect", { x: 0.8, y, w: 11.8, h: Math.min(0.8, 6.85 - y), rectRadius: 0.1, fill: { color: "FBF3DC" }, line: { color: GOLD, width: 1.5 } });
      s.addText([{ text: "YOUR CHALLENGE   ", options: { bold: true, color: GOLD_DARK, fontSize: 12, charSpacing: 2 } }, { text: hub ? "Tell a partner one fact from each subject, then say how they fit together." : "Pick one link and explain in two sentences how today's idea shows up there.", options: { color: INK } }], { x: 1.05, y, w: 11.3, h: Math.min(0.8, 6.85 - y), fontFace: FONT, fontSize: 15, valign: "middle" });
      s.addNotes(`Connections make ideas stick. ${hub ? `Hub: ${clean(hub.title)}. ` : ""}Give pupils a minute to talk, then take two or three examples. Ask: where else have you met this?`);
    }
  }

  // 8. Exit -------------------------------------------------------------------
  const exitAll = (lesson.exit || []).slice(0, 3);
  const exitPolls = routineFor(lesson, "exit") === "teams-poll" ? exitAll.filter((x) => itemOptions(x)) : [];
  const exitRest = exitAll.filter((x) => !exitPolls.includes(x));
  pollSlides(exitPolls, "exit", band === "early" ? "Let's vote!" : B.exitTitle, 4);
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    if (S.exit == null) S.exit = slideCount;
    S.exitMain = slideCount;
    const items = exitRest;
    const routine = exitPolls.length ? "chat-waterfall" : routineFor(lesson, "exit");
    header(s, ctx, B.exitTitle, B.exitKicker, 4, phaseMinutes("exit", items, duration), routine);
    const bq = ctx.enquiry && (lesson.bigQuestion || ponder) ? clean(lesson.bigQuestion || ponder.text) : null;
    if (items.length) stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: bq ? 2.6 : 3.3 }, { maxH: 1.3 });
    else if (!bq) s.addText("Look back at today's objective and the steps. Which step have you reached?", { x: 0.8, y: 2.6, w: 11.8, h: 1.6, fontFace: FONT, fontSize: 26, bold: true, color: INK, valign: "middle" });
    if (bq) {
      s.addShape("roundRect", { x: 0.8, y: 4.88, w: 11.8, h: 0.6, rectRadius: 0.1, fill: { color: theme.dark }, line: { color: theme.dark, width: 0 } });
      s.addText([{ text: lesson.bigQuestion ? "BACK TO THE BIG QUESTION   " : "BACK TO OUR PONDER QUESTION   ", options: { bold: true, color: "E3C98F", fontSize: 12, charSpacing: 2 } }, { text: bq, options: { color: "FFFFFF" } }], { x: 1.05, y: 4.88, w: 11.4, h: 0.6, fontFace: FONT, fontSize: fitSize(bq, 8.5, 0.6, 17, 10), valign: "middle" });
    }
    const labels = band === "early" ? ["I've got it!", "Nearly there", "Help please"] : band === "junior" ? ["Confident", "Getting there", "Need more practice"] : ["Secure", "Developing", "Not yet"];
    const colors = ["3E9B57", "E0A526", "D2553F"];
    s.addText(band === "early" ? "How do you feel? Show me on your fingers: 1, 2 or 3" : "How confident are you with today's objectives?", { x: 0.8, y: 5.6, w: 11.8, h: 0.4, fontFace: FONT, fontSize: band === "early" ? 20 : 16, bold: true, color: INK });
    labels.forEach((l, i) => {
      const x = 0.8 + i * 3.95;
      s.addShape("roundRect", { x, y: 6.1, w: 3.8, h: 0.75, rectRadius: 0.2, fill: { color: colors[i], transparency: 82 }, line: { color: colors[i], width: 1.5 } });
      s.addShape("ellipse", { x: x + 0.2, y: 6.22, w: 0.5, h: 0.5, fill: { color: colors[i] }, line: { color: colors[i], width: 0 } });
      s.addText(String(i + 1), { x: x + 0.2, y: 6.22, w: 0.5, h: 0.5, fontFace: FONT, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      s.addText(l, { x: x + 0.85, y: 6.1, w: 2.85, h: 0.75, fontFace: FONT, fontSize: band === "early" ? 22 : 17, bold: true, color: INK, valign: "middle" });
    });
    s.addNotes(`${ROUTINES[routine] ? `${ROUTINES[routine].label}: ${ROUTINES[routine].how} ` : "Pupils answer in the chat or on paper. "}Then they show 1, 2 or 3 fingers for confidence. Use both to plan the start of the next lesson.${hasAnswers(items) ? " The answers are on the last slide (teacher only) and in the lesson plan." : ""}`);
  }

  // 8b. Lessons v3: the Islamic position at the end, then the unit's key words (second-to-last).
  if (lesson.islamicLink && lesson.islamicLink.text && lesson.islamicLink.at === "end") S.islamicEnd = (v3.islamicSlide(pptx, ctx, lesson.islamicLink), slideCount);
  if ((opts.unitKeywords || []).length >= 2) S.topicKeywords = (v3.topicKeywordsSlide(pptx, ctx, lesson, opts.unitKeywords, keywords.length ? [] : pics.filter((p) => p.for === "keywords")), slideCount);

  // 9. Homework + close ---------------------------------------------------------
  {
    const s = pptx.addSlide();
    S.close = slideCount;
    ctx.rec.close = slideCount;
    s.background = { color: band === "early" ? "FFFBF3" : CREAM };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    const textW = band === "early" ? 8.2 : band === "junior" ? 10.0 : 8.3;
    if (band === "senior") {
      s.addShape("roundRect", { x: 9.55, y: 0.6, w: 3.2, h: 6.2, rectRadius: 0.15, fill: { color: theme.dark }, line: { color: theme.dark, width: 0 } });
      parts.motif(s, theme, { x: 9.65, y: 0.8, w: 3.0, h: 5.8 });
    }
    if (band === "junior") {
      s.addShape("star8", { x: 11.2, y: 0.5, w: 1.5, h: 1.5, fill: { color: GOLD }, line: { color: GOLD_DARK, width: 1.5 } });
      s.addText("✓", { x: 11.2, y: 0.5, w: 1.5, h: 1.5, fontFace: "Arial", fontSize: 40, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    }
    s.addText(B.homeworkKicker.toUpperCase(), { x: 0.8, y: 0.75, w: 10, h: 0.4, fontFace: FONT, fontSize: band === "senior" ? 13 : 18, bold: true, color: ctx.accent, charSpacing: 3 });
    if (band === "junior") s.addText("Your homework", { x: 0.8, y: 1.2, w: 10, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED });
    const hw = clean(lesson.homework);
    s.addText(hw, { x: 0.8, y: 1.65, w: textW, h: 2.45, fontFace: FONT, fontSize: fitSize(hw, textW, 2.45, band === "early" ? 36 : 30, 18), bold: true, color: INK, valign: "top" });
    if (nextLesson) {
      s.addShape("roundRect", { x: 0.8, y: 4.3, w: textW, h: 0.8, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 } });
      s.addText([{ text: band === "early" ? "Next time:  " : "Next lesson:  ", options: { bold: true, color: ctx.accent } }, { text: clean(nextLesson.title), options: { color: INK } }], { x: 1.05, y: 4.3, w: textW - 0.5, h: 0.8, fontFace: FONT, fontSize: fitSize(`Next lesson: ${nextLesson.title}`, textW - 0.5, 0.8, 20, 13), valign: "middle" });
    }
    s.addText("جزاكم الله خيرا", { x: 0.8, y: 5.25, w: 8, h: 0.7, fontFace: ARABIC_FONT, fontSize: 28, color: GOLD_DARK, rtlMode: true });
    s.addText(band === "early" ? "Well done today! See you next time, in sha Allah." : "Thank you for your effort and adab today. See you next lesson, in sha Allah.", { x: 0.8, y: 5.95, w: textW, h: 0.45, fontFace: FONT, fontSize: 18, color: MUTED });
    s.addImage({ path: LOGO_DARK, x: 0.8, y: 6.55, w: 0.55 * LOGO_RATIO, h: 0.55 });
    if (band === "early") {
      khatam(s, 9.6, 1.2, 2.9);
      // Mission complete: one star for each stage of the lesson.
      for (let k = 0; k < 5; k++) s.addShape("star5", { x: 9.55 + k * 0.62, y: 4.35, w: 0.55, h: 0.55, fill: { color: "F2B33D" }, line: { color: "D99A22", width: 1 } });
      s.addText("Mission complete!", { x: 9.2, y: 5.0, w: 3.8, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: GOLD_DARK, align: "center" });
    }
    s.addNotes(lesson.send ? `SEND / EAL / stretch: ${clean(lesson.send)}` : "");
  }
  // 10. Teacher only: exit ticket answers, after the last slide so they are never shown by accident.
  // The pupil PDF ends with the worksheet instead.
  if (pupil) S.worksheetPages = v3.worksheetPages(pptx, ctx, lesson);
  else if (A) {
    // An assessment: every answer and the mark scheme, after a clear "Teacher only" divider.
    S.teacherOnly = (v3.teacherOnlyDivider(pptx, ctx, A), slideCount);
    S.markScheme = v3.markSchemeSlides(pptx, ctx, A, () => slideCount);
    const keyed = [
      [starterRest, `${B.starterTitle} answers`],
      [(lesson.practice || []).slice(0, 5), `${band === "senior" ? "Guided practice" : B.practiceKicker} answers`],
      [exitRest, "Exit ticket answers"],
    ];
    for (const [items, title] of keyed) if (hasAnswers(items)) answersSlide(pptx, ctx, items, { kicker: `Teacher only · ${A.label}`, title, teacherOnly: true });
    for (const p of A.polls) v3.pollAnswerSlide(pptx, ctx, p.poll, { kicker: `Teacher only · ${p.kicker}`, stage: null, answer: p.answer, index: p.index, why: p.why });
  } else {
    const items = exitRest;
    if (hasAnswers(items)) S.exitAnswers = (answersSlide(pptx, ctx, items, { kicker: "Teacher only · for marking", title: "Exit ticket answers", teacherOnly: true }), slideCount);
  }
  S.total = slideCount;
  return { pptx, slides: S, breaks: breaksAdded, ctx };
}

/** Lesson length when the lesson does not give one: KS1 30, KS2 45, KS3/4 50 minutes. */
function defaultDuration(year) {
  if (year === "reception" || year === "y1" || year === "y2") return 30;
  const n = Number(String(year).slice(1));
  return n >= 3 && n <= 6 ? 45 : 50;
}

function slide_circleNumber(s, x, y, d, color, label) {
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 } });
  s.addText(label, { x, y, w: d, h: d, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") && !e.name.startsWith("_") ? [p] : [];
  });
}

const manifest = [];
let built = 0;
const isRetired = retiredChecker();
// Pictures chosen from Wikimedia Commons (scripts/lessons/pictures.mjs resolve runs first in the workflow).
const PICTURES = readPictures();
let picturesPlaced = 0;
for (const f of walk(LESSONS).sort()) {
  const rel = path.relative(LESSONS, f).replace(/\.json$/, ""); // subject/year
  if (only && !rel.startsWith(only)) continue;
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const [subjectSlug, year] = rel.split(path.sep);
  const file = { ...data, year: data.year || year, path: f };
  // Retired lessons (content/retired-lessons.json) are never built, so they cannot return to the portal.
  const ordered = [...data.lessons].filter((l) => !isRetired(subjectSlug, year, l.n)).sort((a, b) => a.n - b.n);
  // The unit's key words, collected across its lessons in order (the topic keyword list).
  const unitKeywords = new Map();
  for (const l of ordered) {
    const list = unitKeywords.get(clean(l.unit)) || [];
    for (const k of l.keywords || []) if (k && k.term && !list.some((x) => clean(x.term).toLowerCase() === clean(k.term).toLowerCase())) list.push(k);
    unitKeywords.set(clean(l.unit), list);
  }
  for (const [i, lesson] of ordered.entries()) {
    if (built >= limit) break;
    if (ONLY_LESSONS && !ONLY_LESSONS.has(`${subjectSlug}/${year}/${lesson.n}`)) continue;
    const name = `${String(lesson.n).padStart(2, "0")}-${slug(lesson.title)}.pptx`;
    const dir = path.join(outDir, subjectSlug, year);
    fs.mkdirSync(dir, { recursive: true });
    const next = ordered[i + 1] || null; // the next lesson taught, even across a retired lesson's number
    const prev = ordered[i - 1] || null;
    const opts = { pics: picturesFor(lesson, PICTURES), unitKeywords: unitKeywords.get(clean(lesson.unit)) || [], pupilUrl: pupilUrlFor(subjectSlug, year, lesson.n) };
    picturesPlaced += opts.pics.length;
    // Two passes: the first records where each stage starts, the second adds the links.
    const first = buildDeck(file, lesson, next, null, opts);
    const { pptx, slides, breaks, ctx } = buildDeck(file, lesson, next, first.ctx.rec, opts);
    await pptx.writeFile({ fileName: path.join(dir, name) });
    // The pupil PDF's deck (A4, converted to PDF by the workflow): slides pupils need and a worksheet.
    const pupilName = name.replace(/\.pptx$/, "-pupil.pptx");
    const pupilDeck = buildDeck(file, lesson, next, null, { ...opts, pupil: true });
    await pupilDeck.pptx.writeFile({ fileName: path.join(dir, pupilName) });
    const planName = name.replace(/\.pptx$/, "-plan.docx");
    fs.writeFileSync(path.join(dir, planName), await buildPlan(file, lesson, { yearLabel: YEAR_LABEL(year), subjectSlug, accent: ctx.accent, band: ctx.band, duration: ctx.duration, prev, next, slides, breaks, pics: opts.pics, pupilUrl: opts.pupilUrl, assess: ctx.assess, keyQuestions: (lesson.teach || []).map((x) => questionFrom(x.note)).filter(Boolean) }));
    built++;
    manifest.push({
      subject_slug: subjectSlug,
      subject: data.subject,
      year,
      board: lesson.board || data.board || null,
      unit: lesson.unit,
      lesson_no: lesson.n,
      title: lesson.title,
      duration: lesson.duration || null,
      objectives: lesson.objectives,
      file: path.join(subjectSlug, year, name),
      plan_file: path.join(subjectSlug, year, planName),
      pupil_file: path.join(subjectSlug, year, pupilName),
    });
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`Built ${built} decks (with pupil PDF decks and plans) into ${outDir}; ${picturesPlaced} picture(s) placed`);
