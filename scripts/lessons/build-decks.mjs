// Builds branded PowerPoint decks from content/lessons/**/*.json.
//   node scripts/lessons/build-decks.mjs [outDir=out/decks] [--only=subject/year] [--limit=N]
// Output: <outDir>/<subject>/<year>/<NN>-<slug>.pptx and <outDir>/manifest.json
// Requires `pptxgenjs` (devDependency). Logos come from public/brand.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const ROOT = new URL("../../", import.meta.url).pathname;
const LESSONS = path.join(ROOT, "content/lessons");
const LOGO_DARK = path.join(ROOT, "public/brand/ga-wordmark.png"); // for light backgrounds
const LOGO_WHITE = path.join(ROOT, "public/brand/ga-wordmark-white.png"); // for dark backgrounds
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(ROOT, "out/decks"));
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const limit = Number((args.find((a) => a.startsWith("--limit=")) || "").slice(8)) || Infinity;

const INK = "1B1E21";
const MUTED = "6B7178";
const GOLD = "B08E45";
const GOLD_DARK = "7D6428";
const CREAM = "FBF7EE";
const TEAL = "1F6F6B";
const TEAL_DARK = "0F3D3A";
const TEAL_SOFT = "E3F2F0";
const FONT = "Calibri";
const LOGO_RATIO = 393 / 120;

// One accent colour per subject so a pupil can tell a deck at a glance.
const ACCENTS = {
  mathematics: "2F5DA8", english: "8A3B5B", "english-language": "8A3B5B", "english-literature": "8A3B5B",
  science: "2E7D4F", "gcse-science": "2E7D4F", history: "8C5A2B", geography: "3C7A8C", computing: "4C4C9A",
  arabic: "A5472B", "islamic-studies": "1F6F6B", quran: "0F5A52", art: "B4538F", pe: "C77A1E", pshe: "6B5CA5", business: "2A6F97",
};
const SUBJECT_LABELS = { pe: "PE", pshe: "PSHE", gcse_science: "GCSE Science" };
const YEAR_LABEL = (y) => (y === "reception" ? "Reception" : `Year ${y.slice(1)}`);

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "lesson";

function fontSizeFor(items, base, min) {
  const chars = items.reduce((n, s) => n + clean(s).length, 0);
  const scaled = base - Math.max(0, Math.floor((chars - 200) / 60)) * 1;
  return Math.max(min, Math.min(base, scaled));
}

