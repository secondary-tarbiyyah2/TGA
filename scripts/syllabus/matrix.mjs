// Cross-curricular matrix pack: link heatmaps, teaching hubs, year-by-year maps, spiral threads.
import fs from "node:fs";
import path from "node:path";
import {
  W, MX, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, LINE, WHITE, FONT, ROOT,
  clean, fitSize, makeTheme, tint, newDeck, contentSlide, chip, card, bullets, gridBoxes, yearLabel, LOGO_WHITE, LOGO_RATIO, H,
} from "./lib.mjs";

export const GROUPS = ["Mathematics", "English", "Science", "Computing", "Geography", "History", "Islamic Studies", "Qur'an and Tajweed", "Arabic", "Business", "Art and Design", "Physical Education", "PSHE"];
export function groupOf(name) {
  const n = clean(name).toLowerCase();
  if (/physical education|^pe\b/.test(n)) return "Physical Education";
  if (/math/.test(n)) return "Mathematics";
  if (/english|literature|language arts/.test(n)) return "English";
  if (/science|biolog|chemist|physics/.test(n)) return "Science";
  if (/comput/.test(n)) return "Computing";
  if (/geog/.test(n)) return "Geography";
  if (/hist/.test(n)) return "History";
  if (/qur|tajw/.test(n)) return "Qur'an and Tajweed";
  if (/islam/.test(n)) return "Islamic Studies";
  if (/arab/.test(n)) return "Arabic";
  if (/business|econom/.test(n)) return "Business";
  if (/^art\b|design/.test(n)) return "Art and Design";
  if (/pshe|rshe|citizen/.test(n)) return "PSHE";
  return null;
}
const SHORT = { "Qur'an and Tajweed": "Qur'an", "Islamic Studies": "Islamic St.", "Physical Education": "PE", "Art and Design": "Art", Mathematics: "Maths" };
const short = (g) => SHORT[g] || g;

export function loadPack() {
  const base = path.join(ROOT, "content/syllabus");
  const read = (d) => fs.existsSync(path.join(base, d)) ? fs.readdirSync(path.join(base, d)).filter((f) => f.endsWith(".json")).sort().map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(base, d, f), "utf8")) })) : [];
  const hubs = JSON.parse(fs.readFileSync(path.join(base, "matrices/hubs.json"), "utf8")).hubs;
  return { ks4: read("ks4"), ks13: read("ks1-3"), hubs };
}

/** counts[a][b] = number of declared links between group a and b (either direction). */
export function linkCounts(files) {
  const c = {};
  const rows = [];
  for (const d of files) {
    const a = groupOf(d.subject);
    for (const l of d.links || []) {
      const b = groupOf(l.with);
      if (!a || !b || a === b) continue;
      rows.push({ from: d.subject, fromGroup: a, to: l.with, toGroup: b, topic: l.topic, where: l.unitRef || l.years || "", how: l.how, level: d.kind === "spec" ? "KS4" : "KS1-3" });
      (c[a] ||= {})[b] = (c[a][b] || 0) + 1;
      (c[b] ||= {})[a] = (c[b][a] || 0) + 1;
    }
  }
  return { c, rows };
}

function deckCtx(theme, title) {
  return { theme, status: "Provisional", page: 1, footerLeft: title };
}

function heat(s, groups, c, x, y, w, h, accent) {
  const n = groups.length;
  const lab = 1.55;
  const cw = (w - lab) / n, ch = Math.min((h - 0.7) / n, 0.5);
  const max = Math.max(1, ...groups.flatMap((a) => groups.map((b) => (c[a] || {})[b] || 0)));
  groups.forEach((b, j) => s.addText(short(b), { x: x + lab + j * cw, y, w: cw, h: 0.6, fontFace: FONT, fontSize: 11, bold: true, color: INK, align: "center", valign: "bottom", margin: 0 }));
  groups.forEach((a, i) => {
    const yy = y + 0.65 + i * ch;
    s.addText(short(a), { x, y: yy, w: lab - 0.05, h: ch, fontFace: FONT, fontSize: 12, bold: true, color: INK, align: "right", valign: "middle", margin: 0 });
    groups.forEach((b, j) => {
      const v = a === b ? -1 : (c[a] || {})[b] || 0;
      const fill = v < 0 ? "ECE8DD" : v === 0 ? "FFFFFF" : tint(accent, 0.85 - 0.8 * (v / max));
      s.addShape("rect", { x: x + lab + j * cw + 0.015, y: yy + 0.015, w: cw - 0.03, h: ch - 0.03, fill: { color: fill }, line: { color: LINE, width: 0.5 } });
      if (v > 0) s.addText(String(v), { x: x + lab + j * cw, y: yy, w: cw, h: ch, fontFace: FONT, fontSize: 12, bold: true, color: v / max > 0.5 ? WHITE : INK, align: "center", valign: "middle", margin: 0 });
    });
  });
}

