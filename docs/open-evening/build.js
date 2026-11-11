/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS Node build script, run with `node build.js` */
const pptxgen = require("pptxgenjs");
const path = require("path");
const sizeOf = (f) => {
  const b = require("fs").readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const { applyTheme } = require("/root/.claude/skills/synced/362d584d-e2ba-4ccf-a486-2dbfe6ab9e66_15f61af0-f505-4098-bbbc-e4eaa4d12875/pptx/scripts/apply_theme.js");

const D = __dirname;
const IMG = (f) => path.join(D, "img", f);
const SHOT = (f) => path.join(D, "use", f);

const THEME = {
  name: "Tarbiyyah Global Academy",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B1E21", lt1: "FFFFFF", dk2: "1F3D2E", lt2: "FBF8F1",
    accent1: "B08E45", accent2: "7E632B", accent3: "1F4D3A", accent4: "EFE6D2", accent5: "6B6F73", accent6: "A33A2B",
    hlink: "7E632B", folHlink: "5E4B1E",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "Tarbiyyah Global Academy: Open evening";
pres.author = "Tarbiyyah Global Academy";
pres.company = "Tarbiyyah Global Academy";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

const W = 13.333, H = 7.5, M = 0.7;
const logo = sizeOf(IMG("tga-logo-hires.png"));
const logoW = sizeOf(IMG("tga-logo-white.png"));

// ── layouts ──
pres.defineSlideMaster({
  title: "Dark title",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.75, w: 7.6, h: 1.3, fontSize: 54, bold: false, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 4.05, w: 7.6, h: 1.0, fontSize: 20, color: C.accent1, valign: "top", align: "left", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "Section",
  background: { color: HEX.dk1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: M, y: 2.5, w: 6.2, h: 0.4, fontSize: 14, bold: true, charSpacing: 3, color: C.accent1, align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.95, w: 6.2, h: 1.6, fontSize: 40, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 4.6, w: 6.0, h: 1.4, fontSize: 18, color: "D9D4C7", valign: "top", align: "left", margin: 0 }, text: "" } },
    { image: { x: M, y: 6.55, w: 1.9, h: 1.9 * logoW.h / logoW.w, path: IMG("tga-logo-white.png") } },
  ],
});
pres.defineSlideMaster({
  title: "Content",
  background: { color: HEX.lt2 },
  slideNumber: { x: M, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.accent5, fontFace: "Calibri" },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: M, y: 0.42, w: 9.5, h: 0.32, fontSize: 12, bold: true, charSpacing: 3, color: C.accent2, align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.74, w: 11.9, h: 0.75, fontSize: 32, color: C.text1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { image: { x: W - M - 1.45, y: 6.93, w: 1.45, h: 1.45 * logo.h / logo.w, path: IMG("tga-logo-hires.png") } },
  ],
});

