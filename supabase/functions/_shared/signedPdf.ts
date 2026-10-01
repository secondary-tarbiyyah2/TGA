// Builds the SIGNED PDF for a document signature: the original document PDF
// (or a clean text PDF made from the document body) with a small footer stamp
// on every page, a final "Signature page", and, for hand-recorded
// signatures, the scanned paper signature page when one was uploaded.
//
// Shared by `document-signed-pdf` (the main entry point) and
// `document-signed-copy` (email). Runs with the service-role client; the
// callers do their own authorisation first.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";

export const SIGNED_BUCKET = "signed-documents";
const EVIDENCE_BUCKET = "signed-paper-copies";
const SIGNATURE_BUCKET = "signature-images";
const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://globalacademy.tarbiyyah.co.uk").replace(/\/$/, "");
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

// deno-lint-ignore no-explicit-any
type Service = any;

const METHOD_LABEL: Record<string, string> = {
  portal: "Signed online",
  paper: "Signed on paper",
  in_person: "Signed in person at school",
  verbal: "Verbal/phone confirmation (witnessed)",
};

const GOLD = rgb(0.69, 0.56, 0.27);
const INK = rgb(0.11, 0.12, 0.13);
const GREY = rgb(0.42, 0.42, 0.42);

type SigRow = {
  id: string;
  signer_id: string;
  document_id: string;
  typed_full_name: string;
  signed_at: string;
  asset_id_signed: string;
  content_hash: string | null;
  document_title_signed: string | null;
  method: string | null;
  recorded_by_name: string | null;
  recorded_at: string | null;
  evidence_path: string | null;
  record_note: string | null;
  signed_pdf_path: string | null;
  signature_image_path?: string | null;
  signature_image_sha256?: string | null;
};

export const shortRef = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();
const ukDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/London" });
const ukDateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "medium", timeZone: "Europe/London" });

/** Standard PDF fonts only cover WinAnsi: swap anything else for "?" so drawing never throws. */
function safe(font: PDFFont, s: string): string {
  let out = "";
  for (const raw of s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[\r\t]/g, " ")) {
    const ch = raw === " " ? " " : raw;
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, size: number, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of safe(font, text).split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const word of para.split(/ +/)) {
      let w = word;
      // Break words longer than a line (hashes, URLs).
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
    lines.push(cur);
  }
  return lines;
}

/** The URL of the original file for the version that was signed, or null. */
function originalUrl(assetIdSigned: string, fileUrl: string | null): string | null {
  // current_asset_id is file_url, optionally suffixed "-<md5 of body>"; text-only docs are "text-<md5>".
  let candidate: string | null = null;
  if (assetIdSigned && !assetIdSigned.startsWith("text-")) {
    const m = assetIdSigned.match(/^(.*)-[0-9a-f]{32}$/);
    candidate = m ? m[1] : assetIdSigned;
  }
  if (!candidate || !/^(https?:\/\/|\/)/.test(candidate)) candidate = fileUrl;
  if (!candidate) return null;
  if (/^https?:\/\//.test(candidate)) return candidate;
  if (candidate.startsWith("/")) return SITE_URL + candidate;
  return null;
}

async function fetchOriginalPdf(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_ORIGINAL_BYTES) return null;
    // %PDF magic: anything else (Word file, HTML error page) is not usable.
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return null;
    return bytes;
  } catch {
    return null;
  }
}

/** A clean text PDF from the document body (for documents with no usable PDF). */
async function textDocumentPdf(title: string, body: string | null, note?: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, size = 10.5, lead = 15;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  for (const l of wrap(bold, 18, title, W - 2 * M)) {
    page.drawText(l, { x: M, y: y - 18, size: 18, font: bold, color: INK });
    y -= 24;
  }
  y -= 10;
  const text = (body || "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim() || note || "The text of this document is held in the school portal.";
  for (const l of wrap(font, size, text, W - 2 * M)) {
    if (y < M + 30) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    if (l) page.drawText(l, { x: M, y: y - size, size, font, color: INK });
    y -= lead;
  }
  return pdf;
}

function sniff(bytes: Uint8Array): "png" | "jpg" | "pdf" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return null;
}

