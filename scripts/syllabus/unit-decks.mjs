// Unit teaching decks: each specification unit laid out as a short sequence of lessons
// (outcomes, key terms, do-now, exit ticket, exam prompt, linked video chapter).
// Lesson splits are a suggested pacing of the board's own points; they are not board content.
import { W, MX, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, LINE, WHITE, FONT, H, LOGO_WHITE, LOGO_RATIO, clean, fitSize, makeTheme, tint, newDeck, contentSlide, chip, card, bullets, STATUS } from "./lib.mjs";

const chunkEven = (arr, n) => {
  if (!arr.length) return [[]];
  const k = Math.max(1, Math.min(n, arr.length));
  const out = [];
  let i = 0;
  for (let j = 0; j < k; j++) { const take = Math.ceil((arr.length - i) / (k - j)); out.push(arr.slice(i, i + take)); i += take; }
  return out;
};
const trim = (s, n) => (clean(s).length > n ? clean(s).slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : clean(s));

export function lessonsFor(u) {
  const pts = (u.points || []).map(clean);
  const n = Math.max(1, Math.round(pts.length / 3));
  const groups = chunkEven(pts, n);
  const terms = chunkEven((u.keyTerms || []).map(clean), groups.length);
  return groups.map((g, i) => ({ points: g, terms: terms[i] || [] }));
}

