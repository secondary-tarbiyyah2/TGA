// Deck builders for the Syllabus & Specification pack.
//   buildSpecDeck(d)      KS4 examination specification (kind "spec")
//   buildSyllabusDeck(d)  Reception to Year 9 programme (kind "syllabus")
import { lessonsFor } from "./unit-decks.mjs";
import {
  W, H, MX, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, LINE, WHITE, FONT, LOGO_WHITE, LOGO_RATIO,
  clean, fitSize, makeTheme, tint, newDeck, contentSlide, chip, card, bullets, sourcesAndGaps, gridBoxes, yearLabel,
} from "./lib.mjs";

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const yrNum = (k) => { const s = String(k).toLowerCase(); return s.startsWith("r") ? 0 : Number((s.match(/\d+/) || [99])[0]); };

function titleSlide(pres, ctx, { label, title, sub, facts }) {
  const s = pres.addSlide();
  const th = ctx.theme;
  s.background = { color: th.dark };
  th.motifFn(s, { x: 7.1, y: 0.7, w: 5.6, h: 5.9 });
  s.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  chip(s, label, MX + 0.2, 0.75, Math.min(5.2, 0.9 + label.length * 0.115), th.dark, "E3C98F", 11, 0.36);
  const tSize = fitSize(title, 6.3, 2.0, 54, 30, 0, 0.9);
  s.addText(clean(title), { x: MX + 0.2, y: 1.45, w: 6.3, h: 2.0, fontFace: th.head, fontSize: tSize, bold: true, color: WHITE, valign: "top", margin: 0 });
  const sSize = fitSize(sub, 6.2, 1.2, 22, 14, 0);
  s.addText(clean(sub), { x: MX + 0.2, y: 3.55, w: 6.2, h: 1.2, fontFace: FONT, fontSize: sSize, color: "E3C98F", valign: "top", margin: 0 });
  // fact chips
  let fx = MX + 0.2;
  let fy = 4.95;
  for (const f of facts) {
    const w = Math.min(3.2, 0.5 + clean(f).length * 0.105);
    if (fx + w > 6.9) { fx = MX + 0.2; fy += 0.5; }
    chip(s, f, fx, fy, w, WHITE, tint(th.dark, 0.18), 11, 0.38);
    fx += w + 0.15;
  }
  s.addImage({ path: LOGO_WHITE, x: MX + 0.2, y: 6.75, w: 1.9, h: 1.9 / LOGO_RATIO });
  s.addText("Syllabus & Specification Pack · 2026–27", { x: W - MX - 4.4, y: 6.95, w: 4.4, h: 0.3, fontFace: FONT, fontSize: 10, color: "BFC8C6", align: "right", margin: 0 });
  return s;
}

function tableSlideRows(s, head, rows, x, y, w, colW, size, accent) {
  const mk = (t, o = {}) => ({ text: clean(t), options: { fontFace: FONT, fontSize: size, color: INK, valign: "top", ...o } });
  const data = [head.map((h) => mk(h, { bold: true, color: WHITE, fill: { color: accent }, fontSize: size }))];
  rows.forEach((r, i) => data.push(r.map((c, j) => mk(c, { fill: { color: i % 2 ? "FFFFFF" : tint(accent, 0.92) }, bold: j === 0 }))));
  s.addTable(data, { x, y, w, colW, border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.05, 0.08, 0.05, 0.08] });
}

