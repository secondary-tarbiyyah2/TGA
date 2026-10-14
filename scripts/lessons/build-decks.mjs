// Builds branded PowerPoint decks from content/lessons/**/*.json.
//   node scripts/lessons/build-decks.mjs [outDir=out/decks] [--only=subject/year] [--limit=N]
// Output: <outDir>/<subject>/<year>/<NN>-<slug>.pptx, a teacher lesson plan
// <NN>-<slug>-plan.docx next to it, and <outDir>/manifest.json
// Requires `pptxgenjs` (devDependency). Logos come from public/brand.
//
// Each deck is designed for its age group, not one template for everyone:
//   early  (Reception–Year 2): huge text, bright friendly colours, Najm the
//          star (an original TGA character) asks the questions, word cards,
//          a movement break and a "Show me!" check.
//   junior (Years 3–6): the lesson as a mission, warm-up timer, varied
//          layouts, a brain break, bronze/silver/gold challenges.
//   senior (Years 7–11): Do now with timer, key vocabulary, think–pair–share,
//          core/extend/stretch tasks, exam board label, confidence check.
// Every deck: a lesson-journey tracker, teach slides that change layout so
// no two in a row look the same, "Think about it" questions lifted from the
// teacher's notes, and a preview of the next lesson.
//
// Text is sized here (fitSize) rather than relying on PowerPoint's autofit,
// which only kicks in after a teacher edits a box.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildPlan } from "./lesson-plan.mjs";
import { themeFor, makeParts } from "./deck-parts.mjs";

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
  if (year === "reception" || year === "y1" || year === "y2") return "early";
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
function fitSize(texts, w, h, max, min, gapPt = 8) {
  const list = (Array.isArray(texts) ? texts : [texts]).map(clean).filter(Boolean);
  for (let size = max; size > min; size -= 1) {
    const charsPerLine = Math.max(4, Math.floor((w * 72 - 16) / (size * 0.48)));
    let lines = 0;
    for (const t of list) {
      // Word-wrap estimate.
      let line = 0;
      let count = 1;
      for (const word of t.split(" ")) {
        const len = word.length + (line ? 1 : 0);
        if (line + len > charsPerLine && line > 0) {
          count++;
          line = word.length;
        } else line += len;
      }
      lines += count;
    }
    const need = (lines * size * 1.17 + (list.length - 1) * gapPt + 10) / 72;
    if (need <= h) return size;
  }
  return min;
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
    slide.addShape("ellipse", { x, y: 0.35, w: 0.24, h: 0.24, fill: { color: on ? ctx.accent : done ? GOLD : "FFFFFF" }, line: { color: on ? ctx.accent : done ? GOLD : "C9C2B3", width: 1.5 } });
    slide.addText(label, { x: x - 0.4, y: 0.6, w: 1.05, h: 0.26, fontFace: FONT, fontSize: 10, bold: on, color: on ? ctx.accent : MUTED, align: "center" });
  });
}