async function addSignaturePage(pdf: PDFDocument, sig: SigRow, title: string, sigImage: PDFImage | null): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const W = 595.28, H = 841.89, M = 56, CW = W - 2 * M;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const method = sig.method || "portal";
  const hand = method !== "portal";

  const text = (t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = o.size ?? 10;
    page.drawText(safe(o.font ?? font, t), { x: o.x ?? M, y: y - size, size, font: o.font ?? font, color: o.color ?? INK });
    y -= size * 1.4;
  };
  const block = (t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 10;
    for (const l of wrap(o.font ?? font, size, t, CW)) {
      if (y < M + 40) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      text(l, { ...o, size });
    }
  };

  text("TARBIYYAH GLOBAL ACADEMY", { size: 9, font: bold, color: GOLD });
  y -= 4;
  text("Signature page", { size: 24, font: bold });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: GOLD });
  y -= 18;

  text("Document", { size: 8, color: GREY });
  block(title, { size: 14, font: bold });
  y -= 2;
  block(`Version signed: ${sig.asset_id_signed}`, { size: 8, color: GREY });
  y -= 14;

  // Signature box. With a drawn signature: the image large above the line,
  // the typed name and date beneath it. Without one: the typed name in script.
  const boxH = sigImage ? 170 : 110;
  const dateLine = safe(font, `${sig.typed_full_name}  ·  ${hand ? ukDate(sig.signed_at) : ukDateTime(sig.signed_at) + " (UK time)"}`);
  page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, borderColor: GOLD, borderWidth: 1, color: rgb(0.99, 0.98, 0.96) });
  page.drawText("SIGNED BY", { x: M + 14, y: y - 20, size: 8, font: bold, color: GREY });
  if (sigImage) {
    const maxW = CW - 28, maxH = 90;
    const k = Math.min(maxW / sigImage.width, maxH / sigImage.height);
    const w = sigImage.width * k, h = sigImage.height * k;
    const lineY = y - 128;
    page.drawImage(sigImage, { x: M + 14 + (maxW - w) / 2, y: lineY + 6 + (maxH - h) / 2, width: w, height: h });
    page.drawLine({ start: { x: M + 14, y: lineY }, end: { x: W - M - 14, y: lineY }, thickness: 0.6, color: GREY });
    page.drawText(safe(bold, sig.typed_full_name), { x: M + 14, y: lineY - 14, size: 11, font: bold, color: INK });
    page.drawText(safe(font, hand ? ukDate(sig.signed_at) : `${ukDateTime(sig.signed_at)} (UK time)`), { x: M + 14, y: lineY - 28, size: 9, font, color: GREY });
  } else {
    let nameSize = 30;
    const typed = safe(script, sig.typed_full_name);
    while (nameSize > 12 && script.widthOfTextAtSize(typed, nameSize) > CW - 28) nameSize -= 2;
    page.drawText(typed, { x: M + 14, y: y - 62, size: nameSize, font: script, color: rgb(0.1, 0.15, 0.4) });
    page.drawLine({ start: { x: M + 14, y: y - 72 }, end: { x: W - M - 14, y: y - 72 }, thickness: 0.6, color: GREY });
    page.drawText(dateLine, { x: M + 14, y: y - 88, size: 9, font, color: GREY });
  }
  y -= boxH + 20;

  const recordedOn = sig.recorded_at ? ukDate(sig.recorded_at) : null;
  const rows: [string, string][] = [
    ["Signed by", sig.typed_full_name],
    [hand ? "Date signed" : "Date and time signed", hand ? ukDate(sig.signed_at) : `${ukDateTime(sig.signed_at)} (UK time)`],
    [
      "Method",
      hand
        ? `${METHOD_LABEL[method] || "Signed by hand"}, recorded by ${sig.recorded_by_name || "school staff"}${recordedOn ? ` on ${recordedOn}` : ""}`
        : "Signed online",
    ],
    ...(sig.record_note ? ([["Note", sig.record_note]] as [string, string][]) : []),
    ["Reference", `${shortRef(sig.id)} (${sig.id})`],
    ...(sigImage ? ([["Signature", "Drawn by hand on screen (image embedded above)"]] as [string, string][]) : []),
  ];
  for (const [k, v] of rows) {
    const lines = wrap(font, 10, v, CW - 130);
    page.drawText(safe(font, k), { x: M, y: y - 10, size: 9, font, color: GREY });
    for (const l of lines) {
      page.drawText(l, { x: M + 130, y: y - 10, size: 10, font: bold, color: INK });
      y -= 14;
    }
    y -= 4;
  }
  y -= 8;
  text("Record hash (SHA-256)", { size: 8, color: GREY });
  block(sig.content_hash || "Not available for signatures made before receipts were introduced.", { size: 7, color: INK });
  if (sigImage && sig.signature_image_sha256) {
    y -= 6;
    text("Signature image hash (SHA-256)", { size: 8, color: GREY });
    block(sig.signature_image_sha256, { size: 7, color: INK });
  }
  y -= 10;
  block(
    hand
      ? "This confirms that the person named above signed this document by hand and that the school recorded it on their behalf. The hash is computed by the school's system from the document title, version, signer, name, date and method."
      : "This confirms that the person named above read this document and signed it online with their full name. The hash is computed by the school's system from the document title, version, signer, typed name and time of signing.",
    { size: 8, color: GREY },
  );
}