// ── helpers ──
const text = (s, t, o) => s.addText(t, Object.assign({ isTextBox: true, margin: 0, fontFace: "Calibri", color: C.text1, fontSize: 15, valign: "top" }, o));
function card(s, x, y, w, h, fill, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill || C.background1 }, line: { color: HEX.accent4, width: 0.75 }, objectName: name });
}
// A desktop browser frame with a screenshot, fitted by width.
function browser(s, file, x, y, w, maxH, name) {
  const sz = sizeOf(SHOT(file));
  const bar = 0.26;
  let iw = w, ih = (w * sz.h) / sz.w;
  if (maxH && ih + bar > maxH) { ih = maxH - bar; iw = (ih * sz.w) / sz.h; x += (w - iw) / 2; }
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.02, y: y - 0.02, w: iw + 0.04, h: ih + bar + 0.04, rectRadius: 0.06, fill: { color: "E7E1D3" }, line: { color: "D8CFBC", width: 0.75 }, shadow: { type: "outer", blur: 12, offset: 3, angle: 90, color: "000000", opacity: 0.16 }, objectName: name + " frame" });
  [0, 1, 2].forEach((i) => s.addShape(pres.shapes.OVAL, { x: x + 0.12 + i * 0.16, y: y + 0.08, w: 0.1, h: 0.1, fill: { color: ["D9A08F", "E3C98F", "A9C2A6"][i] }, line: { type: "none" } }));
  s.addImage({ path: SHOT(file), x, y: y + bar, w: iw, h: ih, altText: name, objectName: name });
  return { w: iw, h: ih + bar };
}
// A phone with a screenshot, fitted by height.
function phone(s, file, x, y, h, name) {
  const sz = sizeOf(SHOT(file));
  const pad = 0.09;
  const ih = h - 2 * pad, iw = (ih * sz.w) / sz.h;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: iw + 2 * pad, h, rectRadius: 0.32, fill: { color: "16191B" }, line: { color: "3A3D40", width: 1 }, shadow: { type: "outer", blur: 14, offset: 4, angle: 90, color: "000000", opacity: 0.25 }, objectName: name + " phone" });
  s.addImage({ path: SHOT(file), x: x + pad, y: y + pad, w: iw, h: ih, rounding: false, altText: name, objectName: name });
  return iw + 2 * pad;
}
const SECTIONS = new Set(["Welcome", "The portals", "Joining", "Questions"]);
function content(section, kicker, title) {
  if (!SECTIONS.has(section)) { pres.addSection({ title: section }); SECTIONS.add(section); }
  const s = pres.addSlide({ masterName: "Content", sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  return s;
}
function numCircle(s, x, y, d, label, fill, color, size) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" } });
  text(s, label, { x, y, w: d, h: d, align: "center", valign: "middle", fontFace: "Cambria", bold: true, fontSize: size || 16, color });
}

// ══ 1. Title ══
pres.addSection({ title: "Welcome" });
let s = pres.addSlide({ masterName: "Dark title", sectionTitle: "Welcome" });
s.addImage({ path: IMG("tga-logo-white.png"), x: M, y: 0.8, w: 4.4, h: 4.4 * logoW.h / logoW.w, altText: "Tarbiyyah Global Academy logo" });
s.addText("Open evening", { placeholder: "title" });
s.addText("A live online Islamic school for Years 1 to 11, opening January 2027", { placeholder: "body" });
text(s, [
  { text: "Thursday 26 November, 7:30pm UK", options: { breakLine: true } },
  { text: "Sunday 6 December, 4:00pm UK" },
], { x: M, y: 5.6, w: 6, h: 0.8, fontSize: 15, color: "C9C3B5", paraSpaceAfter: 4 });
text(s, "Microphones off, please. Ask questions in the chat at any time.", { x: M, y: 6.6, w: 7.5, h: 0.4, fontSize: 13, color: "8E8A80", italic: true });
phone(s, "pupil-phone.png", 9.35, 0.65, 6.2, "Pupil Today page on a phone, with the Join lesson button");
s.addNotes("Start at 7:30pm UK time. Assalamu alaikum and welcome. Introduce yourself: [HEADTEACHER NAME], Headteacher. Housekeeping: microphones off, questions in the chat at any time; the host gathers them for the end. We will finish by 8:30pm. On the right is what a pupil sees each morning: their day, and one button to join the live lesson.");

// ══ 2. Tonight ══
s = content("Welcome", "Tonight", "One hour, and your questions answered");
const agenda = [
  ["7:30", "Welcome", "Who we are and why we started"],
  ["7:35", "How we teach", "Values, the school day and what your child learns"],
  ["7:50", "Safety", "How we keep children safe online"],
  ["7:55", "The portals", "A live tour of what parents and pupils see"],
  ["8:05", "Joining", "Fees, key dates and how to apply"],
  ["8:10", "Questions", "Ask anything; we stay until 8:30"],
];
const ax = M, aw = W - 2 * M, step = aw / agenda.length;
s.addShape(pres.shapes.LINE, { x: ax + step / 2, y: 2.62, w: aw - step, h: 0, line: { color: HEX.accent1, width: 1.5 }, objectName: "timeline" });
agenda.forEach(([t, h, b], i) => {
  const cx = ax + i * step + step / 2;
  numCircle(s, cx - 0.32, 2.3, 0.64, String(i + 1), i === 3 ? HEX.accent1 : HEX.dk1, HEX.lt1, 18);
  text(s, t + "pm", { x: cx - step / 2 + 0.1, y: 3.1, w: step - 0.2, h: 0.35, align: "center", fontSize: 13, bold: true, color: C.accent2 });
  text(s, h, { x: cx - step / 2 + 0.1, y: 3.45, w: step - 0.2, h: 0.45, align: "center", fontFace: "Cambria", fontSize: 19, bold: true });
  text(s, b, { x: cx - step / 2 + 0.15, y: 3.95, w: step - 0.3, h: 0.9, align: "center", fontSize: 14, color: "4A4E52" });
});
card(s, M, 5.35, W - 2 * M, 1.1, C.background1, "housekeeping");
text(s, [
  { text: "Questions: ", options: { bold: true } },
  { text: "type them in the chat whenever you think of them. The host collects them, and we answer as many as we can at the end. Anything about your own child, we can talk about privately on a free call." },
], { x: M + 0.35, y: 5.6, w: W - 2 * M - 0.7, h: 0.7, fontSize: 15, valign: "middle" });
s.addNotes("Keep this to about 30 seconds. Highlight the live portal tour (step 4): it is the part families usually find most useful. Remind them that private questions about their own child are best on a free call; the link is on the last slide.");

// ══ 3. Family of schools ══
s = content("Who we are", "Who we are", "Part of the Tarbiyyah family of schools");
const fam = [
  ["school-primary.png", "Primary", "Tarbiyyah Primary School", "Our primary school, sharing the same faith, values and care."],
  ["school-secondary.png", "Secondary · Boys", "Tarbiyyah Secondary School for Boys", "Our Heston school, rated Good by Ofsted (2025), with high GCSE pass rates."],
  ["school-albanaat.png", "Girls", "Tarbiyyah Al-Banaat", "Our sister school for girls, with the same faith, values and standard of care."],
];
const fw = (W - 2 * M - 3 * 0.3) / 4;
fam.forEach(([img, k, n, b], i) => {
  const x = M + i * (fw + 0.3), y = 1.85;
  card(s, x, y, fw, 3.9, C.background1, n);
  const sz = sizeOf(IMG(img)); const lh = 0.62, lw = Math.min(fw - 0.6, lh * sz.w / sz.h);
  s.addImage({ path: IMG(img), x: x + 0.3, y: y + 0.35, w: lw, h: lw * sz.h / sz.w, altText: n + " logo" });
  text(s, k.toUpperCase(), { x: x + 0.3, y: y + 1.35, w: fw - 0.6, h: 0.3, fontSize: 11, bold: true, charSpacing: 2, color: C.accent2 });
  text(s, n, { x: x + 0.3, y: y + 1.7, w: fw - 0.6, h: 0.95, fontFace: "Cambria", fontSize: 17, bold: true });
  text(s, b, { x: x + 0.3, y: y + 2.75, w: fw - 0.6, h: 1.3, fontSize: 14, color: "4A4E52" });
});
{
  const x = M + 3 * (fw + 0.3), y = 1.85;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: fw, h: 3.9, rectRadius: 0.08, fill: { color: HEX.dk1 }, line: { color: HEX.accent1, width: 1.5 }, objectName: "TGA card" });
  s.addImage({ path: IMG("tga-logo-white.png"), x: x + 0.3, y: y + 0.4, w: 2.0, h: 2.0 * logoW.h / logoW.w, altText: "Tarbiyyah Global Academy logo" });
  text(s, "ONLINE", { x: x + 0.3, y: y + 1.35, w: fw - 0.6, h: 0.3, fontSize: 11, bold: true, charSpacing: 2, color: C.accent1 });
  text(s, "Tarbiyyah Global Academy", { x: x + 0.3, y: y + 1.7, w: fw - 0.6, h: 0.75, fontFace: "Cambria", fontSize: 17, bold: true, color: C.background1 });
  text(s, "A live, co-educational online school for families anywhere in the world. This is us.", { x: x + 0.3, y: y + 2.75, w: fw - 0.6, h: 1.3, fontSize: 14, color: "D9D4C7" });
}
text(s, "The same faith, values and standard of care, now reaching homeschooling families wherever they live.", { x: M, y: 6.1, w: W - 2 * M, h: 0.5, fontSize: 16, italic: true, color: C.accent2 });
s.addNotes("[Add your founding story here in two sentences: why the Trust opened an online school.] Mention the Secondary School's 2025 Ofsted judgement of Good, and make clear the report is about our sister school, not about TGA, which opens in January. Do not quote figures we have not published.");

