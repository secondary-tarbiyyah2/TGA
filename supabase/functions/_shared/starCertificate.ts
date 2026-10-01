// "Star of the week" certificate: a single branded A4-LANDSCAPE page built
// with pdf-lib (same approach as signedPdf.ts). Celebratory but tasteful:
// gold double border, the child's full name large, "Well done, <first
// name>!", the teacher's reason, the class and week. Standard PDF fonts only,
// so anything outside WinAnsi is transliterated or swapped for "?" rather
// than letting drawing throw.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";

const GOLD = rgb(0.69, 0.56, 0.27);
const GOLD_DARK = rgb(0.37, 0.29, 0.12);
const INK = rgb(0.11, 0.12, 0.13);
const GREY = rgb(0.42, 0.42, 0.42);
const CREAM = rgb(0.992, 0.984, 0.965);

export type CertificateInput = {
  fullName: string;
  firstName: string;
  reason: string;
  className: string;
  /** ISO date (YYYY-MM-DD) of the Monday the week began. */
  weekStart: string;
  /** ISO timestamp the star was approved, shown as the certificate date. */
  approvedAt: string | null;
};

function safe(font: PDFFont, s: string): string {
  let out = "";
  for (const ch of s.replace(/[‘’ʻʼʾʿ]/g, "'").replace(/[“”]/g, '"').replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
      continue;
    } catch {
      // fall through to the accent-stripped form
    }
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    try {
      font.encodeText(base);
      out += base;
    } catch {
      out += "?";
    }
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

export async function buildStarCertificate(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const W = 841.89;
  const H = 595.28;
  const page = pdf.addPage([W, H]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const center = (text: string, y: number, font: PDFFont, size: number, color = INK) => {
    const t = safe(font, text);
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: GOLD, borderWidth: 3 });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: GOLD, borderWidth: 0.75 });

  center("TARBIYYAH GLOBAL ACADEMY", H - 82, sansBold, 12, GOLD);

  // A small five-point star between the school name and the title.
  const cx = W / 2;
  const cy = H - 112;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 14 : 5.6;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${i === 0 ? "M" : "L"} ${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
  }
  page.drawSvgPath(`${pts.join(" ")} Z`, { x: cx, y: cy, color: GOLD });

  center("Star of the Week", H - 175, serifBold, 46);
  center("This certificate is proudly presented to", H - 214, serifItalic, 16, GREY);

  // Full name, shrunk to fit the frame.
  const maxName = W - 190;
  let nameSize = 42;
  const name = safe(serifBold, input.fullName);
  while (nameSize > 20 && serifBold.widthOfTextAtSize(name, nameSize) > maxName) nameSize -= 2;
  center(name, H - 268, serifBold, nameSize, GOLD_DARK);
  const nameW = Math.min(maxName, Math.max(serifBold.widthOfTextAtSize(name, nameSize), 220));
  page.drawLine({ start: { x: (W - nameW) / 2, y: H - 280 }, end: { x: (W + nameW) / 2, y: H - 280 }, thickness: 0.75, color: GOLD });

  center(`Well done, ${input.firstName}!`, H - 312, serifItalic, 22);

  const reasonLines = wrap(serif, 15, input.reason, 560).slice(0, 4);
  let y = H - 344;
  for (const l of reasonLines) {
    center(l, y, serif, 15);
    y -= 21;
  }

  const detail = [input.className, `Week beginning ${weekLong(input.weekStart)}`].filter(Boolean).join("  ·  ");
  center(detail, 118, sans, 11, GREY);

  // Signature and date lines.
  const lineY = 82;
  page.drawLine({ start: { x: 110, y: lineY + 14 }, end: { x: 300, y: lineY + 14 }, thickness: 0.75, color: GREY });
  page.drawText("Headteacher", { x: 110, y: lineY, size: 10, font: sans, color: GREY });
  const dateText = input.approvedAt ? ukLong(input.approvedAt) : "";
  page.drawLine({ start: { x: W - 300, y: lineY + 14 }, end: { x: W - 110, y: lineY + 14 }, thickness: 0.75, color: GREY });
  page.drawText("Date", { x: W - 300, y: lineY, size: 10, font: sans, color: GREY });
  if (dateText) page.drawText(safe(sans, dateText), { x: W - 300, y: lineY + 19, size: 11, font: sans, color: INK });

  center("globalacademy.tarbiyyah.co.uk", 46, sans, 9, GREY);

  pdf.setTitle(`Star of the Week - ${safe(sans, input.fullName)}`);
  pdf.setAuthor("Tarbiyyah Global Academy");
  return await pdf.save();
}