function header(slide, ctx, title, kicker, stage, minutes) {
  const B = BAND[ctx.band];
  slide.background = { color: ctx.band === "early" ? "FFFBF3" : "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.05, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
  if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.8, y: 0.3, w: 6.2, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3 });
  const titleW = minutes ? 9.9 : 11.9;
  const size = fitSize(title, ctx.band === "early" ? titleW : fw(titleW, ctx.theme.head), 0.95, B.titleSize, 20);
  slide.addText(clean(title), { x: 0.8, y: 0.85, w: titleW, h: 0.95, fontFace: ctx.band === "early" ? FONT : ctx.theme.head, fontSize: size, bold: true, color: INK, valign: "middle" });
  if (minutes) {
    slide.addShape("roundRect", { x: 10.9, y: 1.0, w: 1.7, h: 0.66, rectRadius: 0.33, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2.5 } });
    slide.addShape("ellipse", { x: 11.02, y: 1.11, w: 0.44, h: 0.44, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2 } });
    slide.addShape("line", { x: 11.24, y: 1.17, w: 0, h: 0.16, line: { color: ctx.accent, width: 2 } });
    slide.addShape("line", { x: 11.24, y: 1.33, w: 0.1, h: 0.0, line: { color: ctx.accent, width: 2 } });
    slide.addText(`${minutes} min`, { x: 11.5, y: 1.0, w: 1.05, h: 0.66, fontFace: FONT, fontSize: 18, bold: true, color: ctx.accent, valign: "middle" });
  }
  slide.addShape("line", { x: 0.8, y: 1.85, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
  tracker(slide, ctx, stage);
}

/** Original TGA character for the youngest: Najm, a smiling eight-point star. */
function najm(slide, x, y, size) {
  slide.addShape("star8", { x, y, w: size, h: size, fill: { color: "F2B33D" }, line: { color: "D99A22", width: 1.5 } });
  const e = size * 0.09;
  slide.addShape("ellipse", { x: x + size * 0.36 - e / 2, y: y + size * 0.4, w: e, h: e * 1.25, fill: { color: INK }, line: { color: INK, width: 0 } });
  slide.addShape("ellipse", { x: x + size * 0.64 - e / 2, y: y + size * 0.4, w: e, h: e * 1.25, fill: { color: INK }, line: { color: INK, width: 0 } });
  slide.addShape("blockArc", { x: x + size * 0.36, y: y + size * 0.42, w: size * 0.28, h: size * 0.24, angleRange: [20, 160], arcThicknessRatio: 0.22, fill: { color: INK }, line: { color: INK, width: 0 } });
  slide.addShape("ellipse", { x: x + size * 0.24, y: y + size * 0.55, w: e * 1.2, h: e * 0.8, fill: { color: "F08A6B", transparency: 30 }, line: { color: "F08A6B", width: 0, transparency: 30 } });
  slide.addShape("ellipse", { x: x + size * 0.76 - e * 1.2, y: y + size * 0.55, w: e * 1.2, h: e * 0.8, fill: { color: "F08A6B", transparency: 30 }, line: { color: "F08A6B", width: 0, transparency: 30 } });
}

/** Speech bubble. `who` is "najm" (early) or a small label like "Think about it". */
function bubble(slide, ctx, text, box, label) {
  const B = BAND[ctx.band];
  const size = fitSize(text, box.w - 0.5, box.h - (label ? 0.55 : 0.3), ctx.band === "early" ? 30 : 22, 14);
  slide.addShape("wedgeRoundRectCallout", { ...box, fill: { color: ctx.band === "early" ? "FFFFFF" : GOLD_SOFT }, line: { color: ctx.band === "early" ? "F2B33D" : GOLD, width: 2 }, rectRadius: 0.2 });
  if (label) slide.addText(label.toUpperCase(), { x: box.x + 0.25, y: box.y + 0.12, w: box.w - 0.5, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: GOLD_DARK, charSpacing: 2 });
  slide.addText(clean(text), { x: box.x + 0.25, y: box.y + (label ? 0.42 : 0.1), w: box.w - 0.5, h: box.h - (label ? 0.55 : 0.2), fontFace: FONT, fontSize: size, bold: ctx.band === "early", color: INK, valign: "middle" });
  void B;
}

/** Numbered cards stacked vertically (questions/tasks). */
function stackedCards(slide, ctx, items, box, opts = {}) {
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
  list.forEach((b, i) => {
    const y = area.y + i * (h + gap);
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: i % 2 ? "FFFFFF" : CREAM }, line: { color: LINE, width: 0.75 } });
    slide.addShape("rect", { x: x + 0.25, y: y + h / 2 - 0.09, w: 0.18, h: 0.18, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 }, rotate: 45 });
    slide.addText(clean(b), { x: x + 0.65, y, w: w - 0.85, h, fontFace: FONT, fontSize: size, color: INK, valign: "middle" });
  });
}

function starIcon(slide, x, y, size, color) {
  slide.addShape("star8", { x, y, w: size, h: size, fill: { color }, line: { color, width: 0 } });
}

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
  { name: "Copy Najm!", steps: ["Teacher makes a shape with their body", "Copy it as fast as you can", "Freeze… and sit down slowly"] },
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
  if (early) najm(s, 9.4, 2.4, 3.0);
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