async function addEvidencePages(pdf: PDFDocument, scan: Uint8Array, sig: SigRow): Promise<void> {
  const kind = sniff(scan);
  if (!kind) return;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 595.28, H = 841.89, M = 56;
  const page = pdf.addPage([W, H]);
  page.drawText("SCANNED PAPER SIGNATURE PAGE", { x: M, y: H - M - 9, size: 9, font, color: GOLD });
  page.drawText(safe(font, `${sig.typed_full_name}  ·  ref ${shortRef(sig.id)}`), { x: M, y: H - M - 24, size: 8, font, color: GREY });
  const boxW = W - 2 * M;
  const boxH = H - 2 * M - 40;
  const place = (w: number, h: number) => {
    const s = Math.min(boxW / w, boxH / h, 1.5);
    return { width: w * s, height: h * s, x: M + (boxW - w * s) / 2, y: M + 20 + (boxH - h * s) };
  };
  if (kind === "pdf") {
    const src = await PDFDocument.load(scan, { ignoreEncryption: true });
    const [emb] = await pdf.embedPdf(src, [0]);
    page.drawPage(emb, place(emb.width, emb.height));
  } else {
    const img = kind === "png" ? await pdf.embedPng(scan) : await pdf.embedJpg(scan);
    page.drawImage(img, place(img.width, img.height));
  }
}

/** Small copy of the drawn signature on the last page of the original document. */
function stampSignatureOnLastPage(pdf: PDFDocument, img: PDFImage, font: PDFFont) {
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  if (!page || page.getRotation().angle % 360 !== 0) return;
  const { width } = page.getSize();
  const maxW = 110, maxH = 34;
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k, h = img.height * k;
  const x = width - 16 - w;
  page.drawText("Signed:", { x, y: 22 + h + 2, size: 6, font, color: GREY });
  page.drawImage(img, { x, y: 22, width: w, height: h });
}

/** The drawn signature as an embeddable PNG, or null when there is none / it fails its integrity check. */
async function loadSignatureImage(service: Service, pdf: PDFDocument, sig: SigRow): Promise<PDFImage | null> {
  if (!sig.signature_image_path) return null;
  try {
    const { data: blob } = await service.storage.from(SIGNATURE_BUCKET).download(sig.signature_image_path);
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sniff(bytes) !== "png") return null;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    if (sig.signature_image_sha256 && sig.signature_image_sha256 !== hex) {
      console.error("signed-pdf: signature image hash mismatch", sig.id);
      return null;
    }
    if (!sig.signature_image_sha256) {
      // Recorded server-side from the stored bytes when the client did not supply one.
      sig.signature_image_sha256 = hex;
      await service.from("document_signatures").update({ signature_image_sha256: hex }).eq("id", sig.id).is("signature_image_sha256", null);
    }
    return await pdf.embedPng(bytes);
  } catch (e) {
    console.error("signed-pdf: signature image embed failed", (e as Error).message);
    return null;
  }
}

