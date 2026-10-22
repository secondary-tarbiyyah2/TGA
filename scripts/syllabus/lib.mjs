// Shared design tokens and helpers for the Syllabus & Specification pack decks.
// Brand: gold, ink, cream (see DESIGN.md). Each subject keeps its own accent from
// scripts/lessons/deck-parts.mjs so a deck is recognisable at a glance.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { themeFor, makeParts } from "../lessons/deck-parts.mjs";

const require = createRequire(import.meta.url);
export const PptxGenJS = require("pptxgenjs");

export const ROOT = new URL("../../", import.meta.url).pathname;
export const W = 13.333;
export const H = 7.5;
export const MX = 0.6; // side margin
export const INK = "1B1E21";
export const MUTED = "5B6168";
export const GOLD = "B08E45";
export const GOLD_DARK = "7D6428";
export const GOLD_SOFT = "F5ECD6";
export const CREAM = "FBF7EE";
export const LINE = "E3DED2";
export const WHITE = "FFFFFF";
export const FONT = "Calibri";
export const LOGO_DARK = path.join(ROOT, "public/brand/ga-wordmark.png");
export const LOGO_WHITE = path.join(ROOT, "public/brand/ga-wordmark-white.png");
export const LOGO_RATIO = 393 / 120;

export const STATUS = {
  Verified: { fill: "DDEFE3", ink: "1E5B36", label: "VERIFIED" },
  Provisional: { fill: "FBE9C8", ink: "7A4B00", label: "PROVISIONAL" },
};

export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const slugify = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const yearLabel = (y) => (y === "reception" ? "Reception" : /^y\d+$/i.test(y) ? `Year ${String(y).slice(1)}` : y);

/** Largest font size that fits `texts` in a w×h inch box (conservative word-wrap estimate). */
export function fitSize(texts, w, h, max, min, gapPt = 6, widthFactor = 1) {
  const list = (Array.isArray(texts) ? texts : [texts]).map(clean).filter(Boolean);
  if (!list.length) return max;
  for (let size = max; size > min; size -= 0.5) {
    const cpl = Math.max(4, Math.floor(((w * 72 - 14) / (size * 0.5)) / widthFactor));
    let lines = 0;
    for (const t of list) {
      let line = 0;
      let count = 1;
      for (const word of t.split(" ")) {
        const len = word.length + (line ? 1 : 0);
        if (line + len > cpl && line > 0) {
          count++;
          line = word.length;
        } else line += len;
      }
      lines += count;
    }
    const need = (lines * size * 1.2 + (list.length - 1) * gapPt + 8) / 72;
    if (need <= h) return size;
  }
  return min;
}

export function makeTheme(slug) {
  const th = themeFor(slug);
  const parts = makeParts({ fitSize, clean, FONT, INK, MUTED, GOLD, GOLD_DARK, GOLD_SOFT, CREAM, LINE });
  return { ...th, motifFn: (s, b) => parts.motif(s, th, b) };
}

/** Mix a hex colour with white by t (0..1 toward white). */
export function tint(hex, t) {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0");
  return (m(r) + m(g) + m(b)).toUpperCase();
}

export function newDeck(title, subject) {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.title = title;
  p.author = "Tarbiyyah Global Academy";
  p.company = "Tarbiyyah Global Academy";
  p.subject = subject || "Syllabus and specification pack";
  return p;
}

/** Standard content slide: cream background, kicker, title, gold rule, footer with page number. */
export function contentSlide(pres, ctx, kicker, title, opts = {}) {
  const s = pres.addSlide();
  s.background = { color: CREAM };
  // accent edge on the left
  s.addShape("rect", { x: 0, y: 0, w: 0.16, h: H, fill: { color: ctx.theme.accent }, line: { color: ctx.theme.accent, width: 0 } });
  s.addText(clean(kicker).toUpperCase(), { x: MX, y: 0.36, w: 9, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: ctx.theme.accent, charSpacing: 4, margin: 0 });
  const tSize = fitSize(title, W - 2 * MX - 2.4, 0.8, 30, 20, 0, 0.9);
  s.addText(clean(title), { x: MX, y: 0.66, w: W - 2 * MX - 2.4, h: 0.8, fontFace: ctx.theme.head, fontSize: tSize, bold: true, color: INK, valign: "top", margin: 0 });
  s.addShape("line", { x: MX, y: 1.5, w: 1.1, h: 0, line: { color: GOLD, width: 2.5 } });
  s.addShape("line", { x: MX + 1.1, y: 1.5, w: W - 2 * MX - 1.1, h: 0, line: { color: LINE, width: 1 } });
  if (opts.tag) chip(s, opts.tag, W - MX - 2.2, 0.5, 2.2, ctx.theme.accent, tint(ctx.theme.accent, 0.86), 11);
  footer(s, ctx);
  return s;
}

