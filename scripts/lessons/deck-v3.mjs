// Lessons v3 slides for build-decks.mjs (the owner's design feedback, 9 Nov 2026):
//   ponder        the first slide: one open question to think about while pupils join
//   promise       "Our online class promise" values strip on the title slide
//   islamic       the Islamic foundation (start) or the Islamic position (end)
//   destination   one objective (the destination) set apart from the success criteria (the steps)
//   model         "I do": the teacher's worked model of a practice or independent item
//   poll          Teams poll layout (question, lettered options, vote) and its answer slide
//   keywords      the unit's topic keyword list, and the key-word box in a teach slide's corner
//   picture       a Wikimedia Commons picture with its credit line
//   worksheet     pupil PDF pages with space to write
// Everything is drawn from shapes and text (pictures of people are never used).
import { ROUTINES, itemQ, itemA, itemMins, itemModel, itemOptions } from "../../src/lib/learn/lessonSchema.mjs";

export function makeV3(h) {
  const { header, fitSize, textHeight, clean, fw, khatam, hookIcon, parts, FONT, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, CREAM, LINE, PLAY, BAND } = h;
  const LIGHT_GOLD = "E3C98F";
  const TICK = "3E9B57";

  // ── Small drawn icons ──────────────────────────────────────────────────────
  function icon(s, kind, x, y, d, color) {
    const f = { color };
    const ln = { color, width: 0 };
    switch (kind) {
      case "camera":
        s.addShape("roundRect", { x, y: y + d * 0.22, w: d * 0.68, h: d * 0.56, rectRadius: 0.04, fill: f, line: ln });
        s.addShape("triangle", { x: x + d * 0.62, y: y + d * 0.28, w: d * 0.38, h: d * 0.44, rotate: 270, fill: f, line: ln });
        break;
      case "mic":
        s.addShape("roundRect", { x: x + d * 0.32, y, w: d * 0.36, h: d * 0.62, rectRadius: 0.2, fill: f, line: ln });
        s.addShape("line", { x: x + d * 0.5, y: y + d * 0.66, w: 0, h: d * 0.24, line: { color, width: 2 } });
        s.addShape("line", { x: x + d * 0.3, y: y + d * 0.92, w: d * 0.4, h: 0, line: { color, width: 2 } });
        s.addShape("line", { x: x + d * 0.08, y: y + d * 0.05, w: d * 0.84, h: d * 0.9, line: { color: "C0392B", width: 2.5 } });
        break;
      case "heart":
        s.addShape("heart", { x: x + d * 0.05, y: y + d * 0.08, w: d * 0.9, h: d * 0.84, fill: f, line: ln });
        break;
      case "window":
        s.addShape("rect", { x, y: y + d * 0.1, w: d, h: d * 0.8, fill: { color: "FFFFFF", transparency: 100 }, line: { color, width: 2 } });
        s.addShape("rect", { x, y: y + d * 0.1, w: d, h: d * 0.2, fill: f, line: ln });
        break;
      case "star":
        s.addShape("star5", { x, y, w: d, h: d, fill: f, line: ln });
        break;
      case "flag":
        s.addShape("line", { x: x + d * 0.12, y, w: 0, h: d, line: { color, width: 3 } });
        s.addShape("rtTriangle", { x: x + d * 0.14, y: y + d * 0.02, w: d * 0.8, h: d * 0.5, flipV: true, fill: f, line: ln });
        break;
      case "compass":
        s.addShape("star8", { x, y, w: d, h: d, fill: f, line: ln });
        s.addShape("ellipse", { x: x + d * 0.36, y: y + d * 0.36, w: d * 0.28, h: d * 0.28, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
        break;
      case "doc":
        s.addShape("rect", { x: x + d * 0.15, y, w: d * 0.7, h: d, fill: { color: "FFFFFF" }, line: { color, width: 1.75 } });
        [0.3, 0.5, 0.7].forEach((fy) => s.addShape("line", { x: x + d * 0.28, y: y + d * fy, w: d * 0.44, h: 0, line: { color, width: 1.5 } }));
        break;
    }
  }

  // ── Pictures ────────────────────────────────────────────────────────────────
  const creditLine = (p) => `Photo: ${clean(p.credit)}${p.licence ? `, ${p.licence}` : ""}, Wikimedia Commons`;
  /** A picture fitted into `box` (aspect kept), with its credit line underneath. */
  function picture(s, p, box, o = {}) {
    const capH = o.capH ?? 0.24;
    const ih = box.h - capH;
    const r = (p.w || 4) / (p.h || 3);
    let w = box.w;
    let hh = w / r;
    if (hh > ih) {
      hh = ih;
      w = hh * r;
    }
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (ih - hh) / 2;
    if (o.frame !== false) s.addShape("rect", { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: hh + 0.1, fill: { color: "FFFFFF" }, line: { color: o.dark ? "FFFFFF" : LINE, width: 1, transparency: o.dark ? 60 : 0 } });
    s.addImage({ path: p.path, x, y, w, h: hh, altText: p.alt });
    if (capH > 0) s.addText(creditLine(p), { x: box.x, y: y + hh + 0.05, w: box.w, h: capH, fontFace: FONT, fontSize: o.capPt || 8, color: o.dark ? "D9D4C7" : MUTED, align: "center", valign: "top", fit: "shrink", margin: 0 });
    return { x, y, w, h: hh };
  }

  /** A full slide for a picture that belongs to a teach slide with a block (no room beside the block). */
  function pictureSlide(pptx, ctx, p, heading, stage) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, clean(heading), ctx.band === "early" ? "Look closely" : "Look closely · picture", stage);
    picture(s, p, { x: 0.8, y: 2.1, w: 8.4, h: 4.75 }, { capPt: 9, capH: 0.3 });
    s.addShape("roundRect", { x: 9.55, y: 2.1, w: 3.05, h: 4.75, rectRadius: 0.12, fill: { color: ctx.theme.soft }, line: { color: ctx.theme.soft, width: 0 } });
    s.addText("WHAT CAN YOU SEE?", { x: 9.8, y: 2.3, w: 2.6, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: ctx.accent, charSpacing: 2 });
    s.addText(clean(p.alt), { x: 9.8, y: 2.7, w: 2.6, h: 3.9, fontFace: FONT, fontSize: fitSize(p.alt, 2.6, 3.9, ctx.band === "early" ? 28 : 22, 13), bold: true, color: INK, valign: "top" });
    s.addNotes(`Picture: ${clean(p.alt)}. Ask pupils what they notice before you explain. ${creditLine(p)} (${p.file}).`);
    return s;
  }

  // ── Pupil PDF link ──────────────────────────────────────────────────────────
  /** "Today's lesson PDF" pill, linked to the portal page that opens the pupil PDF. */
  function pdfLink(s, ctx, x, y, w, dark) {
    if (!ctx.pupilUrl) return;
    const hh = 0.62;
    s.addShape("roundRect", { x, y, w, h: hh, rectRadius: hh / 2, fill: { color: dark ? "FFFFFF" : ctx.theme.soft, transparency: dark ? 88 : 0 }, line: { color: dark ? LIGHT_GOLD : ctx.accent, width: 1.5 } });
    icon(s, "doc", x + 0.2, y + 0.13, 0.36, dark ? LIGHT_GOLD : ctx.accent);
    const short = ctx.pupilUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "").replace(/\/$/, "");
    s.addText(
      [
        { text: ctx.band === "early" ? "Today's lesson sheet  " : "Today's lesson PDF  ", options: { bold: true, color: dark ? "FFFFFF" : INK } },
        { text: short, options: { color: dark ? LIGHT_GOLD : ctx.accent, underline: { style: "sng" }, hyperlink: { url: ctx.pupilUrl, tooltip: "Open today's lesson PDF (slides and worksheet)" } } },
      ],
      { x: x + 0.65, y, w: w - 0.8, h: hh, fontFace: FONT, fontSize: fitSize(`Today's lesson PDF ${short}`, w - 0.8, hh, 15, 10), valign: "middle", margin: 0 },
    );
  }

  // ── Ponder ──────────────────────────────────────────────────────────────────
  function ponderSlide(pptx, ctx, lesson, pic) {
    const s = pptx.addSlide();
    const early = ctx.band === "early";
    const th = ctx.theme;
    s.background = { color: early ? "FFFBF3" : th.dark };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    if (early) [[11.3, -1.0, 2.6, 0], [-0.8, 6.3, 2.0, 1], [6.8, 6.9, 1.2, 2]].forEach(([x, y, d, c]) => s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: PLAY[c].solid, transparency: 45 }, line: { color: PLAY[c].solid, width: 0 } }));
    const fg = early ? INK : "FFFFFF";
    const kick = early ? GOLD_DARK : LIGHT_GOLD;
    s.addText(early ? "THINK ABOUT THIS…" : "PONDER WHILE WE WAIT", { x: 0.9, y: 0.6, w: 7.6, h: 0.45, fontFace: FONT, fontSize: early ? 22 : 18, bold: true, color: kick, charSpacing: 6 });
    s.addText(`${ctx.subjectLabel} · ${ctx.yearLabel} · Lesson ${lesson.n}: ${clean(lesson.title)}`, { x: 0.9, y: 1.05, w: 7.6, h: 0.4, fontFace: FONT, fontSize: 13, color: early ? MUTED : "B9B3A5", fit: "shrink" });
    const text = clean(lesson.hook.text);
    const textW = pic ? 7.4 : 8.0;
    const head = early ? FONT : th.head;
    s.addText(text, { x: 0.9, y: 1.6, w: textW, h: 3.4, fontFace: head, fontSize: fitSize(text, early ? textW : fw(textW, head), 3.4, early ? 50 : 46, 24), bold: true, color: fg, valign: "middle" });
    if (pic) picture(s, pic, { x: 8.75, y: 1.3, w: 3.95, h: 4.1 }, { dark: !early });
    else if (early) khatam(s, 9.4, 1.6, 3.0);
    else hookIcon(s, "question", 9.6, 1.7, 2.8);
    // Think while we wait.
    s.addShape("roundRect", { x: 0.9, y: 5.25, w: 7.4, h: 0.9, rectRadius: early ? 0.3 : 0.12, fill: { color: early ? "FFFFFF" : "FFFFFF", transparency: early ? 0 : 90 }, line: { color: early ? "F2B33D" : LIGHT_GOLD, width: 1.5 } });
    s.addShape("star8", { x: 1.1, y: 5.43, w: 0.54, h: 0.54, fill: { color: early ? "F2B33D" : LIGHT_GOLD }, line: { color: early ? "F2B33D" : LIGHT_GOLD, width: 0 } });
    s.addText([{ text: "Think while we wait.  ", options: { bold: true, color: fg } }, { text: early ? "Have an idea ready to share!" : "Jot down your ideas: we will share them when we start.", options: { color: early ? MUTED : "D9D4C7" } }], { x: 1.85, y: 5.25, w: 6.3, h: 0.9, fontFace: FONT, fontSize: early ? 20 : 17, valign: "middle" });
    pdfLink(s, ctx, 0.9, 6.45, 7.4, !early);
    s.addNotes(`PONDER (on screen while pupils join, before the lesson starts). One open question with no single right answer: let pupils think and jot ideas, then take two or three at the start.${lesson.hook.a ? ` What to draw out: ${clean(lesson.hook.a)}` : ""}${ctx.pupilUrl ? ` Today's lesson PDF (slides and worksheet, printable or for a drawing tablet): ${ctx.pupilUrl}` : ""}`);
    return s;
  }

  // ── Our online class promise (title slide) ─────────────────────────────────
  const PROMISE = [
    { icon: "camera", long: "Cameras on", short: "Camera on" },
    { icon: "mic", long: "Mic muted until asked", short: "Mic off" },
    { icon: "heart", long: "Respect and kind words", short: "Kind words" },
    { icon: "window", long: "Stay on this lesson's window", short: "Stay here" },
    { icon: "star", long: "Try your best", short: "Try my best" },
  ];
  function promiseStrip(s, ctx, y, dark) {
    const short = ctx.yearKey === "y1" || ctx.yearKey === "y2";
    const x0 = 0.9;
    const w = 11.9;
    const hh = 0.78;
    s.addShape("roundRect", { x: x0, y, w, h: hh, rectRadius: 0.14, fill: { color: dark ? "FFFFFF" : "FFFFFF", transparency: dark ? 90 : 0 }, line: { color: dark ? LIGHT_GOLD : "F2B33D", width: 1.5 } });
    icon(s, "compass", x0 + 0.18, y + 0.17, 0.44, dark ? LIGHT_GOLD : "F2B33D");
    s.addText([{ text: "OUR ONLINE", options: { breakLine: true } }, { text: "CLASS PROMISE" }], { x: x0 + 0.7, y, w: 1.75, h: hh, fontFace: FONT, fontSize: 11, bold: true, color: dark ? LIGHT_GOLD : GOLD_DARK, charSpacing: 1, valign: "middle", margin: 0 });
    const left = x0 + 2.5;
    const cw = (x0 + w - 0.15 - left) / PROMISE.length;
    PROMISE.forEach((p, i) => {
      const x = left + i * cw;
      if (i) s.addShape("line", { x: x - 0.04, y: y + 0.16, w: 0, h: hh - 0.32, line: { color: dark ? "FFFFFF" : LINE, width: 1, transparency: dark ? 70 : 0 } });
      icon(s, p.icon, x + 0.06, y + 0.2, 0.38, dark ? LIGHT_GOLD : ctx.accent);
      const label = short ? p.short : p.long;
      s.addText(label, { x: x + 0.52, y, w: cw - 0.58, h: hh, fontFace: FONT, fontSize: fitSize(label, cw - 0.58, hh - 0.08, short ? 16 : 14, 9), bold: true, color: dark ? "FFFFFF" : INK, valign: "middle", margin: 0 });
    });
  }

  // ── Islamic link ─────────────────────────────────────────────────────────────
  function islamicSlide(pptx, ctx, link) {
    const s = pptx.addSlide();
    const th = ctx.theme;
    const early = ctx.band === "early";
    const start = link.at !== "end";
    s.background = { color: "0B4F45" };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    parts.motif(s, { ...th, motif: "arabesque" }, { x: 9.6, y: 0.4, w: 3.5, h: 6.7 });
    s.addText(start ? (early ? "WHAT ALLAH TEACHES US" : "OUR FOUNDATION") : early ? "WHAT WE BELIEVE" : "THE ISLAMIC POSITION", { x: 0.9, y: 0.8, w: 8.2, h: 0.45, fontFace: FONT, fontSize: early ? 22 : 18, bold: true, color: LIGHT_GOLD, charSpacing: 5 });
    s.addText(start ? "Where today's learning begins" : "What we hold to be true", { x: 0.9, y: 1.3, w: 8.2, h: 0.4, fontFace: FONT, fontSize: 15, color: "B9D4CC" });
    const text = clean(link.text);
    s.addShape("line", { x: 0.9, y: 1.95, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
    s.addText(text, { x: 0.9, y: 2.2, w: 8.3, h: 4.4, fontFace: early ? FONT : "Cambria", fontSize: fitSize(text, early ? 8.3 : fw(8.3, "Cambria"), 4.4, early ? 34 : 30, 16), color: "FFFFFF", valign: "middle" });
    s.addNotes(
      start
        ? "ISLAMIC FOUNDATION: start from this before the content. Read it with the class and ask how it changes the way we look at today's topic."
        : "ISLAMIC POSITION: the specification content was taught factually; here is what Muslims believe. Make clear which is the theory taught for the exam and which is our belief.",
    );
    return s;
  }

  // ── Destination (one objective) and the steps (success criteria) ─────────────
  function destinationSlide(pptx, ctx, lesson) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const early = ctx.band === "early";
    const th = ctx.theme;
    header(s, ctx, early ? "Today we will…" : ctx.band === "junior" ? "Today's mission" : "Where we are going", early ? "Our learning" : "Objective and success criteria", null);
    const objs = (lesson.objectives || []).map(clean).filter(Boolean).slice(0, 3);
    const sc = (lesson.successCriteria || []).map((x) => clean(x).replace(/^(all|most|some)\s*[:\-–]\s*/i, "")).filter(Boolean).slice(0, 3).map((x) => x[0].toUpperCase() + x.slice(1));
    // Without success criteria (older lessons) the destination panel is centred on the slide.
    const dY = sc.length ? 2.1 : 2.8;
    const dH = sc.length ? 1.55 : 3.2;
    const fill = early ? ctx.accent : th.dark;
    s.addShape("roundRect", { x: 0.8, y: dY, w: 11.8, h: dH, rectRadius: 0.14, fill: { color: fill }, line: { color: fill, width: 0 } });
    icon(s, "flag", 1.1, dY + 0.3, 0.75, LIGHT_GOLD);
    s.addText(early ? "WHERE WE ARE GOING" : objs.length > 1 ? "THE DESTINATION · OBJECTIVES" : "THE DESTINATION · OUR OBJECTIVE", { x: 2.1, y: dY + 0.15, w: 9.5, h: 0.32, fontFace: FONT, fontSize: 12, bold: true, color: LIGHT_GOLD, charSpacing: 3 });
    const objText = objs.length > 1 ? objs.map((o) => `• ${o}`) : objs;
    const objSize = fitSize(objText, early ? 10.2 : fw(10.2, th.head), dH - 0.6, early ? 32 : sc.length ? 28 : 32, 14, 4);
    s.addText(objText.map((o, i) => ({ text: o, options: { breakLine: i < objText.length - 1 } })), { x: 2.1, y: dY + 0.47, w: 10.3, h: dH - 0.57, fontFace: early ? FONT : th.head, fontSize: objSize, bold: true, color: "FFFFFF", valign: "middle" });
    if (sc.length) {
      // The steps: a staircase rising towards the destination (All, then Most, then Some).
      const tiers = early ? ["Everyone", "Most of us", "Super star"] : ["All", "Most", "Some"];
      const colors = [ctx.accent, th.dark, GOLD_DARK];
      s.addText(early ? "STEPS TO GET THERE" : "THE STEPS · SUCCESS CRITERIA (HOW WE KNOW WE ARE GETTING THERE)", { x: 0.8, y: 3.82, w: 11.8, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: ctx.accent, charSpacing: 2 });
      const gap = 0.22;
      const w = (11.8 - gap * (sc.length - 1)) / sc.length;
      const base = 6.85;
      const heights = [2.0, 2.3, 2.6];
      const size = Math.min(...sc.map((x, i) => fitSize(x, w - 0.5, heights[0] - 0.75, early ? 26 : 20, 12)));
      sc.forEach((x, i) => {
        const hh = heights[i];
        const bx = 0.8 + i * (w + gap);
        const by = base - hh;
        s.addShape("roundRect", { x: bx, y: by, w, h: hh, rectRadius: 0.1, fill: { color: early ? PLAY[i].tint : "FFFFFF" }, line: { color: colors[i], width: 2 } });
        s.addShape("rect", { x: bx, y: by, w, h: 0.5, fill: { color: colors[i] }, line: { color: colors[i], width: 0 } });
        s.addText(`STEP ${i + 1} · ${tiers[i].toUpperCase()}`, { x: bx + 0.2, y: by, w: w - 0.4, h: 0.5, fontFace: FONT, fontSize: 13, bold: true, color: "FFFFFF", charSpacing: 2, valign: "middle", margin: 0 });
        if (early) for (let k = 0; k <= i; k++) s.addShape("star5", { x: bx + w - 0.45 - k * 0.36, y: by + 0.1, w: 0.3, h: 0.3, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
        s.addText(x, { x: bx + 0.25, y: by + 0.58, w: w - 0.5, h: hh - 0.68, fontFace: FONT, fontSize: size, bold: early, color: INK, valign: "top" });
        if (i < sc.length - 1) s.addShape("rightArrow", { x: bx + w - 0.08, y: by + 0.9, w: gap + 0.16, h: 0.3, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
      });
    }
    const extras = [lesson.crossCurricular ? `Cross-curricular link: ${clean(lesson.crossCurricular)}` : "", lesson.smsc ? `SMSC: ${clean(lesson.smsc)}` : ""].filter(Boolean).join(" ");
    s.addNotes(`The objective is the destination: one high-level aim for the lesson. The success criteria are the steps that show pupils are getting there: everyone reaches step 1, most reach step 2, some reach step 3. Come back to this slide at the exit ticket.${extras ? ` ${extras}` : ""}`);
    return s;
  }

  // ── I do: the teacher's model ─────────────────────────────────────────────────
  // English models use the school's frameworks (PETZAAL, PESTAL, PEEDL, PEMACS, TAPS, CLOSER), written
  // "Point: ... | Evidence: ... | Zoom in: ...": those labels are recognised too, and the "|" separators dropped.
  const LABELS = /(?:^|\s|\n)(Point|Evidence|Explain|Explanation|Analysis|Analyse|Link|Evaluate|Evaluation|Judgement|Conclusion|Topic sentence|Context|Method|Methods|Working|Answer|Check|Step \d+|Technique|Zoom in|Zoom|Alternative|Structural strategy|Terminology|Audience impact|Develop|Effect|Second method|Application|Thesis|Argument|Engagement|Concept|Conceptualise|Synthesis|Synthesise|Before|After|Capture|Lead the lens|Observe|Sense \d|Mood|Viewpoint|Hook|Exposition|Tension|Resolution|Climax|Reveal|Delay|Plan|Opening|Introduction|Paragraph \d?|Summary|For|Against|Type|Author's purpose|Perspective|Second poem|Subject|Close-up|Atmosphere|Interpretation|Weigh|Difference|Ending)\s*:\s*/g;
  const unbar = (t) => t.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
  /** Split a model into labelled parts (Point / Evidence…), lines or numbered steps; else one paragraph. */
  function modelParts(model) {
    const m = String(model || "").trim();
    const marks = [...m.matchAll(LABELS)];
    if (marks.length >= 2) {
      const out = [];
      if (marks[0].index > 0 && unbar(m.slice(0, marks[0].index))) out.push({ text: unbar(m.slice(0, marks[0].index)) });
      marks.forEach((x, i) => out.push({ label: x[1], text: unbar(m.slice(x.index + x[0].length, i + 1 < marks.length ? marks[i + 1].index : m.length)) }));
      return out.filter((p) => p.text);
    }
    if (m.includes("\n")) return m.split(/\n+/).map((t) => ({ text: t.trim() })).filter((x) => x.text);
    const numbered = m.split(/\s(?=\d+[.)]\s)/);
    if (numbered.length >= 2) return numbered.map((t) => ({ text: t.replace(/^\d+[.)]\s*/, "").trim() }));
    return [{ text: m }];
  }

  function modelSlide(pptx, ctx, item, o) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const early = ctx.band === "early";
    const th = ctx.theme;
    header(s, ctx, o.title, o.kicker, o.stage, null, null);
    const q = clean(itemQ(item));
    const qH = 1.05;
    s.addShape("roundRect", { x: 0.8, y: 2.1, w: 11.8, h: qH, rectRadius: 0.1, fill: { color: th.dark }, line: { color: th.dark, width: 0 } });
    s.addText(early ? "WATCH ME FIRST" : "I DO · WATCH THE MODEL", { x: 1.1, y: 2.16, w: 6, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: LIGHT_GOLD, charSpacing: 3 });
    s.addText(q, { x: 1.1, y: 2.44, w: 11.2, h: qH - 0.4, fontFace: early ? FONT : th.head, fontSize: fitSize(q, early ? 11.2 : fw(11.2, th.head), qH - 0.42, 24, 12), bold: true, color: "FFFFFF", valign: "middle" });
    const ps = modelParts(itemModel(item));
    const top = 3.35;
    const avail = 6.85 - top;
    const labelled = ps.some((p) => p.label);
    const gap = 0.12;
    const rowH = Math.min(ps.length === 1 ? Math.min(avail, 2.2) : 1.3, (avail - gap * (ps.length - 1)) / ps.length);
    const textW = labelled ? 9.6 : 10.9;
    const size = Math.min(...ps.map((p) => fitSize(p.text, textW, rowH - 0.1, early ? 32 : ps.length === 1 ? 28 : 22, 11)));
    const colors = [ctx.accent, th.dark, GOLD_DARK, "3E7CB1", "7A5BA8", "2E7D4F"];
    ps.forEach((p, i) => {
      const y = top + i * (rowH + gap);
      s.addShape("roundRect", { x: 0.8, y, w: 11.8, h: rowH, rectRadius: 0.08, fill: { color: i % 2 ? "FFFFFF" : CREAM }, line: { color: LINE, width: 0.75 } });
      if (labelled) {
        const c = colors[i % colors.length];
        s.addShape("roundRect", { x: 0.95, y: y + rowH / 2 - 0.27, w: 1.85, h: 0.54, rectRadius: 0.27, fill: { color: p.label ? c : "C9C2B3" }, line: { color: p.label ? c : "C9C2B3", width: 0 } });
        s.addText(p.label || "Start", { x: 0.95, y: y + rowH / 2 - 0.27, w: 1.85, h: 0.54, fontFace: FONT, fontSize: fitSize(p.label || "Start", 1.75, 0.5, 15, 9), bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      } else {
        s.addShape("ellipse", { x: 1.0, y: y + rowH / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
        s.addText(String(i + 1), { x: 1.0, y: y + rowH / 2 - 0.22, w: 0.44, h: 0.44, fontFace: FONT, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      }
      s.addText(p.text, { x: labelled ? 2.95 : 1.65, y, w: textW, h: rowH, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, color: INK, valign: "middle" });
    });
    s.addNotes(`I DO: go through this model aloud before pupils try${o.next ? ` (${o.next})` : ""}. Say what you are thinking at each step${labelled ? " and name each part of the structure" : ""}, then check pupils can tell you the steps back.${itemA(item) ? ` Answer: ${clean(itemA(item))}` : ""}`);
    return s;
  }

  // ── Teams polls ──────────────────────────────────────────────────────────────
  const LAUNCH = "Teacher: in the Teams meeting choose Polls (Forms) > + New poll, type the question and options, then Launch. Share the results when everyone has voted.";
  /** The index of the right option for a poll item's answer ("B) 700", "B", or the option text), or -1. */
  function correctIndex(options, answer) {
    const a = clean(answer);
    if (!a) return -1;
    const m = a.match(/^([A-D])(?:[).:\s]|$)/);
    if (m) return "ABCD".indexOf(m[1]);
    const low = a.toLowerCase();
    return options.findIndex((o) => low.startsWith(clean(o).toLowerCase()) || clean(o).toLowerCase() === low);
  }

  function optionTiles(s, ctx, options, area, opts = {}) {
    const n = options.length;
    const cols = n === 4 ? 2 : n;
    const rows = Math.ceil(n / cols);
    const gap = 0.25;
    const ow = (area.w - gap * (cols - 1)) / cols;
    const oh = (area.h - gap * (rows - 1)) / rows;
    const size = Math.min(...options.map((o) => fitSize(o, ow - 1.3, oh - 0.15, ctx.band === "early" ? 32 : 26, 12)));
    options.forEach((o, i) => {
      const x = area.x + (i % cols) * (ow + gap);
      const y = area.y + Math.floor(i / cols) * (oh + gap);
      const right = opts.correct === i;
      const faded = opts.correct != null && opts.correct >= 0 && !right;
      s.addShape("roundRect", { x, y, w: ow, h: oh, rectRadius: 0.1, fill: { color: right ? "E6F4EA" : "FFFFFF" }, line: { color: right ? TICK : LINE, width: right ? 2.5 : 1 } });
      s.addShape("roundRect", { x: x + 0.2, y: y + oh / 2 - 0.36, w: 0.72, h: 0.72, rectRadius: 0.12, fill: { color: right ? TICK : faded ? "C9C2B3" : ctx.theme.dark }, line: { color: "FFFFFF", width: 0 } });
      s.addText(right ? "✓" : "ABCD"[i], { x: x + 0.2, y: y + oh / 2 - 0.36, w: 0.72, h: 0.72, fontFace: right ? "DejaVu Sans" : FONT, fontSize: 24, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      s.addText(clean(o), { x: x + 1.1, y, w: ow - 1.25, h: oh, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, color: faded ? "8C877C" : INK, bold: right, valign: "middle" });
    });
  }

  function questionPanel(s, ctx, q, y, hh) {
    s.addShape("roundRect", { x: 0.8, y, w: 11.8, h: hh, rectRadius: 0.1, fill: { color: ctx.theme.soft }, line: { color: ctx.theme.soft, width: 0 } });
    s.addShape("rect", { x: 0.8, y: y + 0.15, w: 0.12, h: hh - 0.3, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
    s.addText(clean(q), { x: 1.2, y, w: 11.2, h: hh, fontFace: ctx.band === "early" ? FONT : ctx.theme.head, fontSize: fitSize(q, ctx.band === "early" ? 11.2 : fw(11.2, ctx.theme.head), hh - 0.1, ctx.band === "early" ? 34 : 28, 14), bold: true, color: INK, valign: "middle" });
  }

  /** A Teams poll: the question, 2-4 lettered options and "Vote in the Teams poll". */
  function pollSlide(pptx, ctx, poll, o) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, o.title, o.kicker, o.stage, o.mins, "teams-poll");
    questionPanel(s, ctx, poll.q, 2.1, 1.2);
    optionTiles(s, ctx, poll.options.slice(0, 4), { x: 0.8, y: 3.5, w: 11.8, h: 2.35 });
    s.addShape("roundRect", { x: 0.8, y: 6.02, w: 11.8, h: 0.83, rectRadius: 0.12, fill: { color: ctx.theme.dark }, line: { color: ctx.theme.dark, width: 0 } });
    parts.routineIcon(s, "teams-poll", 1.05, 6.2, 0.46, LIGHT_GOLD);
    s.addText([{ text: ctx.band === "early" ? "VOTE IN THE TEAMS POLL!" : "VOTE IN THE TEAMS POLL", options: { bold: true, color: "FFFFFF", charSpacing: 2, breakLine: true } }, { text: LAUNCH, options: { color: "C9D3D1", fontSize: 10 } }], { x: 1.7, y: 6.02, w: 10.7, h: 0.83, fontFace: FONT, fontSize: 17, valign: "middle" });
    s.addNotes(`TEAMS POLL. ${LAUNCH} Give about 30 seconds, then show the results and the next slide (the answer). If a third or more chose the same wrong answer, re-teach that point.${o.answer ? ` Answer: ${clean(o.answer)}` : ""}${o.why ? ` ${clean(o.why)}` : ""}`);
    return s;
  }

  /** After a poll: the right option ticked, the others faded, and why. */
  function pollAnswerSlide(pptx, ctx, poll, o) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    header(s, ctx, ctx.band === "early" ? "Did you get it?" : "Poll answer", o.kicker, o.stage);
    const opts = poll.options.slice(0, 4);
    const idx = o.index != null ? o.index : correctIndex(opts, o.answer);
    questionPanel(s, ctx, poll.q, 2.1, 1.0);
    const why = clean(o.why || (idx < 0 ? o.answer : ""));
    optionTiles(s, ctx, opts, { x: 0.8, y: 3.3, w: 11.8, h: why ? 2.3 : 3.5 }, { correct: idx });
    if (why) {
      s.addShape("roundRect", { x: 0.8, y: 5.8, w: 11.8, h: 1.05, rectRadius: 0.1, fill: { color: GOLD_SOFT }, line: { color: GOLD, width: 1.5 } });
      s.addText([{ text: idx < 0 ? "ANSWER   " : "WHY   ", options: { bold: true, color: GOLD_DARK, fontSize: 12, charSpacing: 2 } }, { text: why, options: { color: INK } }], { x: 1.05, y: 5.8, w: 11.3, h: 1.05, fontFace: FONT, fontSize: fitSize(why, 10.2, 1.0, 20, 11), valign: "middle" });
    }
    s.addNotes("Show after the poll results. Ask someone who chose a wrong option what made it look right, then fix the misconception together.");
    return s;
  }

  // ── Key words ────────────────────────────────────────────────────────────────
  const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** The lesson's key words that appear in a teach slide (heading, bullets, block text), in order of first use. */
  function termsIn(t, keywords) {
    const { note, routine, ...rest } = t || {};
    void note;
    void routine;
    const text = JSON.stringify(rest).toLowerCase();
    return keywords
      .map((k) => {
        const term = clean(k.term).toLowerCase();
        if (term.length < 2) return null;
        const at = text.search(new RegExp(`(^|[^\\p{L}])${escapeRe(term)}`, "u"));
        return at >= 0 ? { k, at } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.at - b.at)
      .map((x) => x.k);
  }
  /** Width of the corner key-word box for these terms (0 when none). */
  const kwText = (terms) => terms.map((k) => clean(k.term)).join("  ·  ");
  /** One line at 14pt when it fits in 3.8 inches, else two lines. */
  const kwBoxWidth = (terms) => {
    if (!terms.length) return 0;
    const one = 0.34 + (kwText(terms).length * 14 * 0.5) / 72;
    return Math.max(1.7, Math.min(3.8, one > 3.8 ? one / 2 + 0.3 : one));
  };
  /** The small key-word box in a teach slide's corner (top right, under the journey tracker). */
  function keywordCorner(s, ctx, terms, right, y) {
    const w = kwBoxWidth(terms);
    const x = right - w;
    const hh = 0.74;
    s.addShape("roundRect", { x, y, w, h: hh, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: ctx.accent, width: 1.25, dashType: "dash" } });
    s.addText("KEY WORDS", { x: x + 0.12, y: y + 0.04, w: w - 0.24, h: 0.2, fontFace: FONT, fontSize: 8, bold: true, color: ctx.accent, charSpacing: 2, margin: 0 });
    const txt = kwText(terms);
    s.addText(txt, { x: x + 0.12, y: y + 0.24, w: w - 0.24, h: hh - 0.28, fontFace: FONT, fontSize: Math.max(10, fitSize(txt, w - 0.1, hh - 0.22, ctx.band === "early" ? 20 : 16, 9)), bold: true, color: INK, valign: "middle", margin: 0 });
    return w;
  }

  /** The unit's key words (collected across its lessons), today's highlighted. Second-to-last slide. */
  function topicKeywordsSlide(pptx, ctx, lesson, unitKeywords, pics) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const early = ctx.band === "early";
    const unitShort = clean(lesson.unit).split(/[:(]/)[0].trim().slice(0, 40);
    header(s, ctx, early ? "All our topic words" : "Topic key words", `${unitShort} · every lesson's key words`, null);
    const today = new Set((lesson.keywords || []).map((k) => clean(k.term).toLowerCase()));
    const words = unitKeywords.slice(0, early ? 12 : 20);
    const picW = pics.length ? 3.0 : 0;
    const areaW = 11.8 - (picW ? picW + 0.25 : 0);
    const cols = words.length <= 4 ? 2 : words.length <= 12 ? 3 : 4;
    const rows = Math.ceil(words.length / cols);
    const gap = 0.14;
    const w = (areaW - gap * (cols - 1)) / cols;
    const hh = Math.min(1.25, (4.7 - gap * (rows - 1)) / rows);
    // Terms on one line (sized by width); definitions take the rest of the card.
    const termPt = Math.min(early ? 20 : 18, ...words.map((k) => Math.floor((w - 1.15) * 72 / Math.max(4, clean(k.term).length * 0.55))));
    const defPt = Math.max(11, Math.min(...words.map((k) => fitSize(k.def, w - 0.3, hh - 0.4, early ? 20 : 16, 11))));
    words.forEach((k, i) => {
      const x = 0.8 + (i % cols) * (w + gap);
      const y = 2.12 + Math.floor(i / cols) * (hh + gap);
      const on = today.has(clean(k.term).toLowerCase());
      s.addShape("roundRect", { x, y, w, h: hh, rectRadius: 0.08, fill: { color: on ? ctx.theme.soft : "FFFFFF" }, line: { color: on ? ctx.accent : LINE, width: on ? 1.75 : 0.75 } });
      s.addText(clean(k.term), { x: x + 0.15, y: y + 0.05, w: w - (on ? 1.1 : 0.3), h: 0.34, fontFace: FONT, fontSize: termPt, bold: true, color: on ? ctx.accent : INK, valign: "middle", margin: 0 });
      if (on) s.addText("TODAY", { x: x + w - 0.85, y: y + 0.08, w: 0.7, h: 0.24, fontFace: FONT, fontSize: 8, bold: true, color: "FFFFFF", align: "center", valign: "middle", fill: { color: ctx.accent }, margin: 0 });
      s.addText(clean(k.def), { x: x + 0.15, y: y + 0.38, w: w - 0.3, h: hh - 0.42, fontFace: FONT, fontSize: defPt, color: on ? INK : MUTED, valign: "top", margin: 0, fit: "shrink" });
    });
    if (picW) {
      const ph = Math.min(2.3, (4.7 - 0.15 * (pics.length - 1)) / pics.length);
      pics.slice(0, 3).forEach((p, i) => picture(s, p, { x: 12.6 - picW, y: 2.12 + i * (ph + 0.15), w: picW, h: ph }, { capPt: 7 }));
    }
    s.addNotes("The key words for the whole unit; today's are highlighted. Pupils can use this as a revision list: cover the definitions and test a partner.");
    return s;
  }

  /** Key-word cards with a picture in the card of the word it shows. Returns true when drawn. */
  function keywordCardPicture(s, p, x, y, w, hh) {
    picture(s, p, { x, y, w, h: hh }, { capPt: 7, capH: 0.2 });
  }

  // ── Worksheet (pupil PDF) ────────────────────────────────────────────────────
  /** Lines to leave for an item: by its minutes and how much writing it asks for. */
  function linesFor(item) {
    if (itemOptions(item)) return 0;
    const q = itemQ(item);
    const mins = itemMins(item) || 3;
    const long = /\b(\d+)[- ]mark|paragraph|essay|explain|describe|evaluate|justify|write (a|three|two|an)|plan the|design/i.test(q);
    return Math.max(2, Math.min(long ? 12 : 6, Math.round(mins * (long ? 1.2 : 0.9))));
  }

  /** Worksheet pages: every practice, independent and exit item with space to write. */
  function worksheetPages(pptx, ctx, lesson) {
    // An assessment: its questions keep their labels (Question 1, Section A…) and marks.
    const A = ctx.assess;
    const sections = [
      [ctx.band === "early" ? "Together" : "We do", lesson.practice],
      [A ? `${A.label}${A.marks ? ` · ${A.marks} marks` : ""}${A.minutes ? ` · ${A.minutes} minutes` : ""}` : ctx.band === "early" ? "My turn" : "You do", lesson.independent, A],
      ["Exit ticket", lesson.exit],
    ];
    const early = ctx.band === "early";
    const LINE_GAP = early ? 0.56 : 0.44; // wider lines for the youngest writers
    const qPt = early ? 22 : 16;
    const top = 1.3;
    const bottom = 6.85;
    let s = null;
    let y = bottom;
    let page = 0;
    const newPage = () => {
      s = pptx.addSlide({ masterName: "TGA_CONTENT" });
      page++;
      // A compact heading (not the slide header) so the page is mostly space to write.
      s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.05, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
      s.addText(page === 1 ? "My worksheet" : "My worksheet (continued)", { x: 0.8, y: 0.3, w: 6.5, h: 0.55, fontFace: ctx.band === "early" ? FONT : ctx.theme.head, fontSize: 26, bold: true, color: INK, valign: "middle", margin: 0 });
      s.addText("Write your answers here, on paper or on a drawing tablet.", { x: 7.3, y: 0.3, w: 5.3, h: 0.55, fontFace: FONT, fontSize: 12, italic: true, color: MUTED, align: "right", valign: "middle", margin: 0 });
      s.addShape("line", { x: 0.8, y: 0.98, w: 1.2, h: 0, line: { color: GOLD, width: 3 } });
      y = top;
    };
    let n = 0;
    for (const [name, items, assess] of sections) {
      const list = (items || []).filter((x) => clean(itemQ(x)));
      if (!list.length) continue;
      if (!s || y + 0.4 + 0.5 + LINE_GAP * 2 > bottom) newPage();
      s.addText(name.toUpperCase(), { x: 0.8, y, w: 11.8, h: 0.34, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3, margin: 0 });
      s.addShape("line", { x: 0.8, y: y + 0.36, w: 11.8, h: 0, line: { color: ctx.accent, width: 1.5 } });
      y += 0.48;
      for (const [k, item] of list.entries()) {
        n++;
        const poll = itemOptions(item);
        const row = assess ? assess.rows[k] : null;
        const q = row ? clean(poll ? poll.q : row.rest) : clean(poll ? poll.q : itemQ(item));
        const num = row ? `${row.label}${row.marks != null ? ` [${marksText(row.marks)}]` : ""}:  ` : `${n}.  `;
        const qH = Math.max(0.42, textHeight(`${num}${q}`, 11.6, qPt) + 0.02);
        const lines = assess ? Math.max(linesFor(item), Math.min(12, (row && row.marks) || 0)) : linesFor(item);
        const need = qH + (poll ? 0.5 : lines * LINE_GAP) + 0.18;
        if (y + Math.min(need, qH + 2 * LINE_GAP) > bottom) newPage();
        s.addText([{ text: num, options: { bold: true, color: ctx.accent } }, { text: q, options: { color: INK } }], { x: 0.8, y, w: 11.8, h: qH, fontFace: FONT, fontSize: qPt, valign: "top", margin: 0 });
        y += qH + 0.04;
        if (poll) {
          const ow = 11.6 / poll.options.length;
          poll.options.forEach((o, i) => {
            s.addShape("ellipse", { x: 1.0 + i * ow, y: y + 0.08, w: 0.3, h: 0.3, fill: { color: "FFFFFF" }, line: { color: INK, width: 1 } });
            s.addText(`${"ABCD"[i]}  ${clean(o)}`, { x: 1.4 + i * ow, y, w: ow - 0.5, h: 0.46, fontFace: FONT, fontSize: fitSize(o, ow - 0.9, 0.46, 14, 9), color: INK, valign: "middle", margin: 0 });
          });
          y += 0.6;
        } else {
          for (let k = 0; k < lines; k++) {
            if (y + LINE_GAP > bottom) newPage();
            y += LINE_GAP;
            s.addShape("line", { x: 1.1, y, w: 11.5, h: 0, line: { color: "B9B3A5", width: 0.75 } });
          }
          y += 0.22;
        }
      }
    }
    return page;
  }

  // ── Assessment lessons (assessmentMode: test, mock, quiz) ────────────────────
  const RED = "B03A2E";
  const marksText = (m) => (m == null ? "" : `${m} mark${m === 1 ? "" : "s"}`);
  /** An oral assessment (speaking, recitation, phonics 1:1): pupils unmute when called, not "mics off". */
  const oral = (lesson) => /\b(speaking|oral|recit\w*|hifdh|phonics|1:1|role play)\b/i.test(`${lesson.title} ${lesson.unit}`);

  /** Before the questions: the timer, the marks and the exam conditions. */
  function examConditionsSlide(pptx, ctx, lesson, a) {
    const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
    const early = ctx.band === "early";
    const th = ctx.theme;
    header(s, ctx, `${a.label} conditions`, `${a.label} · before you start`, 3, a.minutes, null);
    // Timer and marks panel.
    s.addShape("roundRect", { x: 0.8, y: 2.1, w: 11.8, h: 1.6, rectRadius: 0.14, fill: { color: th.dark }, line: { color: th.dark, width: 0 } });
    const facts = [
      [a.minutes ? `${a.minutes}` : "–", a.minutes === 1 ? "MINUTE" : "MINUTES"],
      [a.marks ? `${a.marks}` : "–", "MARKS"],
      [`${a.count}`, a.count === 1 ? "QUESTION" : a.mode === "mock" && a.sections ? "SECTIONS" : "QUESTIONS"],
    ];
    const fw3 = 11.8 / 4;
    facts.forEach(([big, small], i) => {
      const x = 0.8 + i * fw3;
      if (i) s.addShape("line", { x, y: 2.35, w: 0, h: 1.1, line: { color: "FFFFFF", width: 1, transparency: 70 } });
      s.addText(big, { x, y: 2.15, w: fw3, h: 1.0, fontFace: early ? FONT : th.head, fontSize: 48, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
      s.addText(small, { x, y: 3.12, w: fw3, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: LIGHT_GOLD, align: "center", charSpacing: 3, margin: 0 });
    });
    s.addText([{ text: "START  ", options: { bold: true, color: LIGHT_GOLD, charSpacing: 2 } }, { text: "______", options: { color: "FFFFFF" } }, { text: "     FINISH  ", options: { bold: true, color: LIGHT_GOLD, charSpacing: 2 } }, { text: "______", options: { color: "FFFFFF" } }], { x: 0.8 + 3 * fw3, y: 2.1, w: fw3 - 0.2, h: 1.6, fontFace: FONT, fontSize: 16, align: "center", valign: "middle" });
    // The conditions.
    const conditions = [
      { icon: "camera", text: "Cameras on" },
      { icon: "mic", text: oral(lesson) ? "Mics off until your name is called" : "Mics off" },
      { icon: "doc", text: "Work alone" },
      { icon: "window", text: "No other tabs" },
    ];
    s.addText(early ? "OUR TEST RULES" : "EXAM CONDITIONS", { x: 0.8, y: 3.95, w: 11.8, h: 0.32, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, charSpacing: 3, margin: 0 });
    const gap = 0.22;
    const cw = (11.8 - gap * 3) / 4;
    conditions.forEach((c, i) => {
      const x = 0.8 + i * (cw + gap);
      s.addShape("roundRect", { x, y: 4.35, w: cw, h: 1.3, rectRadius: 0.12, fill: { color: th.soft }, line: { color: ctx.accent, width: 1.5 } });
      icon(s, c.icon, x + 0.25, 4.7, 0.6, ctx.accent);
      s.addText(c.text, { x: x + 1.0, y: 4.35, w: cw - 1.1, h: 1.3, fontFace: FONT, fontSize: fitSize(c.text, cw - 1.1, 1.2, early ? 24 : 22, 13), bold: true, color: INK, valign: "middle", margin: 0 });
    });
    // How to answer.
    s.addShape("roundRect", { x: 0.8, y: 5.85, w: 11.8, h: 1.0, rectRadius: 0.1, fill: { color: GOLD_SOFT }, line: { color: GOLD, width: 1.5 } });
    s.addText([{ text: "HOW TO ANSWER   ", options: { bold: true, color: GOLD_DARK, fontSize: 12, charSpacing: 2 } }, { text: a.how, options: { color: INK } }], { x: 1.05, y: 5.85, w: 11.3, h: 1.0, fontFace: FONT, fontSize: fitSize(a.how, 9.8, 0.95, 18, 11), valign: "middle" });
    s.addNotes(
      `${a.label.toUpperCase()} CONDITIONS. Read the rules aloud: cameras on, ${oral(lesson) ? "mics off until you call a pupil's name" : "mics off"}, work alone, no other tabs. ${a.minutes ? `Start a ${a.minutes}-minute timer and write the start and finish times in the chat. ` : ""}${a.marks ? `${a.marks} marks in total. ` : ""}Watch the cameras throughout; answer questions about the instructions only, not the content.${a.before ? ` Before you start: ${clean(a.before)}` : ""} The mark scheme is in the teacher-only section after the last slide and in the lesson plan.`,
    );
    return s;
  }

  // Question cards: at least tall enough for the label and marks pills; the text sized to fit.
  const CARD_MIN = 0.86;
  const cardNeed = (r, pt) => Math.max(CARD_MIN, textHeight(clean(r.rest), 9.3, pt) + 0.16);
  /** Lay the questions out on as many slides as they need, at a readable size (long questions get a slide each). */
  function assessmentGroups(rows, avail, pt) {
    const groups = [];
    let cur = [];
    let used = 0;
    for (const r of rows) {
      const h = cardNeed(r, pt) + 0.14;
      if (cur.length && (cur.length >= 5 || used + h > avail + 0.14)) {
        groups.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(r);
      used += h;
    }
    if (cur.length) groups.push(cur);
    return groups;
  }

  /** The questions, labelled Question 1, 2… or Section A, B… with their marks. Returns the slide numbers. */
  function assessmentQuestionSlides(pptx, ctx, a, slideNo) {
    const out = [];
    const howH = a.how ? 0.62 : 0;
    const avail = 6.85 - 2.12 - (howH ? howH + 0.15 : 0);
    const groups = assessmentGroups(a.rows, avail, ctx.band === "early" ? 22 : 18);
    groups.forEach((g, gi) => {
      const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
      out.push(slideNo());
      const first = g[0].label;
      const last = g[g.length - 1].label;
      const title = g.length === 1 ? first : /^Section/.test(first) && /^Section/.test(last) ? `Sections ${g[0].short} to ${g[g.length - 1].short}` : /^Question/.test(first) && /^Question/.test(last) ? `Questions ${g[0].short} to ${g[g.length - 1].short}` : `${first} to ${last}`;
      const mins = g.map((r) => r.mins).filter((m) => m != null);
      header(s, ctx, title, `${a.label}${groups.length > 1 ? ` · part ${gi + 1} of ${groups.length}` : ""}`, 3, mins.length === g.length ? mins.reduce((x, y) => x + y, 0) : null, null);
      const top = 2.12;
      const gap = 0.14;
      const texts = g.map((r) => clean(r.rest));
      // Each card as tall as its text needs; spare room shared out, so the text can grow.
      const need = g.map((r) => cardNeed(r, ctx.band === "early" ? 22 : 18));
      const room = avail - gap * (g.length - 1);
      const sumNeed = need.reduce((x, y) => x + y, 0);
      const hs = need.map((n) => Math.max(Math.min(CARD_MIN, room / g.length), (room * n) / sumNeed));
      const size = Math.min(...texts.map((t, i) => fitSize(t, 9.3, hs[i] - 0.12, ctx.band === "early" ? 30 : 24, 10)));
      let y = top;
      g.forEach((r, i) => {
        const h = hs[i];
        s.addShape("roundRect", { x: 0.8, y, w: 11.8, h, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 } });
        s.addShape("rect", { x: 0.8, y: y + 0.1, w: 0.1, h: h - 0.2, fill: { color: ctx.accent }, line: { color: ctx.accent, width: 0 } });
        const pillH = Math.min(0.42, h - 0.16);
        s.addShape("roundRect", { x: 1.05, y: y + 0.1, w: 1.75, h: pillH, rectRadius: pillH / 2, fill: { color: ctx.theme.dark }, line: { color: ctx.theme.dark, width: 0 } });
        s.addText(r.label, { x: 1.05, y: y + 0.1, w: 1.75, h: pillH, fontFace: FONT, fontSize: fitSize(r.label, 1.65, pillH, 15, 9), bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
        if (r.marks != null) {
          const mh = Math.min(0.3, Math.max(0.22, h - pillH - 0.22));
          s.addShape("roundRect", { x: 1.05, y: y + 0.14 + pillH, w: 1.75, h: mh, rectRadius: mh / 2, fill: { color: GOLD_SOFT }, line: { color: GOLD, width: 1 } });
          s.addText(`[${marksText(r.marks)}]`, { x: 1.05, y: y + 0.14 + pillH, w: 1.75, h: mh, fontFace: FONT, fontSize: 12, bold: true, color: GOLD_DARK, align: "center", valign: "middle", margin: 0 });
        }
        s.addText(texts[i], { x: 3.0, y: y + 0.04, w: 9.45, h: h - 0.08, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: size, color: INK, valign: "middle", margin: 0 });
        y += h + gap;
      });
      if (howH) {
        const hy = 6.85 - howH;
        s.addShape("roundRect", { x: 0.8, y: hy, w: 11.8, h: howH, rectRadius: 0.1, fill: { color: ctx.theme.soft }, line: { color: ctx.theme.soft, width: 0 } });
        icon(s, "doc", 1.0, hy + 0.13, 0.36, ctx.accent);
        s.addText([{ text: "YOUR ANSWER   ", options: { bold: true, color: ctx.accent, fontSize: 12, charSpacing: 2 } }, { text: a.how, options: { color: INK } }], { x: 1.55, y: hy, w: 10.9, h: howH, fontFace: FONT, fontSize: fitSize(a.how, 9.6, howH, 16, 10), valign: "middle" });
      }
      s.addNotes(`${a.label.toUpperCase()}: exam conditions. Do not explain the questions or give hints; read a question aloud only if a pupil needs it read (access arrangement).${g.some((r) => r.marks != null) ? ` Marks: ${g.map((r) => `${r.label} ${r.marks ?? "?"}`).join(", ")}.` : ""} The mark scheme is in the teacher-only section after the last slide.`);
    });
    return out;
  }

  /** The divider before the teacher-only answers and mark scheme (after the lesson's last slide). */
  function teacherOnlyDivider(pptx, ctx, a) {
    const s = pptx.addSlide();
    s.background = { color: "3A1512" };
    s.addShape("rect", { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: RED }, line: { color: RED, width: 0 } });
    s.addShape("roundRect", { x: 0.9, y: 1.2, w: 3.4, h: 0.7, rectRadius: 0.35, fill: { color: RED }, line: { color: RED, width: 0 } });
    s.addText("TEACHER ONLY", { x: 0.9, y: 1.2, w: 3.4, h: 0.7, fontFace: FONT, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 4, margin: 0 });
    s.addText("Teacher only: mark scheme (do not show)", { x: 0.9, y: 2.3, w: 11.4, h: 2.0, fontFace: ctx.band === "early" ? FONT : ctx.theme.head, fontSize: 44, bold: true, color: "FFFFFF", valign: "middle" });
    s.addText(`${a.label}: answers and marks for every question in this lesson. Stop sharing your screen before you go past this slide.`, { x: 0.9, y: 4.5, w: 11.0, h: 1.0, fontFace: FONT, fontSize: 20, color: "F2D7D3", valign: "top" });
    s.addNotes("TEACHER ONLY. Everything after this slide is the mark scheme and the answers. It sits after the end of the lesson so it is never shown by accident, and it is not in the pupils' PDF.");
    return s;
  }

  /** Mark scheme: each question with its label, marks and answer (several slides when long). */
  function markSchemeSlides(pptx, ctx, a, slideNo) {
    const out = [];
    const rows = a.rows.map((r) => ({ ...r, answer: r.a ? clean(r.a) : "No answer recorded: mark against the success criteria and the lesson plan." }));
    const groups = [];
    let cur = [];
    let len = 0;
    for (const r of rows) {
      const L = r.answer.length + Math.min(120, clean(r.rest).length) + 30;
      if (cur.length && (cur.length >= 4 || len + L > 700)) {
        groups.push(cur);
        cur = [];
        len = 0;
      }
      cur.push(r);
      len += L;
    }
    if (cur.length) groups.push(cur);
    groups.forEach((g, gi) => {
      const s = pptx.addSlide({ masterName: "TGA_CONTENT" });
      out.push(slideNo());
      header(s, ctx, "Mark scheme", `Teacher only · ${a.label}${groups.length > 1 ? ` · ${gi + 1} of ${groups.length}` : ""}`, null);
      s.addShape("roundRect", { x: 9.6, y: 0.95, w: 3.0, h: 0.66, rectRadius: 0.33, fill: { color: RED }, line: { color: RED, width: 0 } });
      s.addText("TEACHER ONLY", { x: 9.6, y: 0.95, w: 3.0, h: 0.66, fontFace: FONT, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 3, margin: 0 });
      const top = 2.12;
      const gap = 0.14;
      const need = g.map((r) => Math.max(0.75, textHeight(r.answer, 9.3, 15) + 0.4));
      const sumNeed = need.reduce((x, y) => x + y, 0);
      const hs = need.map((n) => ((6.85 - top - gap * (g.length - 1)) * n) / sumNeed);
      const qPt = 11;
      const aSize = Math.min(...g.map((r, i) => fitSize(r.answer, 9.3, hs[i] - 0.42, 20, 9)));
      let y = top;
      g.forEach((r, i) => {
        const h = hs[i];
        s.addShape("roundRect", { x: 0.8, y, w: 11.8, h, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: r.a ? TICK : LINE, width: 1.25 } });
        s.addText(r.label, { x: 1.0, y: y + 0.08, w: 1.8, h: 0.34, fontFace: FONT, fontSize: 13, bold: true, color: ctx.accent, margin: 0 });
        if (r.marks != null) s.addText(`[${marksText(r.marks)}]`, { x: 1.0, y: y + 0.42, w: 1.8, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: GOLD_DARK, margin: 0 });
        const qShort = clean(r.rest).length > 150 ? `${clean(r.rest).slice(0, 147)}…` : clean(r.rest);
        s.addText(qShort, { x: 3.0, y: y + 0.06, w: 9.45, h: 0.34, fontFace: FONT, fontSize: qPt, color: MUTED, valign: "top", margin: 0, fit: "shrink" });
        s.addText(r.answer, { x: 3.0, y: y + 0.4, w: 9.45, h: h - 0.46, fontFace: ctx.mathy ? "Cambria" : FONT, fontSize: aSize, bold: !!r.a, italic: !r.a, color: r.a ? INK : MUTED, valign: "top", margin: 0 });
        y += h + gap;
      });
      s.addNotes(`TEACHER ONLY: mark scheme${a.marks ? ` (${a.marks} marks in total)` : ""}. Also in the lesson plan's answer key.`);
    });
    return out;
  }

  return { icon, picture, pictureSlide, pdfLink, ponderSlide, promiseStrip, islamicSlide, destinationSlide, modelSlide, pollSlide, pollAnswerSlide, correctIndex, termsIn, kwBoxWidth, keywordCorner, topicKeywordsSlide, keywordCardPicture, worksheetPages, creditLine, examConditionsSlide, assessmentQuestionSlides, teacherOnlyDivider, markSchemeSlides };
}