// ══ 4. Why TGA ══
s = content("Who we are", "Why families choose us", "A real school, taught live, with Islam at its heart");
const why = [
  ["15", "pupils at most", "in a class, so every child is known, heard and supported."],
  ["Live", "every lesson", "taught in real time on Microsoft Teams by a qualified teacher, never a pre-recorded course."],
  ["1 to 11", "year groups", "one school from Year 1 to Year 11, with a proper timetable, homework and reports."],
  ["IGCSE", "in Years 10 and 11", "Pearson Edexcel International GCSEs, including Islamic Studies."],
];
const ww = (W - 2 * M - 3 * 0.3) / 4;
why.forEach(([big, small, body], i) => {
  const x = M + i * (ww + 0.3), y = 1.9;
  card(s, x, y, ww, 3.6, C.background1, small);
  text(s, big, { x: x + 0.3, y: y + 0.35, w: ww - 0.6, h: 1.0, fontFace: "Cambria", fontSize: big.length > 4 ? 40 : 54, bold: true, color: C.accent2, valign: "bottom" });
  text(s, small.toUpperCase(), { x: x + 0.3, y: y + 1.45, w: ww - 0.6, h: 0.3, fontSize: 12, bold: true, charSpacing: 2, color: C.text1 });
  text(s, body, { x: x + 0.3, y: y + 1.9, w: ww - 0.6, h: 1.5, fontSize: 15, color: "4A4E52" });
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.8, w: W - 2 * M, h: 0.8, rectRadius: 0.08, fill: { color: HEX.dk2 }, line: { type: "none" }, objectName: "tarbiyah band" });
text(s, [
  { text: "Tarbiyyah ", options: { italic: true, bold: true, color: HEX.accent1 } },
  { text: "means the nurturing of character and faith. It is in every lesson, not only in Islamic Studies.", options: { color: HEX.lt1 } },
], { x: M + 0.35, y: 5.8, w: W - 2 * M - 0.7, h: 0.8, fontSize: 17, valign: "middle" });
s.addNotes("Four things that make us different from an online course: small classes, every lesson live, one school from Year 1 to Year 11, and recognised qualifications at the end. Subject teachers hold QTS or an equivalent teaching qualification; Qur'an, Arabic and Islamic Studies teachers hold recognised Islamic scholarship plus teacher training or proven classroom experience. Every teacher is assessed on a live online lesson before they join.");

