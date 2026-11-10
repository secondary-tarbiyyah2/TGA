// Teacher lesson plan (Word .docx) for one lesson, built from the same JSON
// as the slides. Converted to PDF alongside the deck in the workflow.
//
// A printable A4 plan of one to two pages (three for a full lesson with every
// extra): the header, objectives and success criteria, prior and next
// learning, resources, a timed run-through with routines and teacher actions,
// key questions and the hinge question (what each wrong option reveals),
// misconceptions, the full answer key, adaptations, assessment for learning,
// homework and an "after the lesson" reflection box.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ISLAMIC_SUBJECTS, ROUTINES, itemA, itemQ, itemModel, phaseMinutes, routineFor } from "../../src/lib/learn/lessonSchema.mjs";
import { sortAnswer } from "./deck-parts.mjs";
import { HAS_AR, QURAN_FONT, AR_LANG, arabicFont, isArabicOnly } from "./arabic.mjs";

const require = createRequire(import.meta.url);
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const ROOT = new URL("../../", import.meta.url).pathname;
const LOGO = fs.readFileSync(path.join(ROOT, "public/brand/ga-wordmark.png"));
const LOGO_RATIO = 393 / 120;
const INK = "1B1E21";
const MUTED = "5B6168";
const GOLD_DARK = "7D6428";
const GOLD_SOFT = "F5ECD6";
const CREAM = "FBF7EE";
const LINE = "E3DED2";
const TICK = "2E7D4F";
const FONT = "Calibri";
const PAGE_W = 11906; // A4 in twips
const MARGIN = 794; // 1.4 cm
const CONTENT_W = PAGE_W - MARGIN * 2;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// Arabic in the plan: Word and LibreOffice draw Arabic letters with the run's complex-script font, so every
// run carries Scheherazade New (Qur'an lessons and any ayah) or Noto Naskh Arabic there, a larger
// complex-script size (Arabic reads small beside Calibri) and the Arabic language. A run that is all
// Arabic is right-to-left. Set per plan in buildPlan.
let planQuran = false;
const run = (text, o = {}) => {
  const s = String(text ?? "").replace(/\s+/g, " ");
  const size = o.size || 19;
  if (!HAS_AR.test(s)) return new TextRun({ text: s, font: FONT, size, bold: o.bold, italics: o.italics, color: o.color || INK });
  const cs = arabicFont(s, planQuran);
  return new TextRun({
    text: s,
    font: { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs },
    size,
    sizeComplexScript: Math.round(size * (cs === QURAN_FONT ? 1.35 : 1.2)),
    bold: o.bold,
    boldComplexScript: o.bold,
    italics: o.italics,
    color: o.color || INK,
    language: { value: "en-GB", bidirectional: AR_LANG },
    rightToLeft: isArabicOnly(s) || undefined,
  });
};
const para = (children, o = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { before: o.before ?? 0, after: o.after ?? 50, line: 240 }, alignment: o.align, numbering: o.numbering, keepNext: o.keepNext, indent: o.indent });

function heading(text, accent) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: 19, bold: true, color: accent, characterSpacing: 40 })],
    spacing: { before: 110, after: 50 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 2 } },
    keepNext: true,
  });
}

const bullet = (children, o = {}) => para(Array.isArray(children) ? children : [run(children, o)], { numbering: { reference: "bullets", level: 0 }, after: 30 });
const label = (text, color = GOLD_DARK) => para([run(text.toUpperCase(), { bold: true, color, size: 16 })], { after: 40 });

const border = (color = LINE, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
function cell(children, o = {}) {
  return new TableCell({
    children: (Array.isArray(children) ? children : [children]).map((c) => (typeof c === "string" ? para([run(c, o.text)], { after: 20 }) : c)),
    width: { size: o.w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: o.pad ?? 60, bottom: o.pad ?? 60, left: 100, right: 100 },
    verticalAlign: o.valign,
    columnSpan: o.span,
    borders: o.borders || { top: border(), bottom: border(), left: border(), right: border() },
  });
}

function table(widths, rows, o = {}) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0 && o.header !== false,
          cantSplit: !o.split,
          children: r.map((c, j) => cell(c, { w: widths[j], fill: i === 0 && o.header !== false ? o.headFill || CREAM : o.zebra && i % 2 === 0 ? "FCFAF5" : undefined, text: i === 0 && o.header !== false ? { bold: true, size: 16, color: o.headColor } : { size: 17 } })),
        }),
    ),
  });
}