export function footer(s, ctx) {
  ctx.page = (ctx.page || 1) + 1;
  s.addText(`${ctx.footerLeft}`, { x: MX, y: 7.08, w: 8.5, h: 0.28, fontFace: FONT, fontSize: 9, color: MUTED, margin: 0 });
  s.addText(String(ctx.page), { x: W - MX - 0.55, y: 7.08, w: 0.55, h: 0.28, fontFace: FONT, fontSize: 9, color: MUTED, align: "right", margin: 0 });
}

/** Small rounded label. */
export function chip(s, text, x, y, w, ink, fill, size = 10, h = 0.3) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: h / 2, fill: { color: fill }, line: { color: fill, width: 0 } });
  s.addText(clean(text), { x, y, w, h, fontFace: FONT, fontSize: size, bold: true, color: ink, align: "center", valign: "middle", margin: 0, charSpacing: 1 });
}

export function card(s, x, y, w, h, fill = WHITE, edge = LINE, accent = null) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: edge, width: 1 }, shadow: { type: "outer", color: "000000", opacity: 0.06, blur: 6, offset: 1.5, angle: 90 } });
  if (accent) s.addShape("rect", { x: x + 0.02, y: y + 0.18, w: 0.07, h: h - 0.36, fill: { color: accent }, line: { color: accent, width: 0 } });
}

/** Bulleted list fitted to a box. */
export function bullets(s, items, x, y, w, h, opts = {}) {
  const list = items.map(clean).filter(Boolean);
  if (!list.length) return;
  const size = fitSize(list, w - 0.3, h, opts.max || 20, opts.min || 11, opts.gap || 5);
  s.addText(
    list.map((t, i) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: i < list.length - 1, paraSpaceAfter: opts.gap || 5 } })),
    { x, y, w, h, fontFace: FONT, fontSize: size, color: opts.color || INK, valign: "top", margin: [2, 4, 2, 4] },
  );
}

export function sourcesAndGaps(pres, ctx, d) {
  const s = contentSlide(pres, ctx, "Sources", "Sources and open items");
  card(s, MX, 1.75, 5.6, 5.1, WHITE, LINE, ctx.theme.accent);
  const note = clean(d.statusNote);
  s.addText(note, { x: MX + 0.3, y: 2.4, w: 5.0, h: 1.9, fontFace: FONT, fontSize: fitSize(note, 5.0, 1.9, 14, 10), color: INK, valign: "top", margin: 0 });
  s.addText("OFFICIAL SOURCES OPENED", { x: MX + 0.3, y: 4.35, w: 5, h: 0.28, fontFace: FONT, fontSize: 10, bold: true, color: MUTED, charSpacing: 3, margin: 0 });
  const srcs = (d.sources || []).slice(0, 7).map((x) => ({ text: `${clean(x.title)}\n${clean(x.url)}`, options: { breakLine: true } }));
  s.addText(srcs.length ? srcs : "None", { x: MX + 0.3, y: 4.65, w: 5.0, h: 2.1, fontFace: FONT, fontSize: Math.min(10, fitSize((d.sources || []).slice(0, 7).map((x) => `${x.title} ${x.url}`), 5.0, 2.1, 10, 7)), color: MUTED, valign: "top", margin: 0, paraSpaceAfter: 4 });
  const gx = MX + 5.9;
  s.addText("OPEN ITEMS TO CONFIRM", { x: gx, y: 1.75, w: 6, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: ctx.theme.accent, charSpacing: 3, margin: 0 });
  const gaps = (d.gaps || []).length ? d.gaps : ["No open items recorded."];
  bullets(s, gaps, gx, 2.1, W - gx - MX, 4.75, { max: 16, min: 9, gap: 6 });
  return s;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

/** Distribute n items into rows of up to `perRow`; returns [{x,y,w,h}] inside the box. */
export function gridBoxes(n, box, perRow, gap = 0.2, rowH = null) {
  const rows = Math.ceil(n / perRow);
  const w = (box.w - gap * (perRow - 1)) / perRow;
  const h = rowH || (box.h - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({ x: box.x + (i % perRow) * (w + gap), y: box.y + Math.floor(i / perRow) * (h + gap), w, h }));
}