// ══ 5. Values ══
s = content("How we teach", "Our values", "The Tarbiyyah Compass spells IHSAN");
const vals = [
  ["I", "Ilm", "Love of learning: curiosity, good questions and the effort to really understand."],
  ["H", "Honesty", "Sidq and amanah: telling the truth, doing your own work, keeping trust."],
  ["S", "Sabr & shukr", "Keeping going when things are hard, and thanking Allah and others."],
  ["A", "Adab", "Respect and kindness in how we speak, listen and behave, online and at home."],
  ["N", "Niyyah", "Doing what is right for the sake of Allah, whether or not anyone is watching."],
];
const vw = (W - 2 * M - 4 * 0.25) / 5;
vals.forEach(([l, w, b], i) => {
  const x = M + i * (vw + 0.25), y = 1.85;
  card(s, x, y, vw, 3.75, C.background1, w);
  numCircle(s, x + (vw - 1.0) / 2, y + 0.35, 1.0, l, HEX.dk1, HEX.accent1, 34);
  text(s, w, { x: x + 0.15, y: y + 1.5, w: vw - 0.3, h: 0.5, align: "center", fontFace: "Cambria", fontSize: 18, bold: true, fit: "shrink" });
  text(s, b, { x: x + 0.25, y: y + 2.1, w: vw - 0.5, h: 1.55, align: "center", fontSize: 14, color: "4A4E52" });
});
text(s, [
  { text: "Ihsan ", options: { bold: true, color: HEX.accent2 } },
  { text: "is worshipping Allah as though you see Him. Each value is the focus of one half term, and the year ends with all five together. Teachers recognise them with merits, and they appear in every report." },
], { x: M, y: 5.9, w: W - 2 * M, h: 0.8, fontSize: 15 });
s.addNotes("In an online school much of a child's conduct happens with no adult in the room, which is why Ihsan, doing right whether or not anyone is watching, is our aim. Give one real example per value of how a teacher reinforces it (for example, Adab: greeting with salam and microphone etiquette). CHECK BEFORE THE EVENT: the owner may change the value words; update this slide if so.");

// ══ 6. School day ══
s = content("How we teach", "A school day", "A proper timetable, not a screen all day");
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 1.85, w: 4.6, h: 4.65, rectRadius: 0.08, fill: { color: HEX.dk1 }, line: { type: "none" } });
text(s, "MONDAY TO THURSDAY", { x: M + 0.4, y: 2.2, w: 3.9, h: 0.3, fontSize: 12, bold: true, charSpacing: 2, color: C.accent1 });
text(s, "09:00 to 15:00", { x: M + 0.4, y: 2.5, w: 3.9, h: 0.75, fontFace: "Cambria", fontSize: 36, bold: true, color: C.background1 });
text(s, "UK time", { x: M + 0.4, y: 3.25, w: 3.9, h: 0.35, fontSize: 15, color: "C9C3B5" });
text(s, "FRIDAY", { x: M + 0.4, y: 3.95, w: 3.9, h: 0.3, fontSize: 12, bold: true, charSpacing: 2, color: C.accent1 });
text(s, "09:00 to 12:00", { x: M + 0.4, y: 4.25, w: 3.9, h: 0.75, fontFace: "Cambria", fontSize: 36, bold: true, color: C.background1 });
text(s, "The afternoon is free for Jumu'ah.", { x: M + 0.4, y: 5.0, w: 3.9, h: 0.35, fontSize: 15, color: "C9C3B5" });
text(s, "Breaks, prayer and independent tasks are built into every day.", { x: M + 0.4, y: 5.6, w: 3.9, h: 0.7, fontSize: 13, italic: true, color: "C9C3B5" });
const ks = [
  ["Years 1 to 2", "15", "live lessons a week", "30 minutes each, about 1.5 hours a day, with guided activities at home"],
  ["Years 3 to 6", "20", "live lessons a week", "45 minutes each"],
  ["Years 7 to 11", "23", "live lessons a week", "50 minutes each"],
];
ks.forEach(([y1, n, l, b], i) => {
  const x = M + 4.9, y = 1.85 + i * 1.6, w = W - 2 * M - 4.9;
  card(s, x, y, w, 1.4, C.background1, y1);
  text(s, y1, { x: x + 0.35, y: y + 0.2, w: 2.6, h: 0.4, fontFace: "Cambria", fontSize: 19, bold: true });
  text(s, b, { x: x + 0.35, y: y + 0.65, w: 3.4, h: 0.65, fontSize: 14, color: "4A4E52" });
  text(s, n, { x: x + w - 3.35, y: y + 0.15, w: 1.2, h: 1.1, fontFace: "Cambria", fontSize: 48, bold: true, color: C.accent2, align: "right", valign: "middle" });
  text(s, l, { x: x + w - 2.05, y: y + 0.15, w: 1.8, h: 1.1, fontSize: 15, valign: "middle" });
});
s.addNotes("Form time, assemblies and clubs are in addition to these lessons. A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Years 1 to 9. Years 1 to 3 need an adult nearby; most children manage alone from Year 4. Families in other time zones can ask about flexible learning, which is offered subject to availability: do not promise it. UK times suit Europe, North and West Africa, Turkey and the Middle East.");