/**
 * Minutes for each phase, adding up to the lesson length (task phases use the slides' timers; the
 * explanation takes what is left). A ponder question is on screen before the start, so it takes no
 * lesson time; an Islamic link takes 2 minutes. `total` is the sum, which can only pass the lesson
 * length when the items' own minutes leave too little for the explanation.
 */
export function timings(lesson, duration, teachCount, breaks) {
  const ponder = lesson.hook && lesson.hook.type === "ponder";
  const hook = lesson.hook && !ponder ? 1 : 0;
  const islamic = lesson.islamicLink && lesson.islamicLink.text ? 2 : 0;
  const starter = phaseMinutes("starter", lesson.starter, duration);
  const guided = phaseMinutes("practice", lesson.practice, duration);
  const independent = phaseMinutes("independent", lesson.independent, duration);
  const exit = phaseMinutes("exit", lesson.exit, duration);
  const close = 2;
  const teach = Math.max(teachCount * 2, duration - hook - islamic - starter - guided - independent - exit - close);
  const total = hook + islamic + starter + teach + guided + independent + exit + close;
  return { hook, islamic, starter, teach, guided, independent, exit, close, breaks, total };
}

const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const firstSentences = (s, n = 2) => {
  const parts = clean(s).match(/[^.!?]+[.!?]+['"’”)]*(\s|$)/g) || [clean(s)];
  const out = parts.slice(0, n).join("").trim();
  return out.length < clean(s).length ? `${out} …` : out;
};

/** "SEND: … EAL: … Stretch: …" -> [[label, text]]. A line without labels is one entry. */
function adaptations(send) {
  const s = clean(send);
  if (!s) return [];
  const re = /\b(SEND|Support|EAL|Stretch|Challenge|More able|Most able)\s*:\s*/gi;
  const marks = [...s.matchAll(re)];
  if (!marks.length) return [["SEND, EAL and stretch", s]];
  const out = [];
  if (marks[0].index > 0) out.push(["Adapt", s.slice(0, marks[0].index).trim()]);
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : s.length;
    const name = m[1].toLowerCase() === "send" ? "SEND" : m[1].toUpperCase() === "EAL" ? "EAL" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    out.push([name, s.slice(m.index + m[0].length, end).trim().replace(/[.;]\s*$/, ".")]);
  });
  return out;
}

const routineText = (id) => (ROUTINES[id] ? ROUTINES[id].label : "");

/**
 * @param file   { subject, year, board, exam… }
 * @param lesson the lesson JSON
 * @param meta   { yearLabel, accent, band, prev, next, slides: { starter, teach:[n…], guided, independent, exit, close, total, …Answers }, breaks, keyQuestions,
 *                 assess: an assessment lesson's { mode, label, rows: [{ label, rest, marks, a }], marks, minutes } or null }
 */