export function buildMatrixDeck(pack) {
  const theme = makeTheme("islamic-studies");
  theme.accent = "7D6428";
  const ctx = deckCtx(theme, "Cross-Curricular Matrix Pack");
  const pres = newDeck("Cross-curricular matrix pack", "Cross-curricular matrices");
  const { c: c4, rows: r4 } = linkCounts(pack.ks4);
  const { c: c13, rows: r13 } = linkCounts(pack.ks13);

  // Title
  {
    const s = pres.addSlide();
    s.background = { color: "1B1E21" };
    s.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    chip(s, "Cross-curricular matrices", MX + 0.2, 0.75, 3.1, "1B1E21", "E3C98F", 11, 0.36);
    s.addText("How the subjects connect", { x: MX + 0.2, y: 1.4, w: 7.6, h: 1.7, fontFace: "Georgia", fontSize: 42, bold: true, color: WHITE, margin: 0 });
    s.addText("Link heatmaps, twelve teaching hubs, year-by-year maps and spiral threads, all tied to unit references in the specification and syllabus decks.", { x: MX + 0.2, y: 3.4, w: 7.4, h: 1.4, fontFace: FONT, fontSize: 18, color: "E3C98F", margin: 0, valign: "top" });
    // network motif
    const pts = GROUPS.map((_, i) => ({ x: 10.2 + 2.1 * Math.cos((i / GROUPS.length) * 2 * Math.PI), y: 3.3 + 2.1 * Math.sin((i / GROUPS.length) * 2 * Math.PI) }));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if ((i * 7 + j * 3) % 4 === 0) s.addShape("line", { x: Math.min(pts[i].x, pts[j].x), y: Math.min(pts[i].y, pts[j].y), w: Math.abs(pts[i].x - pts[j].x), h: Math.abs(pts[i].y - pts[j].y), flipV: (pts[i].x - pts[j].x) * (pts[i].y - pts[j].y) < 0, line: { color: GOLD, width: 0.75, transparency: 60 } });
    pts.forEach((p) => s.addShape("ellipse", { x: p.x - 0.13, y: p.y - 0.13, w: 0.26, h: 0.26, fill: { color: GOLD }, line: { color: "E3C98F", width: 1 } }));
    s.addImage({ path: LOGO_WHITE, x: MX + 0.2, y: 6.75, w: 1.9, h: 1.9 / LOGO_RATIO });
  }

  // How to read
  {
    const s = contentSlide(pres, ctx, "Start here", "What is in this pack, and what each part is for");
    const items = [
      ["Heatmaps", "Count of declared links between each pair of subjects. Darker means more. Use it to see where subjects already talk to each other and where they do not."],
      ["Teaching hubs", "One real-world idea taught by several subjects in the same window. Each node names a real unit reference. A hub is a teaching link, not extra examined content."],
      ["Year-by-year maps", "Everything taught in one year group, subject by subject. Use it to plan the same fortnight across subjects."],
      ["Spiral threads", "Ideas that return year after year, getting harder each time. Use it to check that prior learning is secure before a revisit."],
    ];
    const boxes = gridBoxes(4, { x: MX, y: 1.8, w: W - 2 * MX, h: 4.6 }, 2, 0.25);
    items.forEach(([k, v], i) => {
      const b = boxes[i];
      card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
      s.addText(k, { x: b.x + 0.3, y: b.y + 0.15, w: b.w - 0.5, h: 0.5, fontFace: "Georgia", fontSize: 22, bold: true, color: theme.accent, margin: 0 });
      s.addText(v, { x: b.x + 0.3, y: b.y + 0.75, w: b.w - 0.5, h: b.h - 0.9, fontFace: FONT, fontSize: fitSize(v, b.w - 0.5, b.h - 0.9, 17, 11, 0), color: INK, valign: "top", margin: 0 });
    });
    s.addText("Link counts come from the links recorded in each subject file.", { x: MX, y: 6.55, w: W - 2 * MX, h: 0.4, fontFace: FONT, fontSize: 12, italic: true, color: MUTED, margin: 0 });
  }

  // Heatmaps
  for (const [label, c, groups, kicker] of [
    ["KS4 specifications", c4, GROUPS.filter((g) => pack.ks4.some((d) => groupOf(d.subject) === g)), "Heatmap · Years 10 to 11"],
    ["Reception to Year 9 syllabuses", c13, GROUPS.filter((g) => pack.ks13.some((d) => groupOf(d.subject) === g)), "Heatmap · Reception to Year 9"],
  ]) {
    const s = contentSlide(pres, ctx, kicker, `Subject-to-subject links: ${label}`);
    heat(s, groups, c, MX, 1.7, W - 2 * MX, 5.2, theme.accent);
  }

  // Hubs
  pack.hubs.forEach((h, i) => {
    const s = contentSlide(pres, ctx, `Teaching hub ${i + 1} of ${pack.hubs.length}`, h.title);
    card(s, MX, 1.8, 3.7, 5.05, tint(theme.accent, 0.9), tint(theme.accent, 0.5));
    s.addText("THE HOOK", { x: MX + 0.25, y: 1.95, w: 3, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: theme.accent, charSpacing: 3, margin: 0 });
    s.addText(h.hook, { x: MX + 0.25, y: 2.3, w: 3.25, h: 2.4, fontFace: "Georgia", fontSize: fitSize(h.hook, 3.25, 2.4, 20, 12, 0, 0.9), italic: true, color: INK, valign: "top", margin: 0 });
    const subs = [...new Set(h.nodes.map((n) => n.subject))];
    s.addText(`${subs.length} subjects`, { x: MX + 0.25, y: 5.3, w: 3.2, h: 0.5, fontFace: "Georgia", fontSize: 26, bold: true, color: theme.accent, margin: 0 });
    s.addText("Teaching link. Examined content is whatever the linked unit says.", { x: MX + 0.25, y: 5.85, w: 3.2, h: 0.85, fontFace: FONT, fontSize: 11, color: MUTED, valign: "top", margin: 0 });
    const gx = MX + 3.95;
    const gw = W - gx - MX;
    const per = h.nodes.length > 4 ? 2 : 1;
    const boxes = gridBoxes(h.nodes.length, { x: gx, y: 1.8, w: gw, h: 5.05 }, per, 0.15, per === 2 ? (5.05 - 0.3) / 3 : Math.min(1.2, (5.05 - 0.15 * (h.nodes.length - 1)) / h.nodes.length));
    h.nodes.forEach((n, k) => {
      const b = boxes[k];
      card(s, b.x, b.y, b.w, b.h, WHITE, LINE, theme.accent);
      chip(s, n.subject, b.x + 0.25, b.y + 0.12, Math.min(2.2, 0.6 + n.subject.length * 0.1), theme.accent, tint(theme.accent, 0.86), 10, 0.28);
      s.addText(`Unit ${n.ref}`, { x: b.x + b.w - 1.9, y: b.y + 0.12, w: 1.7, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: MUTED, align: "right", valign: "middle", margin: 0 });
      s.addText(n.note, { x: b.x + 0.25, y: b.y + 0.45, w: b.w - 0.4, h: b.h - 0.5, fontFace: FONT, fontSize: fitSize(n.note, b.w - 0.4, b.h - 0.5, 14, 9, 0), color: INK, valign: "top", margin: 0 });
    });
  });

  // Hub × subject matrix
  {
    const groups = [...new Set(pack.hubs.flatMap((h) => h.nodes.map((n) => groupOf(n.subject))))];
    const s = contentSlide(pres, ctx, "Hub coverage", "Which subjects join which hub");
    const lab = 4.4, cw = (W - 2 * MX - lab) / groups.length, ch = 0.36;
    groups.forEach((g, j) => s.addText(short(g), { x: MX + lab + j * cw, y: 1.7, w: cw, h: 0.5, fontFace: FONT, fontSize: 10, bold: true, color: INK, align: "center", valign: "bottom", margin: 0 }));
    pack.hubs.forEach((h, i) => {
      const y = 2.25 + i * ch;
      s.addText(`${i + 1}. ${h.title}`, { x: MX, y, w: lab - 0.1, h: ch, fontFace: FONT, fontSize: fitSize(h.title, lab - 0.3, ch, 11, 8, 0), color: INK, valign: "middle", margin: 0 });
      groups.forEach((g, j) => {
        const on = h.nodes.some((n) => groupOf(n.subject) === g);
        s.addShape("rect", { x: MX + lab + j * cw + 0.015, y: y + 0.015, w: cw - 0.03, h: ch - 0.03, fill: { color: on ? theme.accent : "FFFFFF" }, line: { color: LINE, width: 0.5 } });
        if (on) s.addText("●", { x: MX + lab + j * cw, y, w: cw, h: ch, fontFace: FONT, fontSize: 11, color: WHITE, align: "center", valign: "middle", margin: 0 });
      });
    });
  }

  // Year-by-year maps
  const yrs = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9"];
  for (const y of yrs) {
    const rows = pack.ks13.map((d) => ({ g: groupOf(d.subject), units: ((d.yearMap || {})[y] || []).map((u) => u.unit) })).filter((r) => r.units.length);
    if (!rows.length) continue;
    const s = contentSlide(pres, ctx, "Year-by-year map", `${yearLabel(y)}: every subject at a glance`, { tag: yearLabel(y) });
    const rh = Math.min(0.55, (5.1 - 0.04 * rows.length) / rows.length);
    rows.forEach((r, i) => {
      const yy = 1.75 + i * (rh + 0.04);
      card(s, MX, yy, 2.2, rh, theme.accent, theme.accent);
      s.addText(r.g, { x: MX + 0.1, y: yy, w: 2.0, h: rh, fontFace: FONT, fontSize: 12, bold: true, color: WHITE, valign: "middle", margin: 0 });
      card(s, MX + 2.3, yy, W - 2 * MX - 2.3, rh, WHITE, LINE);
      const t = r.units.join("   ·   ");
      s.addText(t, { x: MX + 2.4, y: yy, w: W - 2 * MX - 2.5, h: rh, fontFace: FONT, fontSize: fitSize(t, W - 2 * MX - 2.5, rh - 0.05, 12, 7, 0), color: INK, valign: "middle", margin: 0 });
    });
  }

  // Spiral threads
  {
    const rows = pack.ks13.flatMap((d) => (d.progression || []).map((t) => {
      const ks = Object.keys(t.steps || {}).sort();
      const nk = (k) => (String(k).toLowerCase().startsWith("r") ? 0 : Number((String(k).match(/\d+/) || [99])[0]));
      const sorted = Object.keys(t.steps || {}).sort((a, b) => nk(a) - nk(b));
      return [groupOf(d.subject) || d.subject, t.thread, `${sorted[0]}: ${t.steps[sorted[0]]}`, `${sorted[sorted.length - 1]}: ${t.steps[sorted[sorted.length - 1]]}`];
    }));
    const per = 7;
    for (let p = 0; p * per < rows.length; p++) {
      const pg = rows.slice(p * per, p * per + per);
      const s = contentSlide(pres, ctx, "Spiral threads", `Ideas that return and deepen (${p + 1} of ${Math.ceil(rows.length / per)})`);
      const mk = (t, o = {}) => ({ text: clean(t), options: { fontFace: FONT, fontSize: 10, color: INK, valign: "top", ...o } });
      const data = [["Subject", "Thread", "First met", "Latest step"].map((h) => mk(h, { bold: true, color: WHITE, fill: { color: theme.accent } }))];
      pg.forEach((r, i) => data.push(r.map((x, j) => mk(x, { fill: { color: i % 2 ? WHITE : tint(theme.accent, 0.92) }, bold: j < 2 }))));
      s.addTable(data, { x: MX, y: 1.8, w: W - 2 * MX, colW: [1.6, 2.4, (W - 2 * MX - 4) / 2, (W - 2 * MX - 4) / 2], border: { type: "solid", color: LINE, pt: 0.75 }, margin: [0.05, 0.08, 0.05, 0.08] });
    }
  }
  return { pres, rows: [...r4, ...r13], counts: { ks4: c4, ks13: c13 } };
}