// ══ 7. Curriculum ══
s = content("How we teach", "What your child learns", "The full curriculum, alongside Qur'an, Arabic and Islamic Studies");
const cur = [
  ["Years 1 to 6", "Primary", ["Phonics, early reading, English and maths every day", "Science, history, geography, computing, art and design", "Qur'an and Tajweed, starting with the Qaidah", "Arabic, Islamic Studies and PSHE"]],
  ["Years 7 to 9", "Key Stage 3", ["English, maths and science (biology, chemistry, physics)", "History, geography, computing, art and design", "Qur'an and Tajweed, Arabic, Islamic Studies", "Study habits that prepare for GCSE"]],
  ["Years 10 to 11", "International GCSE", ["Pearson Edexcel International GCSEs", "English, maths, science and Islamic Studies", "Two options chosen in Year 9", "Families register at an exam centre near them; we help them find one"]],
];
const cw = (W - 2 * M - 2 * 0.3) / 3;
cur.forEach(([y1, k, items], i) => {
  const x = M + i * (cw + 0.3), y = 1.85;
  card(s, x, y, cw, 4.75, C.background1, y1);
  text(s, k.toUpperCase(), { x: x + 0.35, y: y + 0.3, w: cw - 0.7, h: 0.3, fontSize: 12, bold: true, charSpacing: 2, color: C.accent2 });
  text(s, y1, { x: x + 0.35, y: y + 0.62, w: cw - 0.7, h: 0.55, fontFace: "Cambria", fontSize: 24, bold: true });
  text(s, items.map((t, j) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: j < items.length - 1 } })), { x: x + 0.35, y: y + 1.4, w: cw - 0.7, h: 3.2, fontSize: 15, paraSpaceAfter: 9, color: "33373B" });
});
s.addNotes("Maths follows White Rose for Years 1 to 9. Homework is kept manageable and tracked in the portal, and termly reports come to parents. We are not an exam centre: families register their child as a private candidate at an approved exam centre near them, in the UK or abroad, and pay that centre's entry fees, which are not part of tuition. We help every family for free with a list of centres that take private candidates, the deadlines, the entry codes and what to ask a centre, and our exams lead answers questions. We do not book or pay for entries. History is not offered at GCSE. Avoid naming every option subject in case the list changes; the Learning page on the website has the current list.");

// ══ 8. Qur'an ══
s = content("How we teach", "Qur'an", "Every recitation heard, marked and shared with you");
browser(s, "quran-hear.png", 5.55, 1.75, W - M - 5.55, 4.95, "Teacher hears a pupil recite and marks mistakes on the mushaf page");
const qp = [
  ["Heard every week", "Pupils recite live to their teacher: memorisation, revision and reading."],
  ["Marked on the page", "The teacher taps each slip or tajweed point on the mushaf as the pupil recites."],
  ["A fair mark out of 10", "Worked out from one school-wide standard, so marks mean the same in every class."],
  ["You see it too", "The mark, the ayat covered and what to practise appear in your parent portal."],
];
qp.forEach(([h, b], i) => {
  const y = 1.85 + i * 1.2;
  numCircle(s, M, y, 0.5, String(i + 1), HEX.dk1, HEX.accent1, 15);
  text(s, h, { x: M + 0.7, y: y - 0.02, w: 3.9, h: 0.4, fontFace: "Cambria", fontSize: 18, bold: true });
  text(s, b, { x: M + 0.7, y: y + 0.4, w: 3.9, h: 0.7, fontSize: 14, color: "4A4E52" });
});
s.addNotes("This is the real teacher screen with made-up data. Explain the three kinds of recitation: memorisation (hifdh), revision (muraja'ah) and reading (tilawah). The Head sets one marking standard for the whole school, so a 9 out of 10 means the same in every class. Families see the marks and what to practise in the Qur'an section of their portal.");

// ══ 9. Safeguarding ══
s = content("Keeping children safe", "Safeguarding", "Keeping children safe online");
const safe = [
  ["Vetted staff", "Enhanced DBS checks in the UK and overseas checks for staff abroad. Every teacher is safeguarding trained."],
  ["Named leads", "A Designated Safeguarding Lead and a deputy, with clear routes for raising any concern."],
  ["Controlled classrooms", "Teachers run the meeting, the chat and breakout rooms, with clear camera and conduct rules."],
  ["No private pupil chats", "Pupils message staff only. Staff review messages for safeguarding as part of normal practice."],
  ["Help at home", "Guidance on router filtering, parental controls and safe search, and on keeping devices in shared spaces."],
  ["Report a concern", "A button on every portal page goes straight to the safeguarding team."],
];
const sw = (W - 2 * M - 2 * 0.3) / 3;
safe.forEach(([h, b], i) => {
  const x = M + (i % 3) * (sw + 0.3), y = 1.85 + Math.floor(i / 3) * 2.4;
  card(s, x, y, sw, 2.15, C.background1, h);
  text(s, h, { x: x + 0.35, y: y + 0.3, w: sw - 0.7, h: 0.45, fontFace: "Cambria", fontSize: 19, bold: true, color: i === 5 ? HEX.accent6 : HEX.dk1 });
  text(s, b, { x: x + 0.35, y: y + 0.8, w: sw - 0.7, h: 1.25, fontSize: 14.5, color: "4A4E52" });
});
s.addNotes("If the DSL is present, let them present this slide. Concerns about families outside the UK are handled by the DSL with the right local services. The Child Protection and Safeguarding Policy is on the website's Policies page. Pupils cannot message each other privately; they talk in the lesson chat, which staff can see.");