// ── The deck ───────────────────────────────────────────────────────────────
function buildDeck(file, lesson, nextLesson) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.title = `${file.subject} ${YEAR_LABEL(file.year)} – ${lesson.title}`;
  pptx.author = "Tarbiyyah Global Academy";
  pptx.company = "Tarbiyyah Global Academy";
  // Count slides as they're added so the lesson plan can point to them.
  const addSlide = pptx.addSlide.bind(pptx);
  let slideCount = 0;
  pptx.addSlide = (o) => {
    slideCount++;
    return addSlide(o);
  };
  const S = { teach: [] };
  let breaksAdded = 0;
  const subjectSlug = path.basename(path.dirname(file.path));
  const band = bandFor(file.year);
  const B = BAND[band];
  const theme = themeFor(subjectSlug);
  const ctx = { band, n: lesson.n, theme, accent: theme.accent || ACCENTS[subjectSlug] || TEAL, mathy: /^(mathematics|science|gcse-science|business)$/.test(subjectSlug), subjectLabel: file.subject, yearLabel: YEAR_LABEL(file.year) };
  const quran = subjectSlug === "quran";
  const ks4 = file.year === "y10" || file.year === "y11";
  const duration = lesson.duration || (band === "early" ? 30 : band === "junior" ? 45 : 50);
  const keywords = (lesson.keywords || []).filter((k) => k && k.term);
  const teach = lesson.teach || [];
  let breakNo = lesson.n * 3; // rotates the activities so neighbouring lessons differ
  const breaks = quran ? QURAN_BREAKS : band === "early" ? MOVE_EARLY : MOVE_JUNIOR;
  const nextBreak = () => breaks[breakNo++ % breaks.length];

  // Footer on a master so the logo is stored once in the file.
  pptx.defineSlideMaster({
    title: "TGA_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 7.05, w: W, h: 0.45, fill: { color: "FFFFFF" }, line: { color: "E5E5E5", width: 0.5 } } },
      { image: { path: LOGO_DARK, x: 0.45, y: 7.1, w: 0.34 * LOGO_RATIO, h: 0.34 } },
      { text: { text: `${ctx.subjectLabel} · ${ctx.yearLabel} · Lesson ${lesson.n}`, options: { x: 2.0, y: 7.1, w: 8, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, valign: "middle" } } },
    ],
    slideNumber: { x: 12.2, y: 7.1, w: 0.7, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, align: "right" },
  });

  // 1. Title ---------------------------------------------------------------
  {
    const s = pptx.addSlide();
    if (band === "early") {
      s.background = { color: "FFFBF3" };
      [[10.9, -1.2, 3.4, 1], [11.6, 5.6, 2.6, 2], [-0.9, 6.0, 2.4, 3], [6.4, 6.4, 1.4, 0]].forEach(([x, y, d, c]) =>
        s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: PLAY[c].solid, transparency: 25 }, line: { color: PLAY[c].solid, width: 0, transparency: 25 } }),
      );
      s.addImage({ path: LOGO_DARK, x: 1.0, y: 0.55, w: 0.7 * LOGO_RATIO, h: 0.7 });
      s.addText("بسم الله الرحمن الرحيم", { x: 5.6, y: 0.6, w: 4.8, h: 0.6, fontFace: "Arial", fontSize: 24, color: GOLD_DARK, align: "right", rtlMode: true });
      s.addShape("roundRect", { x: 1.0, y: 1.75, w: 4.4, h: 0.55, rectRadius: 0.27, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addText(`${file.subject} · ${ctx.yearLabel}`, { x: 1.0, y: 1.75, w: 4.4, h: 0.55, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      s.addText(lesson.title, { x: 1.0, y: 2.55, w: 7.6, h: 2.6, fontFace: FONT, fontSize: fitSize(lesson.title, 7.6, 2.6, 66, 36), bold: true, color: INK, valign: "top" });
      najm(s, 8.9, 2.1, 3.3);
      s.addShape("wedgeRoundRectCallout", { x: 8.6, y: 5.55, w: 3.9, h: 0.95, rectRadius: 0.2, fill: { color: "FFFFFF" }, line: { color: "F2B33D", width: 2 } });
      s.addText("Hello! I'm Najm. Let's learn!", { x: 8.75, y: 5.6, w: 3.6, h: 0.85, fontFace: FONT, fontSize: 18, bold: true, color: INK, align: "center", valign: "middle" });
      s.addText(`Lesson ${lesson.n}  ·  ${duration} minutes`, { x: 1.0, y: 5.4, w: 7, h: 0.45, fontFace: FONT, fontSize: 18, color: MUTED });
    } else {
      s.background = { color: theme.dark };
      s.addShape("rect", { x: 0, y: 0, w: 0.5, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addShape("rect", { x: 0.5, y: 0, w: 0.06, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      parts.motif(s, theme, { x: 9.0, y: 1.65, w: 4.0, h: 4.85 });
      s.addImage({ path: LOGO_WHITE, x: 1.0, y: 0.6, w: 0.8 * LOGO_RATIO, h: 0.8 });
      s.addText("بسم الله الرحمن الرحيم", { x: 7.3, y: 0.7, w: 5.5, h: 0.7, fontFace: "Arial", fontSize: 26, color: "E3C98F", align: "right", rtlMode: true });
      const chip = band === "junior" ? `MISSION ${lesson.n}  ·  ${file.subject.toUpperCase()}  ·  ${ctx.yearLabel.toUpperCase()}` : `${file.subject.toUpperCase()}  ·  ${ctx.yearLabel.toUpperCase()}${ks4 && (file.boardShort || file.board) ? `  ·  ${clean(file.boardShort || file.board).toUpperCase()}` : ""}`;
      s.addText(chip, { x: 1.0, y: 2.2, w: 7.9, h: 0.45, fontFace: FONT, fontSize: Math.min(16, fitSize(chip, 7.0, 0.42, 16, 9)), bold: true, color: "E3C98F", charSpacing: 3, fit: "shrink" });
      s.addText(lesson.title, { x: 1.0, y: 2.75, w: 7.8, h: 2.0, fontFace: theme.head, fontSize: fitSize(lesson.title, fw(7.8, theme.head), 2.0, 46, 22), bold: true, color: "FFFFFF", valign: "top" });
      s.addText(clean(lesson.unit), { x: 1.0, y: 4.9, w: 7.8, h: 0.5, fontFace: FONT, fontSize: fitSize(lesson.unit, 7.8, 0.5, 20, 12), color: "D9D4C7" });
      s.addText(`Lesson ${lesson.n}  ·  ${duration} minutes`, { x: 1.0, y: 5.45, w: 7.8, h: 0.4, fontFace: FONT, fontSize: 15, color: "B9B3A5" });
      s.addText("Tarbiyyah Global Academy  ·  A British education, rooted in faith", { x: 1.0, y: 6.7, w: 7.8, h: 0.35, fontFace: FONT, fontSize: 13, color: "B9B3A5" });
    }
    s.addNotes(`Lesson ${lesson.n}: ${clean(lesson.title)}. ${clean(lesson.unit)}.`);
  }

  // 1b. The big question: the lesson's enquiry, revisited at the exit ticket.
  if (lesson.bigQuestion && band !== "early") {
    const s = pptx.addSlide();
    s.background = { color: theme.dark };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    parts.motif(s, theme, { x: 9.3, y: 0.5, w: 3.8, h: 6.5 });
    s.addText(band === "junior" ? "TODAY'S BIG QUESTION" : "ENQUIRY QUESTION", { x: 0.9, y: 1.1, w: 8, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: "E3C98F", charSpacing: 5 });
    s.addText(clean(lesson.bigQuestion), { x: 0.9, y: 1.7, w: 8.0, h: 3.4, fontFace: theme.head, fontSize: fitSize(lesson.bigQuestion, fw(8.0, theme.head), 3.4, 42, 20), bold: true, color: "FFFFFF", valign: "middle" });
    if (lesson.crossCurricular) {
      s.addShape("line", { x: 0.9, y: 5.45, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
      s.addText([{ text: "LINKS  ", options: { bold: true, color: "E3C98F", charSpacing: 2 } }, { text: clean(lesson.crossCurricular), options: { color: "D9D4C7" } }], { x: 0.9, y: 5.6, w: 8.0, h: 0.9, fontFace: FONT, fontSize: fitSize(lesson.crossCurricular, 7.0, 0.9, 16, 11), valign: "top" });
    }
    s.addNotes(`Read the question aloud and take two or three first ideas. Do not answer it yet: pupils return to it at the exit ticket, which is where progress is evidenced.${lesson.smsc ? ` SMSC: ${clean(lesson.smsc)}` : ""}`);
  }

  // 2. Objectives ------------------------------------------------------------
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, B.objectivesTitle, B.objectivesKicker, null);
    const objs = (lesson.objectives || []).slice(0, 5);
    const area = { x: 0.8, y: 2.15, w: band === "senior" ? 8.4 : 11.8, h: 4.6 };
    const gap = 0.2;
    const h = Math.min(1.35, (area.h - gap * (objs.length - 1)) / objs.length);
    const size = Math.min(...objs.map((o) => fitSize(o, area.w - 1.3, h - 0.1, B.bodyMax - (band === "early" ? 4 : 2), B.bodyMin)));
    objs.forEach((o, i) => {
      const y = area.y + i * (h + gap);
      if (band === "early") {
        const p = PLAY[i % PLAY.length];
        slide_circleNumber(s, area.x, y + h / 2 - 0.42, 0.84, p.solid, String(i + 1));
        s.addShape("roundRect", { x: area.x + 1.1, y, w: area.w - 1.1, h, rectRadius: 0.15, fill: { color: p.tint }, line: { color: p.solid, width: 1.5 } });
      } else if (band === "junior") {
        s.addShape("roundRect", { x: area.x, y: y + h / 2 - 0.3, w: 0.6, h: 0.6, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 2.5 } });
        s.addShape("roundRect", { x: area.x + 1.1, y, w: area.w - 1.1, h, rectRadius: 0.1, fill: { color: i % 2 ? "FFFFFF" : CREAM }, line: { color: LINE, width: 0.75 } });
      } else {
        s.addText(String(i + 1).padStart(2, "0"), { x: area.x, y, w: 0.9, h, fontFace: FONT, fontSize: 28, bold: true, color: ctx.accent, valign: "middle" });
        s.addShape("line", { x: area.x + 1.1, y: y + h, w: area.w - 1.1, h: 0, line: { color: LINE, width: 1 } });
      }
      s.addText(clean(o), { x: area.x + 1.3, y, w: area.w - 1.5, h, fontFace: FONT, fontSize: size, bold: band === "early", color: INK, valign: "middle" });
    });
    const sc = (lesson.successCriteria || []).map(clean).filter(Boolean).slice(0, 3);
    if (band === "senior" && sc.length) {
      // School standard: success criteria differentiated for all / most / some.
      s.addShape("roundRect", { x: 9.6, y: 2.15, w: 3.0, h: 4.6, rectRadius: 0.12, fill: { color: theme.soft }, line: { color: theme.soft, width: 0 } });
      s.addText("SUCCESS CRITERIA", { x: 9.85, y: 2.3, w: 2.5, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: ctx.accent, charSpacing: 2 });
      const tiers = ["All", "Most", "Some"];
      const rowH = 3.85 / sc.length;
      const size = Math.min(...sc.map((x) => fitSize(x, 2.5, rowH - 0.4, 15, 10)));
      sc.forEach((x, i) => {
        const y = 2.7 + i * rowH;
        s.addShape("roundRect", { x: 9.85, y, w: 0.85, h: 0.3, rectRadius: 0.15, fill: { color: i === 0 ? ctx.accent : i === 1 ? theme.dark : GOLD_DARK }, line: { color: "FFFFFF", width: 0 } });
        s.addText(tiers[i], { x: 9.85, y, w: 0.85, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        s.addText(x, { x: 9.85, y: y + 0.33, w: 2.55, h: rowH - 0.4, fontFace: FONT, fontSize: size, color: INK, valign: "top" });
      });
    } else if (band === "senior") {
      s.addShape("roundRect", { x: 9.6, y: 2.15, w: 3.0, h: 4.6, rectRadius: 0.12, fill: { color: TEAL_SOFT }, line: { color: TEAL_SOFT, width: 0 } });
      s.addText("THE BIG PICTURE", { x: 9.85, y: 2.35, w: 2.5, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: TEAL, charSpacing: 2 });
      s.addText(clean(lesson.unit), { x: 9.85, y: 2.75, w: 2.5, h: 1.9, fontFace: FONT, fontSize: fitSize(lesson.unit, 2.5, 1.9, 20, 12), bold: true, color: INK, valign: "top" });
      s.addText(ks4 && file.board ? `Exam board: ${clean(file.boardShort || file.board)}` : `${duration}-minute lesson`, { x: 9.85, y: 4.8, w: 2.5, h: 0.4, fontFace: FONT, fontSize: 14, color: TEAL, bold: true });
      s.addText(nextLesson ? `Builds towards: ${clean(nextLesson.title)}` : "End of this sequence", { x: 9.85, y: 5.25, w: 2.5, h: 1.3, fontFace: FONT, fontSize: fitSize(nextLesson ? nextLesson.title + "Builds towards: " : "x", 2.5, 1.3, 14, 10), color: MUTED, valign: "top" });
    }
    const extras = [lesson.crossCurricular ? `Cross-curricular links: ${clean(lesson.crossCurricular)}` : "", lesson.smsc ? `SMSC: ${clean(lesson.smsc)}` : ""].filter(Boolean).join(" ");
    s.addNotes(`${band === "junior" ? "Read the mission goals together. Pupils can tick each box at the end of the lesson when they feel confident." : `Share the objectives${sc.length ? " and the success criteria: every pupil aims for 'All', most reach 'Most', some reach 'Some'" : ""}, and refer back to them at the exit ticket.`}${extras ? ` ${extras}` : ""}`);
  }

  // 3. Key words -------------------------------------------------------------
  if (keywords.length) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, B.wordsTitle, B.wordsKicker, null);
    const words = keywords.slice(0, band === "early" ? 4 : 6);
    const cols = words.length <= 2 ? words.length : words.length <= 4 ? 2 : 3;
    const rows = Math.ceil(words.length / cols);
    const gap = 0.25;
    const w = (11.8 - gap * (cols - 1)) / cols;
    const h = (4.7 - gap * (rows - 1)) / rows;
    words.forEach((k, i) => {
      const x = 0.8 + (i % cols) * (w + gap);
      const y = 2.1 + Math.floor(i / cols) * (h + gap);
      const p = PLAY[i % PLAY.length];
      const edge = band === "early" ? p.solid : ctx.accent;
      s.addShape("roundRect", { x, y, w, h, rectRadius: 0.14, fill: { color: band === "early" ? p.tint : "FFFFFF" }, line: { color: band === "senior" ? LINE : edge, width: band === "senior" ? 1 : 2 } });
      s.addShape("rect", { x, y: y + 0.18, w: 0.1, h: h - 0.36, fill: { color: edge }, line: { color: edge, width: 0 } });
      const termH = band === "early" ? h * 0.48 : 0.75;
      s.addText(clean(k.term), { x: x + 0.35, y: y + 0.12, w: w - 0.6, h: termH, fontFace: FONT, fontSize: fitSize(k.term, w - 0.6, termH, band === "early" ? 44 : 28, 16), bold: true, color: band === "early" ? INK : ctx.accent, valign: "middle" });
      s.addText(clean(k.def), { x: x + 0.35, y: y + 0.12 + termH, w: w - 0.6, h: h - termH - 0.25, fontFace: FONT, fontSize: fitSize(k.def, w - 0.6, h - termH - 0.25, band === "early" ? 24 : 20, 12), color: band === "early" ? MUTED : INK, valign: "top" });
    });
    s.addNotes(band === "early" ? "Say each word slowly, clap the syllables, and have the children say it back three times." : band === "junior" ? "Read each word aloud. Ask pupils to use one of them in a sentence during the lesson." : "Pupils should use this vocabulary precisely in written answers. Check pronunciation and spelling.");
  }

  if (quran) tajweedKeySlide(pptx, ctx);

  // 4. Starter ---------------------------------------------------------------
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.starter = slideCount;
    header(s, ctx, B.starterTitle, B.starterKicker, 0, band === "early" ? null : 5);
    const items = (lesson.starter || []).slice(0, 4);
    if (band === "early") {
      najm(s, 0.9, 2.5, 2.4);
      stackedCards(s, ctx, items, { x: 3.7, y: 2.15, w: 8.9, h: 4.65 });
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 4.2 });
      s.addText(band === "senior" ? "From memory, in silence, no notes." : "Have a go on your whiteboard, then we check together.", { x: 0.8, y: 6.45, w: 11.8, h: 0.4, fontFace: FONT, fontSize: 15, italic: true, color: MUTED });
    }
    s.addNotes(band === "early" ? "Keep it warm and lively: greet each child by name. Praise every try." : "Pupils answer from memory, without notes. About five minutes. Cold-call, then reveal and correct misconceptions.");
  }

  // 5. Teach slides ----------------------------------------------------------
  teach.forEach((t, i) => {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.teach.push(slideCount);
    const blockKicker = t.model ? "I do · worked example" : t.check ? "Check for understanding" : t.misconception ? "Common mistake" : t.quote ? "Read closely" : t.code ? "Read the code" : null;
    const kicker = band === "early" ? "Let's learn" : blockKicker ? `${blockKicker} · ${i + 1} of ${teach.length}` : band === "junior" ? `Learn · part ${i + 1} of ${teach.length}` : `Explain · ${i + 1} of ${teach.length}`;
    header(s, ctx, clean(t.heading), kicker, t.check ? 2 : 1);
    const blockBullets = (t.bullets || []).map(clean).filter(Boolean);
    if (band !== "early" && parts.renderBlock(s, ctx, t, blockBullets, { x: 0.8, y: 2.15, w: 11.8, h: 4.7 })) {
      s.addNotes(clean(t.note) + parts.blockNotes(t));
      if (!quran && band !== "senior" && i === Math.min(1, teach.length - 2)) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
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
    const area = { x: 0.8, y: 2.15, w: 11.8, h: withBubble ? 3.45 : 4.65 };
    if (ar) {
      layoutSpotlight(s, ctx, bullets, { ...area, h: 2.5 });
      s.addShape("roundRect", { x: 0.8, y: 4.85, w: 11.8, h: 1.95, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: GOLD, width: 1.5 } });
      s.addText(clean(ar), { x: 1.0, y: 4.9, w: 11.4, h: 1.85, fontFace: "Arial", fontSize: fitSize(ar, 11.4, 1.85, 40, 22), color: EMERALD, align: "center", valign: "middle", rtlMode: true });
    } else {
      const layout = numbered && bullets.length >= 2 && bullets.length <= 5 ? "steps" : chooseLayout(ctx, { ...t, bullets }, i);
      if (layout === "cards") layoutCards(s, ctx, bullets, area);
      else if (layout === "steps") layoutSteps(s, ctx, bullets, area);
      else if (layout === "split") layoutSplit(s, ctx, bullets, area, ctx.band === "early" ? null : kw);
      else layoutSpotlight(s, ctx, bullets, area);
    }
    if (withBubble) {
      if (band === "early") {
        najm(s, 0.85, 5.75, 1.2);
        bubble(s, ctx, q, { x: 2.3, y: 5.8, w: 10.3, h: 1.05 });
      } else {
        bubble(s, ctx, q, { x: 0.8, y: 5.8, w: 11.8, h: 1.05 }, band === "junior" ? "Think about it" : "Think · pair · share");
      }
    }
    s.addNotes(clean(t.note));
    if (quran && teach.length >= 4 && i === 1) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
    else if (!quran && band !== "senior" && i === Math.min(1, teach.length - 2)) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);
  });

  // 6. Guided practice ---------------------------------------------------------
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.guided = slideCount;
    header(s, ctx, B.practiceTitle, B.practiceKicker, 2);
    const items = (lesson.practice || []).slice(0, 5);
    if (band === "senior") {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 3.75 });
      ["Think on your own", "Pair: compare answers", "Share with the class"].forEach((label, i) => {
        const x = 0.8 + i * 3.95;
        s.addShape(i === 0 ? "homePlate" : "chevron", { x, y: 6.1, w: 3.9, h: 0.7, fill: { color: ctx.accent, transparency: i * 18 }, line: { color: ctx.accent, width: 0 } });
        s.addText(label, { x: x + 0.3, y: 6.1, w: 3.3, h: 0.7, fontFace: FONT, fontSize: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      });
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: band === "early" ? 8.9 : 11.8, h: 4.65 });
      if (band === "early") {
        najm(s, 10.0, 2.6, 2.4);
        s.addText("Say it with me!", { x: 9.75, y: 5.2, w: 2.9, h: 0.6, fontFace: FONT, fontSize: 20, bold: true, color: GOLD_DARK, align: "center" });
      }
    }
    s.addNotes("Work through these with the class, modelling your thinking aloud. Check every pupil (mini-whiteboards, chat or thumbs) before moving on.");
  }

  if (quran) (breakSlide(pptx, ctx, nextBreak()), breaksAdded++);

  // 7. Independent -------------------------------------------------------------
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const items = (lesson.independent || []).slice(0, 4);
    const tiered = band !== "early" && items.length >= 3;
    const mins = Math.max(5, Math.round((duration * 0.3) / 5) * 5);
    S.independent = slideCount;
    header(s, ctx, B.independentTitle, B.independentKicker, 3, band === "early" ? null : mins);
    if (tiered) {
      const tiers =
        band === "junior"
          ? [{ name: "Bronze", c: "A86A33" }, { name: "Silver", c: "7F8790" }, { name: "Gold", c: "B08E45" }]
          : [{ name: "Core", c: ctx.accent }, { name: "Extend", c: TEAL }, { name: "Stretch", c: GOLD_DARK }];
      const groups = [[items[0]], [items[1]], items.slice(2)];
      const w = (11.8 - 0.3 * 2) / 3;
      groups.forEach((g, i) => {
        const x = 0.8 + i * (w + 0.3);
        const tier = tiers[i];
        s.addShape("roundRect", { x, y: 2.15, w, h: 4.65, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { color: tier.c, width: 2 } });
        s.addShape("rect", { x, y: 2.15, w, h: 0.75, fill: { color: tier.c }, line: { color: tier.c, width: 0 } });
        if (band === "junior") s.addShape("star8", { x: x + 0.2, y: 2.27, w: 0.5, h: 0.5, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
        if (band === "junior") s.addText(i === 0 ? "Good start" : i === 1 ? "Push yourself" : "Super challenge", { x: x + 0.8, y: 2.15, w: w - 1.0, h: 0.75, fontFace: FONT, fontSize: 13, color: "FFFFFF", align: "right", valign: "middle" });
        s.addText(tier.name, { x: x + (band === "junior" ? 0.8 : 0.3), y: 2.15, w: w - 1, h: 0.75, fontFace: FONT, fontSize: 22, bold: true, color: "FFFFFF", valign: "middle" });
        // Tasks sometimes start with their own level ("Stretch: …"); the column already says it.
        const text = g.map((x) => clean(x).replace(/^(core|extend|extension|stretch|challenge|bronze|silver|gold|easy|medium|hard)\s*[:\-–]\s*/i, ""));
        s.addText(
          text.map((t2) => ({ text: t2, options: { breakLine: true, paraSpaceAfter: 10 } })),
          { x: x + 0.25, y: 3.05, w: w - 0.5, h: 3.6, fontFace: FONT, fontSize: fitSize(text, w - 0.5, 3.6, B.cardMax, B.bodyMin, 10), color: INK, valign: "top" },
        );
      });
    } else {
      stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: 4.65 });
    }
    s.addNotes(`${tiered ? "Pupils choose a starting level; most should reach the middle column. " : ""}${lesson.send ? `Adaptation (SEND / EAL / stretch): ${clean(lesson.send)}` : ""}`.trim());
  }

  // 8. Exit -------------------------------------------------------------------
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    S.exit = slideCount;
    header(s, ctx, B.exitTitle, B.exitKicker, 4);
    const items = (lesson.exit || []).slice(0, 3);
    const bq = band !== "early" && lesson.bigQuestion ? clean(lesson.bigQuestion) : null;
    stackedCards(s, ctx, items, { x: 0.8, y: 2.15, w: 11.8, h: bq ? 2.6 : 3.3 }, { maxH: 1.3 });
    if (bq) {
      s.addShape("roundRect", { x: 0.8, y: 4.88, w: 11.8, h: 0.6, rectRadius: 0.1, fill: { color: theme.dark }, line: { color: theme.dark, width: 0 } });
      s.addText([{ text: "BACK TO THE BIG QUESTION   ", options: { bold: true, color: "E3C98F", fontSize: 12, charSpacing: 2 } }, { text: bq, options: { color: "FFFFFF" } }], { x: 1.05, y: 4.88, w: 11.4, h: 0.6, fontFace: FONT, fontSize: fitSize(bq, 8.5, 0.6, 17, 10), valign: "middle" });
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
    s.addNotes("Pupils answer in the chat or on paper, then show 1, 2 or 3 fingers for confidence. Use both to plan the start of the next lesson.");
  }

  // 9. Homework + close ---------------------------------------------------------
  {
    const s = pptx.addSlide();
    S.close = slideCount;
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
    s.addText("جزاكم الله خيرا", { x: 0.8, y: 5.25, w: 8, h: 0.7, fontFace: "Arial", fontSize: 28, color: GOLD_DARK, rtlMode: true });
    s.addText(band === "early" ? "Well done today! See you next time, in sha Allah." : "Thank you for your effort and adab today. See you next lesson, in sha Allah.", { x: 0.8, y: 5.95, w: textW, h: 0.45, fontFace: FONT, fontSize: 18, color: MUTED });
    s.addImage({ path: LOGO_DARK, x: 0.8, y: 6.55, w: 0.55 * LOGO_RATIO, h: 0.55 });
    if (band === "early") najm(s, 9.6, 1.4, 2.9);
    s.addNotes(lesson.send ? `SEND / EAL / stretch: ${clean(lesson.send)}` : "");
  }
  S.total = slideCount;
  return { pptx, slides: S, breaks: breaksAdded, ctx };
}