export async function buildPlan(file, lesson, meta) {
  planQuran = meta.subjectSlug === "quran";
  const accent = meta.accent;
  const duration = meta.duration || lesson.duration || 45;
  const teach = lesson.teach || [];
  const t = timings(lesson, duration, teach.length, meta.breaks || 0);
  const S = meta.slides;
  const kids = meta.band === "early" ? "children" : "pupils";
  const senior = meta.band === "senior";
  const children = [];
  const ks4 = /^y1[01]$/.test(file.year);
  // An assessment lesson (test, mock or quiz): the independent questions are the paper.
  const A = meta.assess || null;
  const marksText = (m) => (m == null ? "" : ` [${m} mark${m === 1 ? "" : "s"}]`);

  // ── Header banner ──────────────────────────────────────────────────────────
  const chip = `${clean(file.subject).toUpperCase()}  ·  ${meta.yearLabel.toUpperCase()}${ks4 && (lesson.boardShort || file.boardShort || lesson.board || file.board) ? `  ·  ${clean(lesson.boardShort || file.boardShort || lesson.board || file.board).toUpperCase()}` : ""}${ks4 && (file.examShort || file.exam) ? `  ·  EXAM: ${clean(file.examShort || file.exam).toUpperCase()}` : ""}`;
  children.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            cell(
              [
                para([run(chip, { bold: true, color: "E3C98F", size: 16 })], { after: 30 }),
                para([run(`Lesson ${lesson.n}: ${clean(lesson.title)}`, { bold: true, color: "FFFFFF", size: 32 })], { after: 30 }),
                para([run(`${clean(lesson.unit)}   ·   ${duration} minutes   ·   ${S.total} slides${A ? `   ·   ${A.label.toUpperCase()}${A.marks ? `, ${A.marks} marks` : ""}` : ""}`, { color: "E8E4D8", size: 17 })], { after: 0 }),
              ],
              { w: CONTENT_W, fill: accent, pad: 140, borders: { top: border(accent), bottom: border(accent), left: border(accent), right: border(accent) } },
            ),
          ],
        }),
      ],
    }),
  );

  // ── Objectives + success criteria | key words ─────────────────────────────
  const sc = (lesson.successCriteria || []).map((x) => clean(x).replace(/^(all|most|some)\s*[:\-–]\s*/i, "")).filter(Boolean).slice(0, 3);
  const leftW = Math.round(CONTENT_W * 0.58);
  const rightW = CONTENT_W - leftW;
  const objs = (lesson.objectives || []).map(clean).filter(Boolean);
  const left = [label(objs.length === 1 ? "Objective (the destination)" : "Objectives"), ...objs.map((o) => (objs.length === 1 ? para([run(o, { bold: true })], { after: 40 }) : bullet(o)))];
  if (sc.length) {
    left.push(label("Success criteria (the steps)"));
    sc.forEach((x, i) => left.push(para([run(`${["All", "Most", "Some"][i]}: `, { bold: true, color: accent }), run(x)], { after: 30 })));
  }
  const ponder = lesson.hook && lesson.hook.type === "ponder" ? lesson.hook : null;
  if (ponder) left.push(para([run(`Ponder (slide ${S.ponder || 1}, while pupils join): `, { bold: true }), run(clean(ponder.text), { italics: true })], { before: 60, after: 20 }));
  if (lesson.bigQuestion) left.push(para([run("Big question: ", { bold: true }), run(clean(lesson.bigQuestion), { italics: true })], { before: ponder ? 0 : 60, after: 20 }));

  const kws = (lesson.keywords || []).slice(0, 8);
  const right = [label("Key words"), ...(kws.length ? kws.map((k) => para([run(`${clean(k.term)}: `, { bold: true, color: accent }), run(clean(k.def), { size: 17 })], { after: 30 })) : [para([run("No new key words this lesson.", { color: MUTED, italics: true })])])];
  children.push(para([], { after: 100 }));
  children.push(new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [leftW, rightW], layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [cell(left, { w: leftW }), cell(right, { w: rightW, fill: CREAM })] })] }));

  // ── Prior learning | next lesson | resources ─────────────────────────────
  const prev = meta.prev;
  const sameUnit = prev && clean(prev.unit) === clean(lesson.unit);
  const prior = prev
    ? [para([run(`Lesson ${prev.n}: ${clean(prev.title)}`, { bold: true, size: 17 })], { after: 20 }), ...(prev.objectives || []).slice(0, 2).map((o) => para([run(`• ${clean(o)}`, { size: 16, color: MUTED })], { after: 10 })), ...(sameUnit ? [] : [para([run("(end of the previous unit)", { size: 16, italics: true, color: MUTED })])])]
    : [para([run("First lesson of the unit. Check what pupils remember from earlier years with the starter.", { size: 17 })])];
  const next = meta.next
    ? [para([run(`Lesson ${meta.next.n}: ${clean(meta.next.title)}`, { bold: true, size: 17 })], { after: 20 }), ...(meta.next.objectives || []).slice(0, 2).map((o) => para([run(`• ${clean(o)}`, { size: 16, color: MUTED })], { after: 10 })), ...(clean(meta.next.unit) !== clean(lesson.unit) ? [para([run(`(starts ${clean(meta.next.unit)})`, { size: 16, italics: true, color: MUTED })])] : [])]
    : [para([run("Last lesson in this sequence.", { size: 17 })])];
  const res = (Array.isArray(lesson.resources) && lesson.resources.length ? lesson.resources : ["Slides", "Mini-whiteboard and pen", "Exercise book"]).map((r) => para([run(`• ${clean(r)}`, { size: 17 })], { after: 10 }));
  if (meta.pupilUrl) res.push(para([run("• Lesson PDF for pupils: slides and worksheet (link on slide 1)", { size: 17 })], { after: 10 }));
  const w3 = Math.floor(CONTENT_W / 3);
  children.push(para([], { after: 80 }));
  children.push(table([w3, w3, CONTENT_W - 2 * w3], [[[label("Prior learning"), ...prior], [label("Next lesson"), ...next], [label("Resources"), ...res]]], { header: false }));
  const links = [lesson.crossCurricular ? ["Cross-curricular: ", lesson.crossCurricular] : null, lesson.smsc ? ["SMSC: ", lesson.smsc] : null].filter(Boolean);
  if (links.length) children.push(para(links.flatMap(([a, b], i) => [run(`${i ? "   ·   " : ""}${a}`, { bold: true, size: 16 }), run(clean(b), { size: 16, color: MUTED })]), { before: 60 }));

  // ── Run-through ────────────────────────────────────────────────────────────
  children.push(heading("Lesson run-through", accent));
  const w = [1050, 750, 1700, CONTENT_W - 3500];
  let clock = 0;
  const at = (mins) => {
    const from = clock;
    clock += mins;
    return `${from}–${clock}`;
  };
  const small = (text, o = {}) => para([run(text, { size: 16, ...o })], { after: 20 });
  // Questions with answers are listed once, in the answer key; the rest are listed here.
  // Questions with an answer are listed in the answer key; the others (open answers) here.
  const qList = (items) => {
    const list = items || [];
    const keyed = list.filter(itemA).length;
    return [...list.map((x, i) => (itemA(x) ? null : small(`${i + 1}. ${clean(itemQ(x))}`))).filter(Boolean), ...(keyed ? [small(`${keyed === list.length ? "All" : keyed} question${keyed === 1 ? "" : "s"} with answers: see the answer key.`, { color: MUTED })] : [])];
  };
  const phase = (name, routine) => [para([run(name, { bold: true, size: 17 })], { after: 20 }), ...(ROUTINES[routine] ? [small(routineText(routine), { color: accent, bold: true })] : [])];
  const slideRef = (a, b) => (b ? `${a}, ${b}` : String(a));
  const rows = [["Time (min)", "Slides", "Phase and routine", "Teacher actions"]];
  const polls = (S.polls || []).filter((p) => p.section !== "hinge");
  const pollNote = (section) => polls.filter((p) => p.section === section).map((p) => small(`Teams poll (slide ${p.slide}${p.answerSlide ? `, answer ${p.answerSlide}` : ""}): ${clean(p.q)}`, { color: accent }));
  if (ponder) rows.push(["Before", String(S.ponder || 1), phase("Ponder", null), [small(clean(ponder.text), { italics: true }), small("On screen as pupils join; take two or three ideas at the start.", { color: MUTED })]]);
  else if (lesson.hook) rows.push([at(t.hook), String(S.hook || 2), phase("Hook", routineFor(lesson, "hook", lesson.hook.type)), [small(clean(lesson.hook.text), { italics: true }), ...(lesson.hook.a ? [small(`Draw out: ${clean(lesson.hook.a)}`, { color: MUTED })] : [])]]);
  if (S.islamicStart) rows.push([at(t.islamic), String(S.islamicStart), phase("Islamic foundation", null), [small(clean(lesson.islamicLink.text), { italics: true })]]);
  // Bismillah belongs in Qur'an, Islamic Studies and Arabic starters only (lessons v3).
  const bism = ISLAMIC_SUBJECTS.includes(meta.subjectSlug);
  rows.push([at(t.starter), slideRef(S.starter, S.starterAnswers), phase(senior ? "Do now" : "Warm-up", routineFor(lesson, "starter")), [small(senior ? `Retrieval, in silence, from memory.${bism ? " Bismillah to begin." : ""}` : `Settle${bism ? ", bismillah" : ""}, quick recall.`, { italics: true, color: MUTED }), ...qList(lesson.starter), ...pollNote("starter"), ...(S.starterAnswers ? [small("Reveal the answers (next slide); pupils self-mark.", { color: MUTED })] : [])]]);
  rows.push([
    at(t.teach),
    range(S.teach[0], S.teach[S.teach.length - 1]),
    [...phase("Explain", null), small("Full script: slide notes", { italics: true, color: MUTED })],
    [
      ...teach.map((x, i) => {
        const r = ROUTINES[x.routine] ? x.routine : x.check ? routineFor(lesson, "hinge") : routineFor(lesson, "teach");
        return para([run(`${S.teach[i]}. ${clean(x.heading)}${x.check ? " (hinge)" : ""}${ROUTINES[r] ? ` [${routineText(r)}]` : ""}: `, { bold: true, size: 16 }), run(x.note ? firstSentences(x.note, 1) : (x.bullets || []).map(clean).join("; "), { size: 16 })], { after: 30 });
      }),
      ...(meta.breaks ? [small(`Includes a one-minute ${meta.band === "early" ? "wiggle" : "brain"} break (no music).`, { italics: true, color: MUTED })] : []),
    ],
  ]);
  rows.push([at(t.guided), slideRef(S.iDo || S.guided, S.guidedAnswers), phase(S.iDo ? "I do, then we do" : senior ? "Guided practice" : "We do", routineFor(lesson, "practice")), [small(S.iDo ? `I do (slide ${S.iDo}): go through the model of question 1 (see Models below), then we do the rest together.` : "Model your thinking aloud; check every pupil before moving on.", { italics: true, color: MUTED }), ...qList(lesson.practice)]]);
  if (A) {
    const qs = S.assessment || [];
    rows.push([
      at(t.independent),
      range(S.examConditions, qs.length ? qs[qs.length - 1] : S.examConditions),
      phase(`${A.label} (exam conditions)`, null),
      [
        small(`Slide ${S.examConditions}: exam conditions. Cameras on, mics off, work alone, no other tabs.${A.minutes ? ` Start a ${A.minutes}-minute timer and put the start and finish times in the chat.` : ""}`, { color: accent, bold: true }),
        ...(A.before ? [small(`Before you start: ${clean(A.before)}`, { color: MUTED })] : []),
        small(`Questions on slide${qs.length > 1 ? "s" : ""} ${qs.join(", ")}. No answers are shown in the lesson; the mark scheme is in the teacher-only section${S.teacherOnly ? ` from slide ${S.teacherOnly}` : ""} and below.`, { italics: true, color: MUTED }),
        ...A.rows.map((r) => small(`${r.label}${marksText(r.marks)}: ${clean(r.rest)}`)),
        ...(A.marks ? [small(`Total: ${A.marks} marks.`, { bold: true })] : []),
      ],
    ]);
  } else rows.push([at(t.independent), slideRef(S.indModel || S.independent, S.independentAnswers), phase(senior ? "Independent" : "You do", routineFor(lesson, "independent")), [...(S.indModel ? [small(`Go through task 1 first (slide ${S.indModel}).`, { color: accent })] : []), small(meta.band === "senior" ? "Core, extend, stretch: pupils start where they can; circulate via chat and cameras." : "Bronze, silver, gold: children choose where to start.", { italics: true, color: MUTED }), ...qList(lesson.independent)]]);
  rows.push([at(t.exit), String(S.exit), phase("Exit ticket", routineFor(lesson, "exit")), [...qList(lesson.exit), ...pollNote("exit"), small("Then a 1-2-3 confidence check on fingers.", { italics: true, color: MUTED })]]);
  if (S.islamicEnd) rows.push([at(t.islamic), String(S.islamicEnd), phase("Islamic position", null), [small(clean(lesson.islamicLink.text), { italics: true })]]);
  rows.push([at(t.close), S.topicKeywords ? `${S.topicKeywords}, ${S.close}` : String(S.close), phase("Close", null), [small(`Homework: ${clean(Array.isArray(lesson.homework) ? lesson.homework.join(" ") : lesson.homework)}`), ...(S.topicKeywords ? [small(`Topic key words for revision (slide ${S.topicKeywords}).`, { color: MUTED })] : []), small("Close with du'a and jazakallahu khayran.", { color: MUTED })]]);
  rows.push([para([run(`${t.total}`, { bold: true, size: 17, color: t.total > duration ? "B03A2E" : INK })], { after: 0 }), "", para([run("Total", { bold: true, size: 17 })], { after: 0 }), [small(t.total > duration ? `The timings add up to ${t.total} minutes, more than the ${duration}-minute lesson: cut an item's minutes.` : `Adds up to the ${duration}-minute lesson.`, { color: t.total > duration ? "B03A2E" : MUTED })]]);
  children.push(table(w, rows, { zebra: true, split: true }));

  // ── Models, polls and pictures (lessons v3) ───────────────────────────────
  const models = [["practice", "We do, question 1", S.iDo], ["independent", "Independent, task 1", S.indModel]].map(([k, name, slide]) => [name, slide, (lesson[k] || [])[0]]).filter(([, , x]) => itemModel(x));
  const pics = meta.pics || [];
  if (models.length || polls.length || pics.length || (S.polls || []).length) {
    children.push(heading("Models, Teams polls and pictures", accent));
    const mrows = [];
    models.forEach(([name, slide, x]) => mrows.push([`Model: ${name}${slide ? ` (slide ${slide})` : ""}`, [small(clean(itemQ(x)), { bold: true }), ...String(itemModel(x)).split(/\n+/).map((l) => small(clean(l)))]]));
    // Polls: one line (each poll's question is in the run-through or the hinge, its answer in the answer key).
    if ((S.polls || []).length) mrows.push(["Teams polls", [small(`${(S.polls || []).map((p) => `${p.section} slide ${p.slide}${p.answerSlide ? ` (answer ${p.answerSlide})` : ""}`).join("; ")}. To run one: Polls (Forms) in the meeting, + New poll, type it, Launch, share the results.`)]]);
    // Credits are on the slides (and in their notes); the plan lists what and where.
    if (pics.length) mrows.push(["Pictures", [small(`${pics.map((p) => `${clean(p.alt)} (${p.for === "hook" ? "first slide" : p.for === "keywords" ? "key words" : `teaching slide ${p.for.slice(6)}`})`).join("; ")}. From Wikimedia Commons; credits on the slides.`)]]);
    else if ((lesson.pictures || []).length) mrows.push(["Pictures", [small(`${lesson.pictures.length} picture(s) are listed but none was found yet on Wikimedia Commons (they are added when the slides are next built).`, { color: MUTED })]]);
    const mw = 2100;
    children.push(table([mw, CONTENT_W - mw], mrows.map((r) => [[para([run(r[0], { bold: true, size: 16, color: accent })], { after: 0 })], r[1]]), { header: false }));

  }

  // ── Key questions, the hinge, misconceptions ───────────────────────────────
  const keyQs = (meta.keyQuestions || []).slice(0, 4);
  const checks = teach.map((x, i) => [x, S.teach[i]]).filter(([x]) => x.check);
  const mis = teach.filter((x) => x.misconception);
  if (keyQs.length || checks.length || mis.length) {
    children.push(heading(mis.length ? "Key questions, hinge and misconceptions" : "Key questions and the hinge question", accent));
    if (!keyQs.length && mis.length) mis.forEach((x) => children.push(para([run("Misconception: ", { bold: true, size: 17, color: "B03A2E" }), run(clean(x.misconception.wrong), { color: "B03A2E", size: 17 }), run("  →  ", { size: 17 }), run(clean(x.misconception.right), { bold: true, size: 17 })], { after: 30 })));
    else if (keyQs.length || mis.length) {
      const kq = keyQs.length ? keyQs.map((q) => bullet(q, { size: 17 })) : [para([run("See the teacher notes on each slide.", { size: 17, color: MUTED })])];
      const ms = mis.length ? mis.map((x) => bullet([run(clean(x.misconception.wrong), { color: "B03A2E", size: 17 }), run("  →  ", { size: 17 }), run(clean(x.misconception.right), { bold: true, size: 17 })])) : [para([run("Listen for errors in the hinge and guided practice.", { size: 17, color: MUTED })])];
      const lw = Math.round(CONTENT_W * 0.55);
      children.push(new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [lw, CONTENT_W - lw], layout: TableLayoutType.FIXED, rows: [new TableRow({ cantSplit: true, children: [cell([label("Key questions to ask", accent), ...kq], { w: lw }), cell([label("Misconceptions to watch for", "B03A2E"), ...ms], { w: CONTENT_W - lw, fill: "FDF3F1" })] })] }));
    }
    checks.forEach(([x, n]) => {
      const c = x.check;
      const ans = Number(c.answer);
      const r = ROUTINES[x.routine] ? x.routine : routineFor(lesson, "hinge");
      children.push(para([run(`Hinge (slide ${n}, ${routineText(r)}): `, { bold: true, color: accent }), run(clean(c.q), { bold: true })], { before: 80, after: 20, keepNext: true }));
      children.push(para((c.options || []).flatMap((o, k) => [run(`${k ? "  ·  " : ""}${"ABCD"[k]} `, { bold: true, size: 17, color: k === ans ? TICK : MUTED }), run(`${clean(o)}${k === ans ? " ✓" : ""}`, { size: 17, bold: k === ans, color: k === ans ? TICK : INK })]), { after: 20, indent: { left: 280 } }));
      children.push(para([run("What the wrong answers reveal: ", { bold: true, size: 17 }), run(clean(c.why), { size: 17 }), run(" Under about 80% right: reteach before moving on.", { size: 17, color: MUTED })], { after: 20 }));
    });
  }

  // ── Answer key ─────────────────────────────────────────────────────────────
  const keyRows = [["Question", "Answer"]];
  const addSection = (name, items) => {
    const list = items || [];
    if (!list.some(itemA)) return;
    keyRows.push({ section: name });
    list.forEach((x, i) => itemA(x) && keyRows.push([`${i + 1}. ${clean(itemQ(x))}`, [para([run(itemA(x) ? clean(itemA(x)) : "Answers will vary.", { size: 17, bold: !!itemA(x), italics: !itemA(x), color: itemA(x) ? INK : MUTED })], { after: 0 })]]));
  };
  addSection(senior ? "Do now" : "Warm-up", lesson.starter);
  if (teach.some((x) => (x.model && x.model.answer) || x.check || (x.sort && Array.isArray(x.sort.answer)))) keyRows.push({ section: "Explanation slides" });
  teach.forEach((x) => {
    if (x.model && x.model.answer) keyRows.push([`Worked example: ${clean(x.model.problem)}`, [para([run(clean(x.model.answer), { bold: true, size: 17 })], { after: 0 })]]);
    if (x.check) keyRows.push([`Hinge: ${clean(x.check.q)}`, [para([run(`${"ABCD"[Number(x.check.answer)] || "?"}: ${clean((x.check.options || [])[Number(x.check.answer)])}`, { bold: true, size: 17 })], { after: 0 })]]);
    if (x.sort && Array.isArray(x.sort.answer)) keyRows.push([`Card sort: ${clean(x.heading)}`, [para([run(sortAnswer(x.sort), { size: 17 })], { after: 0 })]]);
  });
  addSection(senior ? "Guided practice" : "We do", lesson.practice);
  if (A) {
    // The mark scheme: every question with its label and marks, answered or not.
    keyRows.push({ section: `Mark scheme: ${A.label}${A.marks ? ` (${A.marks} marks)` : ""}${S.markScheme && S.markScheme.length ? `, also on teacher-only slide${S.markScheme.length > 1 ? "s" : ""} ${S.markScheme.join(", ")}` : ""}` });
    A.rows.forEach((r) => keyRows.push([`${r.label}${marksText(r.marks)}: ${clean(r.rest)}`, [para([run(r.a ? clean(r.a) : "No answer recorded: mark against the success criteria.", { size: 17, bold: !!r.a, italics: !r.a, color: r.a ? INK : MUTED })], { after: 0 })]]));
  } else addSection("Independent", lesson.independent);
  addSection("Exit ticket", lesson.exit);
  children.push(heading("Answer key", accent));
  if (keyRows.length > 1) {
    const kw = Math.round(CONTENT_W * 0.55);
    children.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: [kw, CONTENT_W - kw],
        layout: TableLayoutType.FIXED,
        rows: keyRows.map((r, i) =>
          r.section
            ? new TableRow({ cantSplit: true, children: [cell([para([run(r.section.toUpperCase(), { bold: true, size: 15, color: accent })], { after: 0 })], { w: CONTENT_W, span: 2, fill: "FCFAF5", pad: 15 })] })
            : new TableRow({ tableHeader: i === 0, cantSplit: true, children: r.map((c, j) => cell(c, { w: j ? CONTENT_W - kw : kw, pad: 12, fill: i === 0 ? CREAM : undefined, text: i === 0 ? { bold: true, size: 16 } : { size: 17 } })) }),
        ),
      }),
    );
  } else children.push(para([run("No answers are recorded for this lesson's questions yet. Add them in the portal's lesson editor (an answer under each question) and they appear here and on the slides.", { italics: true, color: MUTED, size: 17 })]));

  // ── Adaptations | assessment for learning ─────────────────────────────────
  const ad = adaptations(lesson.send).map(([k, v]) => para([run(`${k}: `, { bold: true, color: accent, size: 17 }), run(v, { size: 17 })], { after: 30 }));
  const ind = lesson.independent || [];
  if (ind.length >= 3 && !A) ad.push(para([run("Stretch task: ", { bold: true, color: accent, size: 17 }), run(clean(itemQ(ind[ind.length - 1])).replace(/^(stretch|gold|challenge)\s*[:\-–]\s*/i, ""), { size: 17 })], { after: 30 }));
  if (!ad.length) ad.push(para([run(`Start ${kids} who need support at the first task with a worked example to hand; move confident ${kids} straight to the last task.`, { size: 17 })]));
  const sr = routineFor(lesson, "starter");
  const afl = [
    `Do now${ROUTINES[sr] ? ` (${routineText(sr)})` : ""}: note who cannot recall prior learning.`,
    ...(checks.length ? [`Hinge question${ROUTINES[routineFor(lesson, "hinge")] ? ` (${routineText(routineFor(lesson, "hinge"))})` : ""}: at least 80% correct before moving on.`] : []),
    `Guided practice${ROUTINES[routineFor(lesson, "practice")] ? ` (${routineText(routineFor(lesson, "practice"))})` : ""}: every ${kids === "pupils" ? "pupil" : "child"} answers before you continue.`,
    `Exit ticket${ROUTINES[routineFor(lesson, "exit")] ? ` (${routineText(routineFor(lesson, "exit"))})` : ""} and 1-2-3 confidence: who meets each objective unaided? Plan the next starter around any "not yet".`,
  ].map((x) => para([run(`• ${x}`, { size: 17 })], { after: 30 }));
  const half = Math.round(CONTENT_W / 2);
  children.push(para([], { after: 40 }));
  children.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [half, CONTENT_W - half],
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, children: [cell([label("Adaptations: SEND, EAL, stretch", accent), ...ad], { w: half }), cell([label("Assessment for learning", accent), ...afl], { w: CONTENT_W - half, fill: CREAM })] })],
    }),
  );

  // ── After the lesson ───────────────────────────────────────────────────────
  children.push(para([], { after: 40, keepNext: true }));
  const lines = (n) => Array.from({ length: n }, () => para([run(" ", { size: 17 })], { after: 0 }));
  const third = Math.floor(CONTENT_W / 3);
  children.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [third, third, CONTENT_W - 2 * third],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          cantSplit: true,
          children: ["After the lesson: what went well", "Even better if", `${kids === "pupils" ? "Pupils" : "Children"} to follow up`].map((h, i) =>
            cell([para([run(h, { bold: true, size: 16, color: GOLD_DARK })], { after: 20 }), ...lines(1)], { w: i === 2 ? CONTENT_W - 2 * third : third, fill: GOLD_SOFT, borders: { top: border(GOLD_DARK, 6), bottom: border(GOLD_DARK, 6), left: border(GOLD_DARK, 6), right: border(GOLD_DARK, 6) } }),
          ),
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: "Tarbiyyah Global Academy",
    title: `${file.subject} ${meta.yearLabel} – Lesson ${lesson.n} plan`,
    description: lesson.title,
    styles: { default: { document: { run: { font: FONT, size: 19, color: INK } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }] }] },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 780, bottom: 700, left: MARGIN, right: MARGIN, header: 400, footer: 360 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({ type: "png", data: LOGO, transformation: { width: Math.round(26 * LOGO_RATIO), height: 26 } }),
                  new TextRun({ text: `\tLESSON PLAN  ·  ${clean(file.subject).toUpperCase()}  ·  ${meta.yearLabel.toUpperCase()}  ·  LESSON ${lesson.n}`, font: FONT, size: 16, bold: true, color: GOLD_DARK, characterSpacing: 30 }),
                ],
                tabStops: [{ type: "right", position: CONTENT_W }],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `Tarbiyyah Global Academy · ${clean(lesson.unit)}\t`, font: FONT, size: 15, color: MUTED }),
                  new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: FONT, size: 15, color: MUTED }),
                ],
                tabStops: [{ type: "right", position: CONTENT_W }],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