// ══ 10. Section: portals ══
pres.addSection({ title: "The portals" });
s = pres.addSlide({ masterName: "Section", sectionTitle: "The portals" });
s.addText("THE PORTALS", { placeholder: "kicker" });
s.addText("Everything in one place, for you and your child", { placeholder: "title" });
s.addText("A pupil portal to join lessons and hand in work, and a parent portal to see how they are getting on. Works on a phone, tablet or computer.", { placeholder: "body" });
phone(s, "absence-phone.png", 7.2, 1.4, 4.7, "Parent portal: report an absence on a phone");
phone(s, "pupil-phone.png", 10.2, 1.4, 4.7, "Pupil portal Today page on a phone");
s.addNotes("Introduce the next three slides, then switch to the live demo. All screens are the real portal with made-up demo data.");

// ══ 11. Pupil Today ══
s = content("The portals", "For pupils", "Their day on one screen, and one button to join");
browser(s, "pupil-today.png", M, 1.75, 8.6, 4.9, "Pupil Today page: lessons today, homework to do and the Join lesson button");
const pt = [["Join lesson", "One tap opens the live lesson on Teams."], ["My day", "Every lesson today, with its time."], ["Homework", "What is due, handed in online."], ["Hijri and term dates", "Islamic dates on the calendar."]];
pt.forEach(([h, b], i) => {
  const y = 1.85 + i * 1.18;
  text(s, h, { x: M + 9.0, y, w: W - 2 * M - 9.0, h: 0.4, fontFace: "Cambria", fontSize: 18, bold: true });
  text(s, b, { x: M + 9.0, y: y + 0.4, w: W - 2 * M - 9.0, h: 0.6, fontSize: 14, color: "4A4E52" });
});
s.addNotes("What a pupil sees each morning. The green box shows the lesson in progress with the Join lesson button. Younger children can be helped by a parent; from about Year 4 most manage alone.");

// ══ 12. Parents ══
s = content("The portals", "For parents", "Always in the picture");
browser(s, "parent-calendar.png", M, 1.7, 8.4, 4.55, "Parent calendar with lessons, homework deadlines and Islamic dates");
phone(s, "absence-phone.png", 9.75, 1.6, 4.7, "Report an absence on a phone");
text(s, "Lessons, homework deadlines, school events and Islamic dates in one calendar", { x: M, y: 6.4, w: 8.4, h: 0.4, fontSize: 13, italic: true, color: "4A4E52" });
text(s, "Report an absence in under a minute", { x: 9.3, y: 6.4, w: 3.6, h: 0.4, fontSize: 13, italic: true, color: "4A4E52", align: "center" });
s.addNotes("Parents also see homework, attendance, merits and behaviour, Qur'an marks, termly reports, messages from teachers, and fees. Absences can be reported in the portal or by email from the registered address.");

// ══ 13. Quizzes ══
s = content("The portals", "Learning you can see", "Quizzes that mark themselves, with feedback straight away");
browser(s, "quiz-take.png", M, 1.75, 5.6, 4.9, "A pupil taking a timed quiz");
browser(s, "quiz-result.png", M + 6.0, 1.75, 5.9, 4.9, "The quiz result with the right answers and why");
s.addNotes("Pupils sit short quizzes in the portal. Answers save as they go, so a dropped connection loses nothing. Most questions mark themselves, and pupils see the right answer and why. Teachers mark longer answers. Results feed the gradebook and reports.");

// ══ 14. Live demo ══
s = pres.addSlide({ masterName: "Section", sectionTitle: "The portals" });
s.addText("LIVE TOUR", { placeholder: "kicker" });
s.addText("Let's look at it together", { placeholder: "title" });
s.addText("Sharing the screen now: a parent's Today page, reporting an absence, messages, and a pupil joining a lesson.", { placeholder: "body" });
browser(s, "teacher-registers.png", 7.5, 2.0, 5.2, 3.6, "Teacher: lessons and registers");
s.addNotes("Switch to the demo accounts (made-up data only), signed in before 7:15. About 8 to 10 minutes: 1) parent Today, 2) report an absence, 3) messages, 4) pupil Today and Join lesson, 5) homework. If the internet fails, return to slides 11 to 13. The picture shows the teacher's register page, if anyone asks how attendance is taken.");