function stampFooters(pdf: PDFDocument, font: PDFFont, sig: SigRow) {
  const text = safe(font, `Signed by ${sig.typed_full_name} on ${ukDate(sig.signed_at)} — ref ${shortRef(sig.id)}`);
  for (const page of pdf.getPages()) {
    if (page.getRotation().angle % 360 !== 0) continue; // rotated pages: skip rather than stamp sideways
    const { width } = page.getSize();
    const size = 7;
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: Math.max(12, (width - w) / 2), y: 10, size, font, color: GREY });
  }
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function buildSignedPdf(service: Service, sig: SigRow): Promise<Uint8Array> {
  const { data: doc } = await service.from("signable_documents").select("title, file_url, body").eq("id", sig.document_id).maybeSingle();
  const title = sig.document_title_signed || doc?.title || "Document";

  let pdf: PDFDocument | null = null;
  const url = originalUrl(sig.asset_id_signed, doc?.file_url ?? null);
  if (url) {
    const bytes = await fetchOriginalPdf(url);
    if (bytes) {
      try {
        pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        pdf = null;
      }
    }
  }
  if (!pdf) {
    pdf = await textDocumentPdf(
      title,
      doc?.body ?? null,
      url ? "The original file could not be reproduced here. Please refer to the document in the school portal." : undefined,
    );
  }

  const sigImage = await loadSignatureImage(service, pdf, sig);
  if (sigImage) stampSignatureOnLastPage(pdf, sigImage, await pdf.embedFont(StandardFonts.Helvetica));
  await addSignaturePage(pdf, sig, title, sigImage);

  if (sig.method && sig.method !== "portal" && sig.evidence_path) {
    try {
      const { data: blob } = await service.storage.from(EVIDENCE_BUCKET).download(sig.evidence_path);
      if (blob) await addEvidencePages(pdf, new Uint8Array(await blob.arrayBuffer()), sig);
    } catch (e) {
      console.error("signed-pdf: evidence embed failed", (e as Error).message);
    }
  }

  const footerFont = await pdf.embedFont(StandardFonts.Helvetica);
  stampFooters(pdf, footerFont, sig);
  pdf.setTitle(`${title} (signed by ${sig.typed_full_name})`);
  pdf.setProducer("Tarbiyyah Global Academy");
  return await pdf.save();
}

export async function loadSignature(service: Service, signatureId: string): Promise<SigRow | null> {
  const { data } = await service
    .from("document_signatures")
    .select(
      "id, signer_id, document_id, typed_full_name, signed_at, asset_id_signed, content_hash, document_title_signed, method, recorded_by_name, recorded_at, evidence_path, record_note, signed_pdf_path, signature_image_path, signature_image_sha256",
    )
    .eq("id", signatureId)
    .maybeSingle();
  return (data as SigRow | null) ?? null;
}

/** Makes sure the signed PDF exists in storage (idempotent). `bytes` is set only when it was just generated. */
export async function ensureSignedPdf(
  service: Service,
  sig: SigRow,
  opts: { force?: boolean } = {},
): Promise<{ path: string; bytes: Uint8Array | null; generated: boolean }> {
  const path = `${sig.signer_id}/${sig.id}.pdf`;
  if (!opts.force && sig.signed_pdf_path === path) {
    const { data } = await service.storage.from(SIGNED_BUCKET).list(sig.signer_id, { search: `${sig.id}.pdf`, limit: 1 });
    if (Array.isArray(data) && data.some((o: { name: string }) => o.name === `${sig.id}.pdf`)) return { path, bytes: null, generated: false };
  }
  const bytes = await buildSignedPdf(service, sig);
  const up = await service.storage.from(SIGNED_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);
  await service.from("document_signatures").update({ signed_pdf_path: path, signed_pdf_at: new Date().toISOString() }).eq("id", sig.id);
  return { path, bytes, generated: true };
}