function slide_circleNumber(s, x, y, d, color, label) {
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 } });
  s.addText(label, { x, y, w: d, h: d, fontFace: FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
}

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
  });
}

const manifest = [];
let built = 0;
for (const f of walk(LESSONS).sort()) {
  const rel = path.relative(LESSONS, f).replace(/\.json$/, ""); // subject/year
  if (only && !rel.startsWith(only)) continue;
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const [subjectSlug, year] = rel.split(path.sep);
  const file = { ...data, year: data.year || year, path: f };
  const ordered = [...data.lessons].sort((a, b) => a.n - b.n);
  for (const lesson of ordered) {
    if (built >= limit) break;
    const name = `${String(lesson.n).padStart(2, "0")}-${slug(lesson.title)}.pptx`;
    const dir = path.join(outDir, subjectSlug, year);
    fs.mkdirSync(dir, { recursive: true });
    const next = ordered.find((l) => l.n === lesson.n + 1) || null;
    const { pptx, slides, breaks, ctx } = buildDeck(file, lesson, next);
    await pptx.writeFile({ fileName: path.join(dir, name) });
    const planName = name.replace(/\.pptx$/, "-plan.docx");
    fs.writeFileSync(path.join(dir, planName), await buildPlan(file, lesson, { yearLabel: YEAR_LABEL(year), accent: ctx.accent, band: ctx.band, next, slides, breaks }));
    built++;
    manifest.push({
      subject_slug: subjectSlug,
      subject: data.subject,
      year,
      board: data.board || null,
      unit: lesson.unit,
      lesson_no: lesson.n,
      title: lesson.title,
      duration: lesson.duration || null,
      objectives: lesson.objectives,
      file: path.join(subjectSlug, year, name),
      plan_file: path.join(subjectSlug, year, planName),
    });
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`Built ${built} decks into ${outDir}`);
