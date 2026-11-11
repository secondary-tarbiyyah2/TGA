// "Star of the week" certificate: a single branded A4-LANDSCAPE page built
// with pdf-lib (same approach as signedPdf.ts). Redesigned 11 Nov 2026 (owner:
// "needs improvement"): the official gold logo, the site's Space Grotesk type,
// an ink frame with a gold hairline, the child's name as the hero, the
// teacher's reason and message, and a details row (class, week, awarded on).
// No star motif (owner, 11 Nov 2026). Fonts and logo are bundled in
// certificateAssets.ts; any character the subset font lacks is transliterated
// or swapped for "?" rather than drawn as a blank box.
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { SPACE_GROTESK_BOLD, SPACE_GROTESK_MEDIUM, SPACE_GROTESK_REGULAR, TGA_LOGO_PNG } from "./certificateAssets.ts";

const GOLD = rgb(0.69, 0.557, 0.271); // #b08e45
const GOLD_DARK = rgb(0.49, 0.392, 0.157); // #7d6428, the logo gold
const GOLD_LIGHT = rgb(0.89, 0.788, 0.561); // #e3c98f
const INK = rgb(0.106, 0.118, 0.129); // #1b1e21
const GREY = rgb(0.38, 0.38, 0.38);
const CREAM = rgb(0.992, 0.984, 0.965); // #fdfbf6
const SAND = rgb(0.965, 0.925, 0.839); // #f6ecd6

export type CertificateInput = {
  fullName: string;
  firstName: string;
  reason: string;
  /** Optional personal message from the teacher (0131), printed in italics under the reason. */
  message?: string | null;
  className: string;
  /** ISO date (YYYY-MM-DD) of the Monday the week began. */
  weekStart: string;
  /** ISO timestamp the star was approved, shown as the certificate date. */
  approvedAt: string | null;
};

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Characters each embedded font can draw (subset fonts have no .notdef fallback worth showing).
const charSets = new WeakMap<PDFFont, Set<number>>();
function canDraw(font: PDFFont, ch: string): boolean {
  let set = charSets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charSets.set(font, set);
  }
  return set.has(ch.codePointAt(0)!);
}

function safe(font: PDFFont, s: string): string {
  let out = "";
  for (const ch of s.replace(/[ʻʼʾʿ]/g, "'").replace(/[\r\n\t]+/g, " ")) {
    if (canDraw(font, ch)) {
      out += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += base && [...base].every((c) => canDraw(font, c)) ? base : "?";
  }
  return out;
}

function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of safe(font, text).split(/ +/)) {
    let w = word;
    while (font.widthOfTextAtSize(w, size) > maxW) {
      let n = w.length;
      while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > maxW) n--;
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const ukLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/London" });
const weekLong = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" });

/** Letter-spaced text (pdf-lib has no tracking option), centred on cx. */
function tracked(page: PDFPage, text: string, cx: number, y: number, font: PDFFont, size: number, color: RGB, tracking: number) {
  const t = safe(font, text);
  const widths = [...t].map((c) => font.widthOfTextAtSize(c, size));
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, t.length - 1);
  let x = cx - total / 2;
  [...t].forEach((c, i) => {
    page.drawText(c, { x, y, size, font, color });
    x += widths[i] + tracking;
  });
}