function header(slide, ctx, title, kicker) {
  slide.background = { color: "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.05, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
  if (kicker) slide.addText(kicker.toUpperCase(), { x: 0.8, y: 0.38, w: 11.5, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3 });
  slide.addText(title, { x: 0.8, y: 0.68, w: 11.9, h: 0.9, fontFace: FONT, fontSize: 34, bold: true, color: INK, valign: "top", fit: "shrink" });
  slide.addShape("line", { x: 0.8, y: 1.62, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
}

function bulletList(slide, items, box, size, color = INK) {
  slide.addText(
    items.map((t) => ({ text: clean(t), options: { bullet: { indent: 22 }, breakLine: true, paraSpaceAfter: 10 } })),
    { ...box, fontFace: FONT, fontSize: size, color, valign: "top", fit: "shrink", lineSpacingMultiple: 1.05 },
  );
}

function numberedCards(slide, ctx, items, y0 = 1.95) {
  const n = items.length;
  const gap = 0.18;
  const avail = 7.05 - y0 - 0.3;
  const h = Math.min(1.5, (avail - gap * (n - 1)) / n);
  const size = fontSizeFor(items, 26, 16);
  items.forEach((t, i) => {
    const y = y0 + i * (h + gap);
    slide.addShape("roundRect", { x: 0.8, y, w: 11.8, h, rectRadius: 0.08, fill: { color: i % 2 ? "FFFFFF" : CREAM }, line: { color: "E5E5E5", width: 0.75 } });
    slide.addShape("ellipse", { x: 1.0, y: y + h / 2 - 0.3, w: 0.6, h: 0.6, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    slide.addText(String(i + 1), { x: 1.0, y: y + h / 2 - 0.3, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    slide.addText(clean(t), { x: 1.85, y, w: 10.6, h, fontFace: FONT, fontSize: size, color: INK, valign: "middle", fit: "shrink" });
  });
}


// ── Qur'an & tajweed decks: a more visual look, a colour key and short
// "brain break" activities between the explanations. ──────────────────────
const EMERALD = "0B4F45";
const BREAK_SECONDS = 60;
const TAJWEED_KEY = [
  { name: "Madd", what: "Stretch the sound", color: "D9534F" },
  { name: "Ghunnah", what: "Nasal hum", color: "2E9E5B" },
  { name: "Qalqalah", what: "Little echo", color: "3B82C4" },
  { name: "Ikhfa / Idgham", what: "Hide or merge", color: "8E5BB5" },
  { name: "Tafkhim", what: "Heavy letter, full mouth", color: "5B4636" },
  { name: "Izhar", what: "Clear, no blending", color: "7A8793" },
];
const BREAK_ACTIVITIES = [
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

function tajweedKeySlide(pptx, ctx) {
  const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
  header(s, ctx, "Our tajweed colour key", "Look for these in today's slides");
  const w = 3.75;
  const h = 2.0;
  TAJWEED_KEY.forEach((k, i) => {
    const x = 0.8 + (i % 3) * (w + 0.3);
    const y = 1.95 + Math.floor(i / 3) * (h + 0.3);
    s.addShape("roundRect", { x, y, w, h, rectRadius: 0.12, fill: { color: "FFFFFF" }, line: { color: k.color, width: 2.5 } });
    s.addShape("ellipse", { x: x + 0.3, y: y + 0.3, w: 0.7, h: 0.7, fill: { color: k.color }, line: { color: k.color, width: 0 } });
    s.addShape("star8", { x: x + 0.43, y: y + 0.43, w: 0.44, h: 0.44, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
    s.addText(k.name, { x: x + 1.15, y: y + 0.25, w: w - 1.3, h: 0.8, fontFace: FONT, fontSize: 22, bold: true, color: INK, valign: "middle", fit: "shrink" });
    s.addText(k.what, { x: x + 0.3, y: y + 1.1, w: w - 0.6, h: 0.7, fontFace: FONT, fontSize: 18, color: MUTED, valign: "top", fit: "shrink" });
  });
  s.addNotes("This colour key is used on our slides to help pupils spot rules. If a pupil's mushaf uses different colours, that is fine: always follow the colours in the mushaf you read from.");
  return s;
}

function breakSlide(pptx, ctx, act) {
  const s = pptx.addSlide();
  s.background = { color: "F5ECD6" };
  starPattern(s, 8.2, -0.5, 4, 7, 1.4, 0.15, "B08E45", 82);
  s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  s.addText("BRAIN BREAK", { x: 0.9, y: 0.7, w: 7, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: GOLD_DARK, charSpacing: 6 });
  s.addText(act.name, { x: 0.9, y: 1.2, w: 7.6, h: 1.4, fontFace: FONT, fontSize: 46, bold: true, color: EMERALD, valign: "top", fit: "shrink" });
  act.steps.forEach((t, i) => {
    const y = 3.0 + i * 1.1;
    s.addShape("ellipse", { x: 0.9, y, w: 0.75, h: 0.75, fill: { color: EMERALD }, line: { color: EMERALD, width: 0 } });
    s.addText(String(i + 1), { x: 0.9, y, w: 0.75, h: 0.75, fontFace: FONT, fontSize: 22, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    s.addText(t, { x: 1.9, y: y - 0.1, w: 6.6, h: 0.95, fontFace: FONT, fontSize: 22, color: INK, valign: "middle", fit: "shrink" });
  });
  s.addShape("ellipse", { x: 9.6, y: 2.7, w: 2.6, h: 2.6, fill: { color: "FFFFFF" }, line: { color: EMERALD, width: 6 } });
  s.addText(String(BREAK_SECONDS), { x: 9.6, y: 2.95, w: 2.6, h: 1.5, fontFace: FONT, fontSize: 72, bold: true, color: EMERALD, align: "center", valign: "middle" });
  s.addText("seconds", { x: 9.6, y: 4.2, w: 2.6, h: 0.5, fontFace: FONT, fontSize: 20, color: MUTED, align: "center" });
  s.addNotes(`Keep this to about ${BREAK_SECONDS} seconds. Start a timer on screen. It resets attention before the next part of the lesson.`);
  return s;
}

function buildDeck(file, lesson) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pptx.title = `${file.subject} ${YEAR_LABEL(file.year)} – ${lesson.title}`;
  pptx.author = "Tarbiyyah Global Academy";
  pptx.company = "Tarbiyyah Global Academy";
  const slug0 = path.basename(path.dirname(file.path));
  const ctx = {
    subjectLabel: file.subject,
    yearLabel: YEAR_LABEL(file.year),
    n: lesson.n,
    accent: ACCENTS[slug0] || TEAL,
  };
  const quran = slug0 === "quran";
  let breakNo = lesson.n * 3; // rotates the activities so neighbouring lessons differ
  const nextBreak = () => BREAK_ACTIVITIES[breakNo++ % BREAK_ACTIVITIES.length];
  let num = 0;
  // The footer (logo, deck label, slide number) lives on a slide master so the
  // logo is stored once in the file instead of once per slide.
  pptx.defineSlideMaster({
    title: "TGA_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 7.05, w: 13.33, h: 0.45, fill: { color: "FFFFFF" }, line: { color: "E5E5E5", width: 0.5 } } },
      { image: { path: LOGO_DARK, x: 0.45, y: 7.1, w: 0.34 * LOGO_RATIO, h: 0.34 } },
      { text: { text: `${ctx.subjectLabel} · ${ctx.yearLabel} · Lesson ${ctx.n}`, options: { x: 2.0, y: 7.1, w: 8, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, valign: "middle" } } },
    ],
    slideNumber: { x: 12.2, y: 7.1, w: 0.7, h: 0.34, fontFace: FONT, fontSize: 11, color: MUTED, align: "right" },
  });

  // 1. Title
  {
    const s = pptx.addSlide();
    num++;
    s.background = { color: TEAL_DARK };
    s.addShape("rect", { x: 0, y: 0, w: 0.5, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    s.addShape("rect", { x: 0.5, y: 0, w: 0.06, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    if (quran) starPattern(s, 8.6, 1.9, 4, 7, 1.15, 0.12, "B08E45", 86);
    s.addImage({ path: LOGO_WHITE, x: 1.0, y: 0.6, w: 0.8 * LOGO_RATIO, h: 0.8 });
    s.addText("بسم الله الرحمن الرحيم", { x: 7.3, y: 0.7, w: 5.5, h: 0.7, fontFace: "Arial", fontSize: 26, color: "E3C98F", align: "right", rtlMode: true });
    s.addText(`${file.subject.toUpperCase()}  ·  ${ctx.yearLabel.toUpperCase()}`, { x: 1.0, y: 2.35, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: "E3C98F", charSpacing: 4 });
    s.addText(lesson.title, { x: 1.0, y: 2.85, w: 11.3, h: 1.9, fontFace: FONT, fontSize: 48, bold: true, color: "FFFFFF", valign: "top", fit: "shrink" });
    s.addText(clean(lesson.unit), { x: 1.0, y: 4.9, w: 11.3, h: 0.5, fontFace: FONT, fontSize: 20, color: "CFE5E2" });
    s.addText(`Lesson ${lesson.n}  ·  ${lesson.duration || 50} minutes  ·  ${file.board ? clean(file.board) : ""}`, { x: 1.0, y: 5.45, w: 11.3, h: 0.4, fontFace: FONT, fontSize: 15, color: "9CC5C1" });
    s.addText("Tarbiyyah Global Academy  ·  A British education, rooted in faith", { x: 1.0, y: 6.7, w: 11.3, h: 0.35, fontFace: FONT, fontSize: 13, color: "9CC5C1" });
  }

  // 2. Objectives + key words
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, "Today we will…", "Learning objectives");
    const hasKw = (lesson.keywords || []).length > 0;
    const w = hasKw ? 6.0 : 11.8;
    bulletList(s, lesson.objectives || [], { x: 0.8, y: 1.95, w, h: 4.8 }, fontSizeFor(lesson.objectives || [], 30, 18));
    if (hasKw) {
      s.addShape("roundRect", { x: 7.1, y: 1.95, w: 5.5, h: 4.9, rectRadius: 0.1, fill: { color: CREAM }, line: { color: "E3C98F", width: 1 } });
      s.addText("KEY WORDS", { x: 7.35, y: 2.05, w: 5, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: GOLD_DARK, charSpacing: 3 });
      s.addText(
        lesson.keywords.slice(0, 6).flatMap((k) => [
          { text: clean(k.term), options: { bold: true, color: ctx.accent, breakLine: true } },
          { text: clean(k.def), options: { color: INK, breakLine: true, paraSpaceAfter: 8 } },
        ]),
        { x: 7.35, y: 2.45, w: 5.0, h: 4.3, fontFace: FONT, fontSize: fontSizeFor(lesson.keywords.map((k) => k.term + k.def), 18, 12), valign: "top", fit: "shrink" },
      );
    }
  }

  if (quran) tajweedKeySlide(pptx, ctx);

  // 3. Starter
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, "Starter: retrieval practice", "Settle and recall");
    numberedCards(s, ctx, lesson.starter || []);
    s.addNotes("Pupils answer from memory, without notes. Keep it brisk: about five minutes. Cold-call, then reveal and correct misconceptions.");
  }

  // 4. Teach slides
  (lesson.teach || []).forEach((t, i) => {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, clean(t.heading), `Explanation ${i + 1} of ${lesson.teach.length}`);
    s.addShape("roundRect", { x: 0.8, y: 1.95, w: 11.8, h: 4.85, rectRadius: 0.1, fill: { color: i % 2 ? "FFFFFF" : TEAL_SOFT }, line: { color: "E5E5E5", width: 0.75 } });
    // Qur'an decks: when the teacher note quotes the Arabic, show it big on the slide.
    const ar = quran ? (String(t.note || "").match(/[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\u064B-\u065F\u0670\s،؛؟]{10,}/) || [])[0] : null;
    if (ar) {
      bulletList(s, t.bullets || [], { x: 1.2, y: 2.1, w: 11.0, h: 2.3 }, fontSizeFor(t.bullets || [], 26, 18));
      s.addShape("roundRect", { x: 1.2, y: 4.55, w: 11.0, h: 2.1, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: GOLD, width: 1.5 } });
      s.addText(clean(ar), { x: 1.4, y: 4.6, w: 10.6, h: 2.0, fontFace: "Arial", fontSize: 38, color: EMERALD, align: "center", valign: "middle", rtlMode: true, fit: "shrink" });
    } else {
      bulletList(s, t.bullets || [], { x: 1.2, y: 2.15, w: 11.0, h: 4.5 }, fontSizeFor(t.bullets || [], 32, 20));
    }
    s.addNotes(clean(t.note));
    if (quran) s.addShape("star8", { x: 12.0, y: 0.45, w: 0.8, h: 0.8, fill: { color: ctx.accent, transparency: 80 }, line: { color: ctx.accent, width: 1, transparency: 40 } });
    if (quran && lesson.teach.length >= 4 && i === 1) breakSlide(pptx, ctx, nextBreak());
  });

  // 5. Guided practice
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, "Guided practice: we do it together", "Practice");
    numberedCards(s, ctx, lesson.practice || []);
    s.addNotes("Work through these with the class, modelling thinking aloud. Use mini-whiteboards or the chat to check every pupil before moving on.");
  }

  if (quran) breakSlide(pptx, ctx, nextBreak());

  // 6. Independent
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, "Independent practice: you do it", "Your turn");
    numberedCards(s, ctx, lesson.independent || []);
    if (lesson.send) s.addNotes(`Adaptation (SEND / EAL / stretch): ${clean(lesson.send)}`);
  }

  // 7. Exit ticket
  {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    num++;
    header(s, ctx, "Exit ticket", "Show what you learned");
    numberedCards(s, ctx, lesson.exit || []);
    s.addNotes("Pupils answer in the chat or on paper. Use the responses to plan the start of the next lesson.");
  }

  // 8. Homework + close
  {
    const s = pptx.addSlide();
    num++;
    s.background = { color: CREAM };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    s.addText("HOMEWORK", { x: 0.8, y: 0.8, w: 11, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3 });
    s.addText(clean(lesson.homework), { x: 0.8, y: 1.3, w: 11.8, h: 2.8, fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: "top", fit: "shrink" });
    s.addShape("line", { x: 0.8, y: 4.45, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
    s.addText("جزاكم الله خيرا", { x: 0.8, y: 4.7, w: 11.8, h: 0.8, fontFace: "Arial", fontSize: 30, color: GOLD_DARK, rtlMode: true });
    s.addText("Thank you for your effort and adab today. See you next lesson, in sha Allah.", { x: 0.8, y: 5.55, w: 11.8, h: 0.5, fontFace: FONT, fontSize: 18, color: MUTED });
    s.addImage({ path: LOGO_DARK, x: 0.8, y: 6.4, w: 0.6 * LOGO_RATIO, h: 0.6 });
    s.addNotes(lesson.send ? `SEND / EAL / stretch: ${clean(lesson.send)}` : "");
  }
  return pptx;
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
  const file = { ...data, path: f };
  for (const lesson of data.lessons) {
    if (built >= limit) break;
    const name = `${String(lesson.n).padStart(2, "0")}-${slug(lesson.title)}.pptx`;
    const dir = path.join(outDir, subjectSlug, year);
    fs.mkdirSync(dir, { recursive: true });
    const deck = buildDeck(file, lesson);
    await deck.writeFile({ fileName: path.join(dir, name) });
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
    });
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`Built ${built} decks into ${outDir}`);