export function buildUnitDeck(d, videoMap) {
  const theme = makeTheme(d.slug);
  const ctx = { theme, status: d.status, page: 1, footerLeft: `${d.subject} · ${d.board} ${clean(d.code).split(/[;(]/)[0]} · Unit teaching deck` };
  const pres = newDeck(`${d.subject} unit teaching deck: ${d.board}`, d.subject);
  const units = d.units;
  const cws = (d.commandWords || []).slice(0, 8);
  const total = units.reduce((a, u) => a + lessonsFor(u).length, 0);

  // Title
  {
    const s = pres.addSlide();
    s.background = { color: theme.dark };
    theme.motifFn(s, { x: 7.1, y: 0.7, w: 5.6, h: 5.9 });
    s.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    chip(s, `Unit teaching deck · ${d.years}`, MX + 0.2, 0.75, 4.2, theme.dark, "E3C98F", 11, 0.36);
    s.addText(d.subject, { x: MX + 0.2, y: 1.45, w: 6.3, h: 1.6, fontFace: theme.head, fontSize: fitSize(d.subject, 6.3, 1.6, 52, 30, 0, 0.9), bold: true, color: WHITE, valign: "top", margin: 0 });
    s.addText(`Every unit of ${d.board} ${clean(d.qualification)} as a short sequence of lessons.`, { x: MX + 0.2, y: 3.2, w: 6.2, h: 1.1, fontFace: FONT, fontSize: 19, color: "E3C98F", valign: "top", margin: 0 });
    [`${units.length} units`, `${total} lesson slots`].forEach((f, i) => chip(s, f, MX + 0.2 + i * 2.1, 4.6, 1.9, WHITE, tint(theme.dark, 0.18), 11, 0.38));
    const st = STATUS[d.status] || STATUS.Provisional;
    chip(s, st.label, MX + 0.2, 5.2, 1.6, st.ink, st.fill, 10, 0.32);
    s.addImage({ path: LOGO_WHITE, x: MX + 0.2, y: 6.75, w: 1.9, h: 1.9 / LOGO_RATIO });
  }

  // How to use
  {
    const s = contentSlide(pres, ctx, "How this deck works", "One unit, taught as a run of lessons");
    const items = [
      ["Outcomes", "The board's own points for the unit, grouped into lessons of about three."],
      ["Do now", "A retrieval prompt that revisits the previous lesson or unit before new content."],
      ["Exit ticket and exam prompt", "A quick check, then a prompt built on one of the board's command words."],
      ["Video chapter", "Where a revision-pack chapter matches the unit, its title and length are shown as a suggestion to confirm."],
    ];
    items.forEach(([k, v], i) => {
      const y = 1.8 + i * 1.2;
      card(s, MX, y, W - 2 * MX, 1.05, WHITE, LINE, theme.accent);
      s.addText(k, { x: MX + 0.3, y, w: 3.6, h: 1.05, fontFace: theme.head, fontSize: 18, bold: true, color: theme.accent, valign: "middle", margin: 0 });
      s.addText(v, { x: MX + 4.0, y, w: W - 2 * MX - 4.3, h: 1.05, fontFace: FONT, fontSize: 16, color: INK, valign: "middle", margin: 0 });
    });
    s.addText("The lesson split is a suggested pacing. The points themselves are paraphrased from the board; always teach from the board's own document.", { x: MX, y: 6.7, w: W - 2 * MX, h: 0.35, fontFace: FONT, fontSize: 11, italic: true, color: MUTED, margin: 0 });
  }

  units.forEach((u, ui) => {
    const lessons = lessonsFor(u);
    const vids = (videoMap && videoMap.get(u.ref)) || [];
    const prev = units[ui - 1];

    // Unit overview
    {
      const s = contentSlide(pres, ctx, `Unit ${u.ref} · ${u.paper}${u.term ? ` · ${u.term}` : ""}`, u.title, { tag: u.year });
      card(s, MX, 1.8, 4.1, 5.05, tint(theme.accent, 0.92), tint(theme.accent, 0.65));
      s.addText("UNIT AT A GLANCE", { x: MX + 0.25, y: 1.95, w: 3.5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      const facts = [`${lessons.length} lesson${lessons.length > 1 ? "s" : ""}`, `${(u.points || []).length} specification points`, `Examined in ${u.paper}`, `Taught in ${u.year}${u.term ? `, ${u.term}` : ""}`];
      bullets(s, facts, MX + 0.2, 2.3, 3.7, 1.9, { max: 16, min: 11, gap: 6 });
      s.addText("KEY TERMS", { x: MX + 0.25, y: 4.2, w: 3.5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      s.addText((u.keyTerms || []).slice(0, 14).join(" · ") || "See the specification", { x: MX + 0.25, y: 4.5, w: 3.65, h: 2.2, fontFace: FONT, fontSize: fitSize((u.keyTerms || []).join(" · "), 3.65, 2.2, 13, 9, 0), color: INK, valign: "top", margin: 0 });
      const px = MX + 4.3, pw = W - px - MX;
      card(s, px, 1.8, pw, vids.length ? 3.45 : 5.05, WHITE, LINE, GOLD);
      s.addText("LESSON SEQUENCE", { x: px + 0.3, y: 1.95, w: 4, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: MUTED, charSpacing: 3, margin: 0 });
      const seq = lessons.map((l, i) => `Lesson ${i + 1}: ${trim(l.points[0] || u.title, 95)}`);
      bullets(s, seq, px + 0.2, 2.3, pw - 0.4, (vids.length ? 3.45 : 5.05) - 0.6, { max: 15, min: 9, gap: 6 });
      if (vids.length) {
        card(s, px, 5.4, pw, 1.45, GOLD_SOFT, GOLD);
        s.addText("VIDEO CHAPTERS THAT MATCH (SUGGESTED)", { x: px + 0.3, y: 5.5, w: pw - 0.5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: GOLD_DARK, charSpacing: 3, margin: 0 });
        const vl = vids.slice(0, 3).map((v) => `${trim(v.pack, 40)}, chapter ${v.chapter}: ${trim(v.title, 50)}${v.when ? ` (${v.when})` : ""}`);
        bullets(s, vl, px + 0.2, 5.8, pw - 0.4, 1.0, { max: 12, min: 9, gap: 2 });
      }
    }

    // Lesson slides
    lessons.forEach((l, li) => {
      const s = contentSlide(pres, ctx, `Unit ${u.ref} · Lesson ${li + 1} of ${lessons.length}`, trim(l.points[0] || u.title, 70), { tag: `${u.ref}` });
      const lw = 7.35;
      card(s, MX, 1.75, lw, 3.15, WHITE, LINE, theme.accent);
      s.addText("OUTCOMES: BY THE END, PUPILS CAN…", { x: MX + 0.3, y: 1.85, w: lw - 0.5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      bullets(s, l.points, MX + 0.2, 2.15, lw - 0.4, 2.7, { max: 16, min: 9, gap: 6 });
      const rx = MX + lw + 0.2, rw = W - rx - MX;
      card(s, rx, 1.75, rw, 1.45, tint(theme.accent, 0.92), tint(theme.accent, 0.65));
      s.addText("KEY TERMS", { x: rx + 0.25, y: 1.82, w: 3, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      const tt = l.terms.length ? l.terms.join(" · ") : "Use the unit's key terms";
      s.addText(tt, { x: rx + 0.25, y: 2.1, w: rw - 0.45, h: 1.05, fontFace: FONT, fontSize: fitSize(tt, rw - 0.45, 1.05, 14, 9, 0), bold: true, color: INK, valign: "top", margin: 0 });
      card(s, rx, 3.35, rw, 1.55, GOLD_SOFT, GOLD);
      s.addText("DO NOW (RETRIEVAL)", { x: rx + 0.25, y: 3.42, w: 3, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: GOLD_DARK, charSpacing: 3, margin: 0 });
      const pre = (d.prerequisites || []).find((p) => clean(p.to) === clean(u.ref));
      const prevTerms = li > 0 ? lessons[li - 1].terms.slice(0, 2) : [];
      const dn = li > 0
        ? (prevTerms.length ? `Without notes, explain what ${prevTerms.join(" and ")} mean.` : "Without notes, list the main ideas from the last lesson.")
        : pre ? `Recall earlier learning: ${trim(pre.from, 90)}.` : prev ? `Recall the main ideas from the previous unit: ${trim(prev.title, 70)}.` : "List what you already know about this topic.";
      s.addText(dn, { x: rx + 0.25, y: 3.7, w: rw - 0.45, h: 1.1, fontFace: FONT, fontSize: fitSize(dn, rw - 0.45, 1.1, 14, 9, 0), color: INK, valign: "top", margin: 0 });

      const hw = (W - 2 * MX - 0.2) / 2;
      card(s, MX, 5.05, hw, 1.85, WHITE, LINE, theme.accent);
      s.addText("EXIT TICKET AND EXAM PROMPT", { x: MX + 0.3, y: 5.12, w: hw - 0.5, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      const cw = cws.length ? cws[(ui + li) % cws.length] : null;
      const t1 = l.terms[0], t2 = l.terms[1];
      const lines = [
        t1 ? `Exit ticket: in one sentence each, define ${t1}${t2 ? ` and ${t2}` : ""}.` : `Exit ticket: write the one idea you will remember from this lesson.`,
        cw ? `Exam prompt: use the command word “${cw.word}” in a short answer about ${trim(u.title, 55)}.` : `Exam prompt: answer one board-style question on ${trim(u.title, 50)}.`,
      ];
      bullets(s, lines, MX + 0.2, 5.4, hw - 0.4, 1.45, { max: 14, min: 9, gap: 6 });

      const vx = MX + hw + 0.2;
      card(s, vx, 5.05, hw, 1.85, GOLD_SOFT, GOLD);
      s.addText("VIDEO AND RESOURCES", { x: vx + 0.3, y: 5.12, w: hw - 0.5, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: GOLD_DARK, charSpacing: 3, margin: 0 });
      const v = vids[li % Math.max(vids.length, 1)];
      const vt = v ? [`Suggested video: ${trim(v.pack, 45)}, chapter ${v.chapter}: ${trim(v.title, 55)}${v.when ? ` (${v.when})` : ""}.`, "Confirm the match before using it with pupils."] : ["No revision-pack video is linked to this unit yet.", "A teacher can link one when a pack is made for it."];
      bullets(s, vt, vx + 0.2, 5.4, hw - 0.4, 1.45, { max: 14, min: 9, gap: 6 });
    });
  });
  return pres;
}