export async function buildStarCertificate(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const W = 841.89;
  const H = 595.28;
  const page = pdf.addPage([W, H]);
  const regular = await pdf.embedFont(b64(SPACE_GROTESK_REGULAR), { subset: true });
  const medium = await pdf.embedFont(b64(SPACE_GROTESK_MEDIUM), { subset: true });
  const bold = await pdf.embedFont(b64(SPACE_GROTESK_BOLD), { subset: true });
  const logo = await pdf.embedPng(b64(TGA_LOGO_PNG));
  const cx = W / 2;

  const center = (text: string, y: number, font: PDFFont, size: number, color: RGB = INK) => {
    const t = safe(font, text);
    page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
  };

  // Ground and frame: a firm ink rule, then a gold hairline inside it. Kept clear of
  // the paper's edge (most printers can't print to it) and light on ink.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: INK, borderWidth: 5 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: GOLD, borderWidth: 1 });
  // Short gold corner brackets just inside the hairline.
  const c = 38;
  const L = 26;
  for (const [x, y, dx, dy] of [[c, c, 1, 1], [W - c, c, -1, 1], [c, H - c, 1, -1], [W - c, H - c, -1, -1]]) {
    page.drawLine({ start: { x, y }, end: { x: x + dx * L, y }, thickness: 2.5, color: GOLD });
    page.drawLine({ start: { x, y }, end: { x, y: y + dy * L }, thickness: 2.5, color: GOLD });
  }

  // Logo, in its official gold.
  const logoW = 200;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, { x: cx - logoW / 2, y: H - 64 - logoH, width: logoW, height: logoH });

  tracked(page, "CERTIFICATE OF ACHIEVEMENT", cx, H - 148, medium, 10.5, GOLD_DARK, 3.2);
  center("Star of the Week", H - 200, bold, 50, INK);
  center("This certificate is proudly presented to", H - 232, regular, 13.5, GREY);

  // The child's name: the hero line, shrunk to fit.
  const maxName = W - 220;
  let nameSize = 46;
  const name = safe(bold, input.fullName);
  while (nameSize > 22 && bold.widthOfTextAtSize(name, nameSize) > maxName) nameSize -= 2;
  center(name, H - 288, bold, nameSize, GOLD_DARK);
  page.drawRectangle({ x: cx - 36, y: H - 306, width: 72, height: 3, color: GOLD });

  // Why: the teacher's reason, then their own message in a soft panel.
  const message = (input.message || "").trim();
  const reasonLines = wrap(medium, 15, `Well done, ${input.firstName}! ${input.reason}`, 580).slice(0, message ? 3 : 4);
  let y = H - 338;
  for (const l of reasonLines) {
    center(l, y, medium, 15, INK);
    y -= 21;
  }
  if (message) {
    const msgLines = wrap(regular, 12.5, `\u201C${message}\u201D`, 500).slice(0, 2);
    const boxH = 16 + msgLines.length * 17;
    const boxW = Math.min(560, Math.max(...msgLines.map((l) => regular.widthOfTextAtSize(l, 12.5))) + 48);
    y -= 6;
    page.drawRectangle({ x: cx - boxW / 2, y: y - boxH + 12, width: boxW, height: boxH, color: SAND });
    let my = y - 4;
    for (const l of msgLines) {
      center(l, my, regular, 12.5, GOLD_DARK);
      my -= 17;
    }
  }

  // Details row: class, week, awarded on, divided by hairlines.
  const cols = [
    ["CLASS", input.className || ""],
    ["WEEK BEGINNING", weekLong(input.weekStart)],
    ["AWARDED ON", input.approvedAt ? ukLong(input.approvedAt) : ""],
  ];
  const rowY = 112;
  const colW = 210;
  const left = cx - (colW * cols.length) / 2;
  page.drawLine({ start: { x: left, y: rowY + 34 }, end: { x: left + colW * cols.length, y: rowY + 34 }, thickness: 0.6, color: GOLD_LIGHT });
  cols.forEach(([label, value], i) => {
    const mid = left + colW * i + colW / 2;
    tracked(page, label, mid, rowY + 16, medium, 8, GOLD_DARK, 1.8);
    let size = 12.5;
    const v = safe(medium, value);
    while (size > 9 && medium.widthOfTextAtSize(v, size) > colW - 20) size -= 0.5;
    page.drawText(v, { x: mid - medium.widthOfTextAtSize(v, size) / 2, y: rowY - 2, size, font: medium, color: INK });
    if (i > 0) page.drawLine({ start: { x: left + colW * i, y: rowY - 8 }, end: { x: left + colW * i, y: rowY + 26 }, thickness: 0.6, color: GOLD_LIGHT });
  });

  // Signature lines.
  const sigY = 62;
  page.drawLine({ start: { x: 96, y: sigY + 12 }, end: { x: 276, y: sigY + 12 }, thickness: 0.6, color: GREY });
  page.drawText("Headteacher", { x: 96, y: sigY, size: 9, font: regular, color: GREY });
  page.drawLine({ start: { x: W - 276, y: sigY + 12 }, end: { x: W - 96, y: sigY + 12 }, thickness: 0.6, color: GREY });
  page.drawText("Class teacher", { x: W - 276, y: sigY, size: 9, font: regular, color: GREY });
  center("globalacademy.tarbiyyah.co.uk", sigY, regular, 8.5, GREY);

  pdf.setTitle(`Star of the Week - ${safe(regular, input.fullName)}`);
  pdf.setAuthor("Tarbiyyah Global Academy");
  return await pdf.save();
}