// ══ 15. Fees ══
pres.addSection({ title: "Joining" });
s = content("Joining", "Fees", "Fees for January to July 2027");
const rows = [
  [{ text: "Year group", options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 } } }, { text: "For the year", options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, align: "right" } }, { text: "2 payments", options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, align: "right" } }, { text: "7 monthly payments", options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk1 }, align: "right" } }],
];
const bands = [["Years 1 to 2", 1596], ["Years 3 to 6", 2130], ["Years 7 to 9", 2796], ["Years 10 to 11", 3000]];
const gbp = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const split = (t, n) => { const p = Math.round(t * 100), e = Math.round(p / n); return [e / 100, (p - e * (n - 1)) / 100]; };
bands.forEach(([b, a], i) => {
  const [t1, t2] = split(a, 2), [m1, m7] = split(a, 7);
  const fill = { color: i % 2 ? "F6F1E6" : "FFFFFF" };
  rows.push([
    { text: b, options: { bold: true, fill } },
    { text: gbp(a), options: { align: "right", bold: true, fill } },
    { text: t1 === t2 ? `2 × ${gbp(t1)}` : `${gbp(t1)} + ${gbp(t2)}`, options: { align: "right", fill } },
    { text: m1 === m7 ? `7 × ${gbp(m1)}` : `6 × ${gbp(m1)}, then ${gbp(m7)}`, options: { align: "right", fill } },
  ]);
});
s.addTable(rows, { x: M, y: 1.85, w: 7.7, colW: [1.75, 1.3, 1.6, 3.05], rowH: 0.58, fontSize: 15, fontFace: "Calibri", color: HEX.dk1, border: { type: "solid", color: "E3DACA", pt: 0.75 }, valign: "middle", margin: [0, 0.12, 0, 0.12] });
text(s, "Tuition and digital materials included. Not included: GCSE entry fees, optional books, your device and internet, and a stylus tablet or access to printing.", { x: M, y: 4.95, w: 7.7, h: 0.8, fontSize: 13, color: "4A4E52" });
const fx = M + 8.1, fwid = W - M - fx;
card(s, fx, 1.85, fwid, 4.75, C.background1, "fee notes");
const fn = [
  ["2% off", "if you pay for the whole year by 8 January 2027"],
  ["5% and 10%", "off for a second child, and for a third or further child"],
  ["£150", "application fee per child; there is no registration fee"],
  ["First payment", "on accepting your place, by 8 January 2027 at the latest"],
];
fn.forEach(([h, b], i) => {
  const y = 2.1 + i * 1.1;
  text(s, h, { x: fx + 0.35, y, w: fwid - 0.7, h: 0.42, fontFace: "Cambria", fontSize: 20, bold: true, color: C.accent2 });
  text(s, b, { x: fx + 0.35, y: y + 0.42, w: fwid - 0.7, h: 0.6, fontSize: 14, color: "33373B" });
});
s.addNotes("Every figure is on the website's Fees page. Second payment for the two-payment plan: 28 March 2027. Monthly plan: first payment on acceptance (by 8 January), then the 28th of each month from January to June. Payment is online; details come with the offer. There are no standing orders or bank transfers. CHECK BEFORE THE EVENT: that the online payment link is set up and the application fee is still £150 in Settings.");

// ══ 16. How to apply ══
s = content("Joining", "How to apply", "Six steps from application to the first lesson");
const steps = [
  ["Apply", "Online form and documents, about 20 minutes."],
  ["We review", "We check your details and ask for a school report."],
  ["Assessment", "A short supervised online assessment."],
  ["Family call", "A video call with the Headteacher and your child."],
  ["Offer", "Accept within five working days and make the first payment."],
  ["Welcome", "Accounts, devices and teachers in induction week."],
];
const stw = (W - 2 * M - 5 * 0.2) / 6;
steps.forEach(([h, b], i) => {
  const x = M + i * (stw + 0.2), y = 2.0;
  card(s, x, y, stw, 3.3, i === 4 ? HEX.dk1 : C.background1, h);
  numCircle(s, x + 0.25, y + 0.3, 0.55, String(i + 1), i === 4 ? HEX.accent1 : HEX.dk1, HEX.lt1, 16);
  text(s, h, { x: x + 0.2, y: y + 1.05, w: stw - 0.4, h: 0.45, fontFace: "Cambria", fontSize: 16, bold: true, color: i === 4 ? HEX.lt1 : HEX.dk1 });
  text(s, b, { x: x + 0.25, y: y + 1.55, w: stw - 0.5, h: 1.6, fontSize: 14, color: i === 4 ? "D9D4C7" : "4A4E52" });
});
text(s, [
  { text: "Offers are normally made within three working days of the family call. ", options: {} },
  { text: "Apply at globalacademy.tarbiyyah.co.uk/admissions", options: { bold: true, color: HEX.accent2 } },
], { x: M, y: 5.65, w: W - 2 * M, h: 0.5, fontSize: 15 });
s.addNotes("Documents: photo ID for a parent, the child's passport or birth certificate, proof of address and, if available, a recent school report or homeschool record. Several children go on one form. You can cancel within 14 days of accepting, as the Fees Policy explains.");