function weightNum(w) {
  const m = String(w).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

// ───────────────────────────── KS4 SPEC DECK ──────────────────────────────
export function buildSpecDeck(d, videoMap) {
  const theme = makeTheme(d.slug);
  const ctx = { theme, status: d.status, page: 1, footerLeft: `${d.subject} · ${d.board} ${d.code} · Specification` };
  const pres = newDeck(`${d.subject} specification: ${d.board} ${d.code}`, d.subject);

  titleSlide(pres, ctx, {
    label: `Specification · ${d.years}`,
    title: d.subject,
    sub: `${d.board} ${d.qualification}${d.code ? ` (${d.code})` : ""}${d.examEntry ? ` · Exam: ${d.examEntry.board} ${d.examEntry.qualification} (${d.examEntry.code})` : ""}`,
    facts: [d.board, `Code ${d.code}`, d.examEntry ? `Exam ${d.examEntry.code}` : "", /foundation/i.test(d.tiers || "") ? "Foundation and Higher" : "Single tier", `${(d.units || []).length} units`].filter(Boolean),
  });

  // At a glance
  {
    const s = contentSlide(pres, ctx, "At a glance", `${d.subject}: the qualification in one view`);
    const items = [
      ["Awarding body", d.board],
      ["Qualification", `${d.qualification}${d.code ? ` · ${d.code}` : ""}${d.examEntry ? ` (exam: ${d.examEntry.label || d.examEntry.code})` : ""}`],
      ["Course length", d.years],
      ["Tiers", clean(d.tiers).length > 70 ? clean(d.tiers).slice(0, 67).replace(/\s+\S*$/, "") + "…" : d.tiers],
      ["Grading", "9 to 1 (9 highest)"],
      ["Specification version", d.specVersion || "Not stated"],
    ];
    const boxes = gridBoxes(items.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 2.6 }, 3, 0.25);
    items.forEach(([k, v], i) => {
      const b = boxes[i];
      card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
      s.addText(k.toUpperCase(), { x: b.x + 0.3, y: b.y + 0.15, w: b.w - 0.4, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: MUTED, charSpacing: 3, margin: 0 });
      s.addText(clean(v), { x: b.x + 0.3, y: b.y + 0.45, w: b.w - 0.45, h: b.h - 0.55, fontFace: theme.head, fontSize: fitSize(v, b.w - 0.45, b.h - 0.55, 22, 12, 0, 0.9), bold: true, color: INK, valign: "top", margin: 0 });
    });
    const bx = { x: MX, y: 4.65, w: W - 2 * MX, h: 2.2 };
    card(s, bx.x, bx.y, bx.w, bx.h, tint(theme.accent, 0.93), tint(theme.accent, 0.7));
    s.addText("ASSESSMENT SUMMARY", { x: bx.x + 0.3, y: bx.y + 0.15, w: 5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
    const allP = d.assessment || [];
    const summ = allP.slice(0, 5).map((p) => `${p.paper}: ${p.title}, ${p.duration}, ${p.marks} marks, ${p.weight}`);
    if (allP.length > 5) summ.push(`…and ${allP.length - 5} more papers (see the assessment slides)`);
    const ne = clean(d.nonExam);
    summ.push(`Non-examined: ${ne.length > 170 ? ne.slice(0, 167).replace(/\s+\S*$/, "") + "…" : ne}`);
    bullets(s, summ, bx.x + 0.25, bx.y + 0.45, bx.w - 0.5, bx.h - 0.55, { max: 15, min: 9, gap: 3 });
  }

  // Assessment structure
  {
    const papers = d.assessment || [];
    const pages = chunk(papers, 5);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Assessment", pages.length > 1 ? `How it is examined (${pi + 1} of ${pages.length})` : "How it is examined");
      const total = pg.reduce((a, p) => a + (weightNum(p.weight) || 1), 0);
      let x = MX;
      const bw = W - 2 * MX;
      pg.forEach((p, i) => {
        const w = (bw * (weightNum(p.weight) || 1)) / total;
        const fill = i % 2 ? tint(theme.accent, 0.45) : theme.accent;
        s.addShape("rect", { x, y: 1.8, w: w - 0.04, h: 0.62, fill: { color: fill }, line: { color: fill, width: 0 } });
        s.addText(`${clean(p.paper)} · ${clean(p.weight)}`, { x, y: 1.8, w: w - 0.04, h: 0.62, fontFace: FONT, fontSize: fitSize(`${p.paper} · ${p.weight}`, w - 0.1, 0.5, 14, 8, 0), bold: true, color: WHITE, align: "center", valign: "middle", margin: 2 });
        x += w;
      });
      const rows = pg.map((p) => [p.paper, p.title, p.duration, String(p.marks), p.weight, `${p.content}${p.format ? ` — ${p.format}` : ""}`]);
      const size = rows.length > 3 ? 11 : 13;
      tableSlideRows(s, ["Paper", "Title", "Time", "Marks", "Weight", "What is examined and how"], rows, MX, 2.65, W - 2 * MX, [1.1, 2.3, 1.2, 0.8, 0.8, W - 2 * MX - 6.2], size, theme.accent);
      if (pi === pages.length - 1 && d.nonExam && !/^none\b/i.test(d.nonExam) && clean(d.nonExam).length <= 260) {
        card(s, MX, 6.05, W - 2 * MX, 0.8, GOLD_SOFT, GOLD);
        s.addText([{ text: "Non-examined component: ", options: { bold: true } }, { text: clean(d.nonExam) }], { x: MX + 0.2, y: 6.07, w: W - 2 * MX - 0.4, h: 0.76, fontFace: FONT, fontSize: fitSize(d.nonExam, W - 2 * MX - 2.6, 0.7, 13, 9), color: INK, valign: "middle", margin: 0 });
      }
    });
  }

  if (d.nonExam && !/^none\b/i.test(d.nonExam) && clean(d.nonExam).length > 260) {
    const s = contentSlide(pres, ctx, "Assessment", "Non-examined component and practical work");
    card(s, MX, 1.8, W - 2 * MX, 4.9, WHITE, LINE, GOLD);
    s.addText(clean(d.nonExam), { x: MX + 0.4, y: 2.0, w: W - 2 * MX - 0.8, h: 4.5, fontFace: FONT, fontSize: fitSize(d.nonExam, W - 2 * MX - 0.8, 4.5, 18, 9, 0), color: INK, valign: "top", margin: 0 });
  }

  // Assessment objectives
  if ((d.aos || []).length) {
    const s = contentSlide(pres, ctx, "Assessment objectives", "What the examiners reward");
    const per = d.aos.length > 6 ? 3 : d.aos.length > 3 ? 3 : d.aos.length;
    const boxes = gridBoxes(d.aos.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 5.0 }, per, 0.22, d.aos.length > 3 ? (d.aos.length > 6 ? 1.6 : 2.4) : 3.0);
    d.aos.forEach((a, i) => {
      const b = boxes[i];
      if (b.y + b.h > 6.95) return;
      card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
      s.addText(clean(a.code), { x: b.x + 0.3, y: b.y + 0.12, w: 1.3, h: 0.5, fontFace: theme.head, fontSize: 24, bold: true, color: theme.accent, margin: 0 });
      if (a.weight && clean(a.weight).length <= 14) chip(s, a.weight, b.x + b.w - 1.45, b.y + 0.2, 1.2, theme.accent, tint(theme.accent, 0.85), 11, 0.32);
      const adesc = a.weight && clean(a.weight).length > 14 ? `${clean(a.desc)} Weighting: ${clean(a.weight)}` : clean(a.desc);
      s.addText(adesc, { x: b.x + 0.3, y: b.y + 0.7, w: b.w - 0.5, h: b.h - 0.8, fontFace: FONT, fontSize: fitSize(adesc, b.w - 0.5, b.h - 0.8, 15, 9, 0), color: INK, valign: "top", margin: 0 });
    });
  }

  // Content map (all units on tiles)
  {
    const units = d.units || [];
    const pages = chunk(units, 12);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Content map", pages.length > 1 ? `Every unit the specification lists (${pi + 1} of ${pages.length})` : "Every unit the specification lists");
      const boxes = gridBoxes(pg.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 4.7 }, 4, 0.18, 1.45);
      pg.forEach((u, i) => {
        const b = boxes[i];
        const y10 = u.year === "Y10";
        card(s, b.x, b.y, b.w, b.h, y10 ? tint(theme.accent, 0.9) : GOLD_SOFT, y10 ? tint(theme.accent, 0.6) : GOLD);
        s.addText(clean(u.ref), { x: b.x + 0.15, y: b.y + 0.08, w: b.w - 0.3, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: y10 ? theme.accent : GOLD_DARK, margin: 0 });
        s.addText(clean(u.title), { x: b.x + 0.15, y: b.y + 0.32, w: b.w - 0.3, h: b.h - 0.72, fontFace: FONT, fontSize: fitSize(u.title, b.w - 0.3, b.h - 0.72, 14, 8, 0), bold: true, color: INK, valign: "top", margin: 0 });
        s.addText(`${clean(u.paper)} · ${u.year}`, { x: b.x + 0.15, y: b.y + b.h - 0.34, w: b.w - 0.3, h: 0.26, fontFace: FONT, fontSize: 9, color: MUTED, margin: 0 });
      });
      s.addText("Blue tint = recommended Year 10   ·   Gold tint = recommended Year 11", { x: MX, y: 6.62, w: 8, h: 0.28, fontFace: FONT, fontSize: 10, color: MUTED, italic: true, margin: 0 });
    });
  }

  // Coverage matrix (how boards tabulate content against papers)
  {
    const units = d.units || [];
    const pages = chunk(units, 12);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Coverage matrix", pages.length > 1 ? `Units against papers, years and pacing (${pi + 1} of ${pages.length})` : "Units against papers, years and pacing");
      const mk = (t, o = {}) => ({ text: clean(t), options: { fontFace: FONT, fontSize: 10, color: INK, valign: "middle", ...o } });
      const head = ["Ref", "Unit", "Paper", "Year", "Term", "Points", "Lessons", "Video"];
      const data = [head.map((h) => mk(h, { bold: true, color: WHITE, fill: { color: theme.accent } }))];
      pg.forEach((u, i) => {
        const v = videoMap && videoMap.get(u.ref);
        data.push([u.ref, u.title, u.paper, u.year, u.term || "", String((u.points || []).length), String(lessonsFor(u).length), v && v.length ? "Linked" : "—"].map((x, j) => mk(x, { fill: { color: i % 2 ? WHITE : tint(theme.accent, 0.92) }, bold: j === 0, align: j >= 5 ? "center" : "left" })));
      });
      s.addTable(data, { x: MX, y: 1.8, w: W - 2 * MX, colW: [1.1, 4.6, 1.7, 0.8, 1.1, 0.8, 0.9, W - 2 * MX - 11], border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.05, 0.08, 0.05, 0.08] });
    });
  }

  // Unit detail slides
  const links = d.links || [];
  for (const u of d.units || []) {
    const s = contentSlide(pres, ctx, `${u.paper}${u.term ? ` · ${u.term}` : ""}`, u.title, { tag: `${u.ref} · ${u.year}` });
    const pts = (u.points || []).map(clean);
    const panelX = MX;
    card(s, panelX, 1.8, 3.9, 5.05, tint(theme.accent, 0.92), tint(theme.accent, 0.65));
    s.addText("KEY TERMS", { x: panelX + 0.25, y: 1.95, w: 3.4, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
    const kt = (u.keyTerms || []).length ? u.keyTerms : ["See specification for the full term list"];
    bullets(s, kt.slice(0, 14), panelX + 0.2, 2.25, 3.5, 3.3, { max: 14, min: 9, gap: 3 });
    const rel = links.filter((l) => l.unitRef && clean(l.unitRef) === clean(u.ref));
    if (rel.length) {
      s.addText("CONNECTS TO", { x: panelX + 0.25, y: 5.6, w: 3.4, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
      const subs = [...new Set(rel.map((l) => l.with))].slice(0, 4);
      subs.forEach((n, i) => chip(s, n, panelX + 0.25 + (i % 2) * 1.75, 5.92 + Math.floor(i / 2) * 0.4, 1.6, theme.accent, WHITE, 10, 0.32));
    }
    const px = MX + 4.15;
    const pw = W - px - MX;
    card(s, px, 1.8, pw, 5.05, WHITE, LINE, GOLD);
    s.addText("WHAT THE SPECIFICATION REQUIRES", { x: px + 0.3, y: 1.95, w: pw - 0.5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: MUTED, charSpacing: 3, margin: 0 });
    if (pts.length > 7) {
      const half = Math.ceil(pts.length / 2);
      bullets(s, pts.slice(0, half), px + 0.2, 2.3, pw / 2 - 0.2, 4.4, { max: 15, min: 9, gap: 6 });
      bullets(s, pts.slice(half), px + pw / 2, 2.3, pw / 2 - 0.2, 4.4, { max: 15, min: 9, gap: 6 });
    } else bullets(s, pts, px + 0.2, 2.3, pw - 0.4, 4.4, { max: 19, min: 10, gap: 8 });
  }

  // Teaching sequence
  {
    const by = { Y10: [], Y11: [] };
    (d.units || []).forEach((u) => (by[u.year] || (by[u.year] = [])).push(u));
    const s = contentSlide(pres, ctx, "Recommended sequence", "Two-year route through the specification");
    ["Y10", "Y11"].forEach((yr, i) => {
      const x = MX + i * ((W - 2 * MX) / 2 + 0.1);
      const w = (W - 2 * MX) / 2 - 0.1;
      card(s, x, 1.8, w, 5.05, i ? GOLD_SOFT : tint(theme.accent, 0.92), i ? GOLD : tint(theme.accent, 0.6));
      s.addText(`YEAR ${yr.slice(1)}`, { x: x + 0.3, y: 1.92, w: 3, h: 0.4, fontFace: theme.head, fontSize: 20, bold: true, color: i ? GOLD_DARK : theme.accent, margin: 0 });
      const lines = by[yr].map((u) => `${u.ref}  ${u.title}${u.term ? ` (${u.term})` : ""}`);
      bullets(s, lines, x + 0.2, 2.4, w - 0.4, 4.35, { max: 14, min: 8, gap: 3 });
    });
  }

  // Command words
  if ((d.commandWords || []).length) {
    const pages = chunk(d.commandWords, 14);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Exam language", pages.length > 1 ? `Command words (${pi + 1} of ${pages.length})` : "Command words and what they ask for");
      const half = Math.ceil(pg.length / 2);
      [pg.slice(0, half), pg.slice(half)].forEach((col, ci) => {
        if (!col.length) return;
        const w = (W - 2 * MX - 0.3) / 2;
        tableSlideRows(s, ["Word", "What it asks for"], col.map((c) => [c.word, c.meaning]), MX + ci * (w + 0.3), 1.8, w, [1.6, w - 1.6], col.length > 6 ? 11 : 13, theme.accent);
      });
    });
  }

  // Skills + prerequisites
  if ((d.skills || []).length || (d.prerequisites || []).length) {
    const s = contentSlide(pres, ctx, "Skills and prior learning", "What pupils must be able to do, and what they build on");
    const lw = (W - 2 * MX) * 0.42;
    card(s, MX, 1.8, lw, 5.05, WHITE, LINE, theme.accent);
    s.addText("EXAMINED SKILLS", { x: MX + 0.3, y: 1.95, w: 4, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
    bullets(s, (d.skills || []).slice(0, 12), MX + 0.2, 2.25, lw - 0.4, 4.5, { max: 15, min: 9, gap: 5 });
    const rx = MX + lw + 0.25;
    const rw = W - rx - MX;
    s.addText("BUILDS ON  →  SUPPORTS", { x: rx, y: 1.85, w: rw, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
    const pre = (d.prerequisites || []).slice(0, 7);
    const rh = Math.min(0.72, 4.6 / Math.max(pre.length, 1));
    pre.forEach((p, i) => {
      const y = 2.2 + i * (rh + 0.06);
      card(s, rx, y, rw * 0.5 - 0.2, rh, tint(theme.accent, 0.92), tint(theme.accent, 0.65));
      s.addText(clean(p.from), { x: rx + 0.12, y, w: rw * 0.5 - 0.4, h: rh, fontFace: FONT, fontSize: fitSize(p.from, rw * 0.5 - 0.4, rh - 0.08, 12, 8, 0), color: INK, valign: "middle", margin: 0 });
      s.addText("→", { x: rx + rw * 0.5 - 0.2, y, w: 0.4, h: rh, fontFace: FONT, fontSize: 20, bold: true, color: GOLD, align: "center", valign: "middle", margin: 0 });
      card(s, rx + rw * 0.5 + 0.2, y, rw * 0.5 - 0.2, rh, GOLD_SOFT, GOLD);
      s.addText(clean(p.to), { x: rx + rw * 0.5 + 0.32, y, w: rw * 0.5 - 0.44, h: rh, fontFace: FONT, fontSize: fitSize(p.to, rw * 0.5 - 0.44, rh - 0.08, 12, 8, 0), color: INK, valign: "middle", margin: 0 });
    });
  }

  // Cross-curricular connections
  if (links.length) {
    const pages = chunk(links, 6);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Cross-curricular connections", pages.length > 1 ? `Where ${d.subject} meets other subjects (${pi + 1} of ${pages.length})` : `Where ${d.subject} meets other subjects`);
      const boxes = gridBoxes(pg.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 5.05 }, 3, 0.2, 2.42);
      pg.forEach((l, i) => {
        const b = boxes[i];
        card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
        chip(s, l.with, b.x + 0.25, b.y + 0.15, Math.min(2.4, 0.6 + clean(l.with).length * 0.1), theme.accent, tint(theme.accent, 0.86), 11, 0.32);
        if (l.unitRef) s.addText(`Unit ${clean(l.unitRef)}`, { x: b.x + b.w - 1.4, y: b.y + 0.15, w: 1.2, h: 0.32, fontFace: FONT, fontSize: 10, color: MUTED, align: "right", valign: "middle", margin: 0 });
        s.addText(clean(l.topic), { x: b.x + 0.25, y: b.y + 0.58, w: b.w - 0.4, h: 0.6, fontFace: FONT, fontSize: fitSize(l.topic, b.w - 0.4, 0.6, 14, 9, 0), bold: true, color: INK, valign: "top", margin: 0 });
        s.addText(clean(l.how), { x: b.x + 0.25, y: b.y + 1.2, w: b.w - 0.4, h: b.h - 1.3, fontFace: FONT, fontSize: fitSize(l.how, b.w - 0.4, b.h - 1.3, 12, 8, 0), color: MUTED, valign: "top", margin: 0 });
      });
    });
  }

  if (d.contextNote) {
    const s = contentSlide(pres, ctx, "Teaching note", "Required content that needs careful handling");
    card(s, MX, 1.8, W - 2 * MX, 4.9, WHITE, LINE, GOLD);
    s.addText(clean(d.contextNote), { x: MX + 0.4, y: 2.0, w: W - 2 * MX - 0.8, h: 4.5, fontFace: FONT, fontSize: fitSize(d.contextNote, W - 2 * MX - 0.8, 4.5, 20, 11, 0), color: INK, valign: "top", margin: 0 });
  }

  sourcesAndGaps(pres, ctx, d);
  return pres;
}

// ───────────────────────────── KS1–3 SYLLABUS DECK ─────────────────────────
export function buildSyllabusDeck(d) {
  const theme = makeTheme(d.slug);
  const years = Object.keys(d.yearMap || {}).sort((a, b) => yrNum(a) - yrNum(b));
  const span = years.length ? `${yearLabel(years[0])} to ${yearLabel(years[years.length - 1])}` : "Reception to Year 9";
  const ctx = { theme, status: d.status, page: 1, footerLeft: `${d.subject} · Syllabus · ${span}` };
  const pres = newDeck(`${d.subject} syllabus: ${span}`, d.subject);

  titleSlide(pres, ctx, {
    label: `Syllabus · ${span}`,
    title: d.subject,
    sub: d.framework,
    facts: [span, `${years.length} year groups`, `${(d.keyStages || []).length} key stages`].filter(Boolean),
  });

  // Purpose + key stage band
  {
    const s = contentSlide(pres, ctx, "Purpose and shape", `Why ${d.subject} is taught, and how the programme is staged`);
    card(s, MX, 1.8, W - 2 * MX, 2.15, WHITE, LINE, theme.accent);
    bullets(s, d.purpose || [], MX + 0.25, 1.9, W - 2 * MX - 0.5, 1.95, { max: 17, min: 10, gap: 5 });
    // staircase of year blocks
    const yb = { x: MX, y: 4.25, w: W - 2 * MX, h: 2.55 };
    const all = years.length ? years : [];
    const bw = yb.w / Math.max(all.length, 1);
    all.forEach((y, i) => {
      const n = yrNum(y);
      const ks = n <= 2 ? 0 : n <= 6 ? 1 : 2;
      const hh = 0.9 + 0.12 * i;
      const fill = [tint(theme.accent, 0.6), tint(theme.accent, 0.3), theme.accent][ks];
      s.addShape("rect", { x: yb.x + i * bw + 0.03, y: yb.y + yb.h - hh - 0.5, w: bw - 0.06, h: hh, fill: { color: fill }, line: { color: fill, width: 0 } });
      s.addText(String((d.yearMap[y] || []).length), { x: yb.x + i * bw, y: yb.y + yb.h - hh - 0.5, w: bw, h: hh, fontFace: theme.head, fontSize: 22, bold: true, color: ks === 0 ? INK : WHITE, align: "center", valign: "middle", margin: 0 });
      s.addText(y === "reception" ? "Rec" : `Y${String(y).slice(1)}`, { x: yb.x + i * bw, y: yb.y + yb.h - 0.46, w: bw, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: INK, align: "center", margin: 0 });
    });
    s.addText("Number of units in each year", { x: yb.x, y: yb.y - 0.02, w: 4, h: 0.28, fontFace: FONT, fontSize: 10, color: MUTED, italic: true, margin: 0 });
  }

  // Key-stage statutory content
  for (const ks of d.keyStages || []) {
    const pages = chunk(ks.strands, 4);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, `${ks.ks} · ${ks.years}`, pages.length > 1 ? `What the framework requires (${pi + 1} of ${pages.length})` : "What the framework requires", { tag: ks.ks });
      const per = pg.length > 2 ? 2 : pg.length;
      const boxes = gridBoxes(pg.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 5.05 }, per, 0.22);
      pg.forEach((st, i) => {
        const b = boxes[i];
        card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
        s.addText(clean(st.strand), { x: b.x + 0.3, y: b.y + 0.12, w: b.w - 0.5, h: 0.5, fontFace: theme.head, fontSize: fitSize(st.strand, b.w - 0.5, 0.5, 18, 11, 0, 0.9), bold: true, color: theme.accent, margin: 0 });
        bullets(s, st.statements, b.x + 0.2, b.y + 0.68, b.w - 0.4, b.h - 0.8, { max: 14, min: 8, gap: 4 });
      });
    });
  }

  // Syllabus on a page (year x units)
  {
    const groups = [];
    for (let i = 0; i < years.length; i += 5) groups.push(years.slice(i, i + 5));
    groups.forEach((g, gi) => {
      const s = contentSlide(pres, ctx, "Syllabus on a page", groups.length > 1 ? `Unit by unit, year by year (${gi + 1} of ${groups.length})` : "Unit by unit, year by year");
      const rh = Math.min(1.0, 5.0 / g.length);
      g.forEach((y, i) => {
        const yy = 1.8 + i * (rh + 0.05);
        card(s, MX, yy, 1.5, rh, theme.accent, theme.accent);
        s.addText(yearLabel(y), { x: MX, y: yy, w: 1.5, h: rh, fontFace: theme.head, fontSize: 16, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
        const units = (d.yearMap[y] || []).map((u) => u.unit);
        const bx = MX + 1.65;
        const bw = W - bx - MX;
        card(s, bx, yy, bw, rh, WHITE, LINE);
        const text = units.join("   ·   ");
        s.addText(text, { x: bx + 0.15, y: yy, w: bw - 0.3, h: rh, fontFace: FONT, fontSize: fitSize(text, bw - 0.3, rh - 0.1, 14, 8, 0), color: INK, valign: "middle", margin: 0 });
      });
    });
  }

  // Year detail
  for (const y of years) {
    const units = d.yearMap[y] || [];
    const per3 = units.length % 3 === 1 && units.length <= 4 ? 4 : 3;
    const pages = chunk(units, per3);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, `${yearLabel(y)}`, pages.length > 1 ? `${yearLabel(y)}: the year's units (${pi + 1} of ${pages.length})` : `${yearLabel(y)}: the year's units`, { tag: yearLabel(y) });
      const rh = (5.05 - 0.15 * (per3 - 1)) / per3;
      pg.forEach((u, i) => {
        const by = 1.8 + i * (rh + 0.15);
        card(s, MX, by, W - 2 * MX, rh, WHITE, LINE, theme.accent);
        const lw = (W - 2 * MX) * 0.58;
        s.addText(clean(u.unit), { x: MX + 0.3, y: by + 0.08, w: lw - 0.4, h: 0.4, fontFace: theme.head, fontSize: fitSize(u.unit, lw - 0.4, 0.4, 17, 11, 0, 0.9), bold: true, color: INK, valign: "top", margin: 0 });
        bullets(s, u.focus || [], MX + 0.2, by + 0.5, lw - 0.3, rh - 0.55, { max: 13, min: 9, gap: 2 });
        const rx = MX + lw + 0.1, rw = W - MX - rx - 0.2;
        const kt = (u.keyTerms || []).slice(0, 8).join(" · ");
        const parts = [];
        if (kt) parts.push({ text: "Key terms: ", options: { bold: true, color: theme.accent } }, { text: kt, options: { breakLine: true } });
        if (u.assess) parts.push({ text: "Check: ", options: { bold: true, color: theme.accent } }, { text: clean(u.assess), options: { breakLine: true } });
        if (u.prereq) parts.push({ text: "Builds on: ", options: { bold: true, color: theme.accent } }, { text: clean(u.prereq), options: { breakLine: true } });
        if (u.leadsTo) parts.push({ text: "Leads to: ", options: { bold: true, color: theme.accent } }, { text: clean(u.leadsTo) });
        const plain = [kt && `Key terms: ${kt}`, u.assess && `Check: ${u.assess}`, u.prereq && `Builds on: ${u.prereq}`, u.leadsTo && `Leads to: ${u.leadsTo}`].filter(Boolean);
        s.addShape("line", { x: rx - 0.05, y: by + 0.15, w: 0, h: rh - 0.3, line: { color: LINE, width: 1 } });
        s.addText(parts, { x: rx + 0.1, y: by + 0.1, w: rw - 0.1, h: rh - 0.2, fontFace: FONT, fontSize: fitSize(plain, rw - 0.1, rh - 0.2, 12, 8, 4), color: MUTED, valign: "top", margin: 0, paraSpaceAfter: 4 });
      });
    });
  }

  // Progression threads
  if ((d.progression || []).length) {
    const pages = chunk(d.progression, 5);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Progression", pages.length > 1 ? `How each thread deepens (${pi + 1} of ${pages.length})` : "How each thread deepens across the years");
      const cols = [...new Set(pg.flatMap((t) => Object.keys(t.steps || {})))].sort((a, b) => yrNum(a) - yrNum(b)).slice(0, 5);
      const colW = (W - 2 * MX - 1.9) / Math.max(cols.length, 1);
      const rows = pg.map((t) => [t.thread, ...cols.map((c) => (t.steps || {})[c] || "")]);
      tableSlideRows(s, ["Thread", ...cols.map((c) => (/^\d/.test(c) ? `Year ${c}` : c))], rows, MX, 1.8, W - 2 * MX, [1.9, ...cols.map(() => colW)], rows.length > 3 ? 10 : 11, theme.accent);
    });
  }

  if (d.toKS4) {
    const s = contentSlide(pres, ctx, "Looking ahead", "How this programme sets up the examination course");
    card(s, MX, 1.8, W - 2 * MX, 4.9, GOLD_SOFT, GOLD, GOLD_DARK);
    s.addText(clean(d.toKS4), { x: MX + 0.45, y: 2.0, w: W - 2 * MX - 0.9, h: 4.5, fontFace: FONT, fontSize: fitSize(d.toKS4, W - 2 * MX - 0.9, 4.5, 20, 11, 0), color: INK, valign: "top", margin: 0 });
  }

  const links = d.links || [];
  if (links.length) {
    const pages = chunk(links, 6);
    pages.forEach((pg, pi) => {
      const s = contentSlide(pres, ctx, "Cross-curricular connections", pages.length > 1 ? `Where ${d.subject} meets other subjects (${pi + 1} of ${pages.length})` : `Where ${d.subject} meets other subjects`);
      const boxes = gridBoxes(pg.length, { x: MX, y: 1.8, w: W - 2 * MX, h: 5.05 }, 3, 0.2, 2.42);
      pg.forEach((l, i) => {
        const b = boxes[i];
        card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
        chip(s, l.with, b.x + 0.25, b.y + 0.15, Math.min(2.4, 0.6 + clean(l.with).length * 0.1), theme.accent, tint(theme.accent, 0.86), 11, 0.32);
        if (l.years) s.addText(clean(l.years), { x: b.x + b.w - 1.5, y: b.y + 0.15, w: 1.3, h: 0.32, fontFace: FONT, fontSize: 10, color: MUTED, align: "right", valign: "middle", margin: 0 });
        s.addText(clean(l.topic), { x: b.x + 0.25, y: b.y + 0.58, w: b.w - 0.4, h: 0.6, fontFace: FONT, fontSize: fitSize(l.topic, b.w - 0.4, 0.6, 14, 9, 0), bold: true, color: INK, valign: "top", margin: 0 });
        s.addText(clean(l.how), { x: b.x + 0.25, y: b.y + 1.2, w: b.w - 0.4, h: b.h - 1.3, fontFace: FONT, fontSize: fitSize(l.how, b.w - 0.4, b.h - 1.3, 12, 8, 0), color: MUTED, valign: "top", margin: 0 });
      });
    });
  }

  sourcesAndGaps(pres, ctx, d);
  return pres;
}