// ══ 17. Key dates ══
s = content("Joining", "Key dates", "Places for January are limited");
const dates = [
  ["Sat 12 Dec", "Taster morning", "Children join a real lesson: Years 1 to 6 at 10:00, Years 7 to 11 at 11:15"],
  ["Fri 18 Dec", "Apply by", "Later applications are considered while places remain"],
  ["4 to 8 Jan", "Induction week", "Accounts, devices and meeting teachers"],
  ["Mon 11 Jan", "First live lessons", "The founding year begins"],
];
const dw = (W - 2 * M) / 4;
s.addShape(pres.shapes.LINE, { x: M + dw / 2, y: 2.62, w: W - 2 * M - dw, h: 0, line: { color: HEX.accent1, width: 1.5 } });
dates.forEach(([d, h, b], i) => {
  const cx = M + i * dw + dw / 2;
  s.addShape(pres.shapes.OVAL, { x: cx - 0.17, y: 2.45, w: 0.34, h: 0.34, fill: { color: i === 1 ? HEX.accent1 : HEX.dk1 }, line: { color: HEX.lt2, width: 3 } });
  text(s, d, { x: cx - dw / 2 + 0.15, y: 3.05, w: dw - 0.3, h: 0.6, align: "center", fontFace: "Cambria", fontSize: 26, bold: true, color: i === 1 ? HEX.accent2 : HEX.dk1 });
  text(s, h.toUpperCase(), { x: cx - dw / 2 + 0.15, y: 3.7, w: dw - 0.3, h: 0.35, align: "center", fontSize: 13, bold: true, charSpacing: 2 });
  text(s, b, { x: cx - dw / 2 + 0.3, y: 4.1, w: dw - 0.6, h: 1.0, align: "center", fontSize: 14, color: "4A4E52" });
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.5, w: W - 2 * M, h: 0.9, rectRadius: 0.08, fill: { color: HEX.dk2 }, line: { type: "none" } });
text(s, [
  { text: "Not sure yet? ", options: { bold: true, color: HEX.accent1 } },
  { text: "Book your child onto the taster morning, or a free call with us, from the website.", options: { color: HEX.lt1 } },
], { x: M + 0.35, y: 5.5, w: W - 2 * M - 0.7, h: 0.9, fontSize: 17, valign: "middle" });
s.addNotes("Second open evening: Sunday 6 December at 4pm, for anyone who could not come tonight. Encourage the taster morning: it is the best way for a child to see what a live lesson feels like.");

// ══ 18. Questions ══
pres.addSection({ title: "Questions" });
s = pres.addSlide({ masterName: "Dark title", sectionTitle: "Questions" });
s.addImage({ path: IMG("tga-logo-white.png"), x: M, y: 0.8, w: 3.6, h: 3.6 * logoW.h / logoW.w, altText: "Tarbiyyah Global Academy logo" });
s.addText("Your questions", { placeholder: "title" });
s.addText("Ask in the chat, or raise your hand", { placeholder: "body" });
const cx2 = 8.3;
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx2, y: 2.4, w: W - M - cx2, h: 3.6, rectRadius: 0.1, fill: { color: "25292C" }, line: { color: "3A3D40", width: 1 } });
text(s, [
  { text: "WEBSITE", options: { bold: true, charSpacing: 2, color: HEX.accent1, fontSize: 12, breakLine: true } },
  { text: "globalacademy.tarbiyyah.co.uk", options: { color: HEX.lt1, fontSize: 18, breakLine: true } },
  { text: " ", options: { fontSize: 8, breakLine: true } },
  { text: "EMAIL", options: { bold: true, charSpacing: 2, color: HEX.accent1, fontSize: 12, breakLine: true } },
  { text: "globalacademy@tarbiyyah.co.uk", options: { color: HEX.lt1, fontSize: 18, breakLine: true } },
  { text: " ", options: { fontSize: 8, breakLine: true } },
  { text: "NEXT STEPS", options: { bold: true, charSpacing: 2, color: HEX.accent1, fontSize: 12, breakLine: true } },
  { text: "Taster morning, Sat 12 December", options: { color: HEX.lt1, fontSize: 16, breakLine: true } },
  { text: "Apply by Fri 18 December", options: { color: HEX.lt1, fontSize: 16 } },
], { x: cx2 + 0.4, y: 2.7, w: W - M - cx2 - 0.8, h: 3.1, paraSpaceAfter: 2 });
s.addNotes("The host reads questions in the order they came in. Keep the website's FAQ page open in a tab. Close at 8:30pm with thanks and a du'a, and remind everyone of the taster morning (12 December) and the deadline (18 December). Afterwards, send everyone who registered the taster morning link.");

(async () => {
  const out = path.join(D, "TGA-Open-Evening.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("written", out);
})();
