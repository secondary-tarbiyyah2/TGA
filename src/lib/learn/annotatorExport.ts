import { loadPdfLib, type PdfLibDocument } from "@/lib/learn/pdfLibs";
import { drawShapes, type Pages, type Shape } from "@/lib/learn/annotatorShapes";

// Producing the marked copy. Strokes are rasterised to a transparent PNG per page
// (so any script, including Arabic, renders exactly as the teacher saw it) and
// laid over the ORIGINAL page with pdf-lib. The student's file is never changed.

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser couldn't create the marked image."))), "image/png");
  });
}

async function overlayPng(shapes: Shape[], width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser couldn't create a drawing surface.");
  drawShapes(ctx, shapes, width, height);
  return new Uint8Array(await (await canvasToPng(canvas)).arrayBuffer());
}

/** Original PDF bytes + strokes -> a new PDF with the strokes drawn on top. */
export async function flattenPdf(original: Uint8Array, pages: Pages): Promise<Uint8Array> {
  const lib = await loadPdfLib();
  let doc: PdfLibDocument;
  try {
    doc = await lib.PDFDocument.load(original);
  } catch {
    throw new Error("This PDF can't be marked (it may be encrypted or damaged).");
  }
  const pdfPages = doc.getPages();
  for (const [key, shapes] of Object.entries(pages)) {
    const page = pdfPages[Number(key) - 1];
    if (!page || shapes.length === 0) continue;
    const box = page.getCropBox();
    const rot = ((Math.round(page.getRotation().angle) % 360) + 360) % 360;
    const sideways = rot === 90 || rot === 270;
    const dispW = sideways ? box.height : box.width; // size as displayed (after /Rotate), in points
    const dispH = sideways ? box.width : box.height;
    const scale = Math.min(2, 3000 / Math.max(dispW, dispH));
    const png = await overlayPng(shapes, Math.max(1, Math.round(dispW * scale)), Math.max(1, Math.round(dispH * scale)));
    const image = await doc.embedPng(png);
    // The overlay is in displayed orientation; place it so it lands on the displayed page.
    const place =
      rot === 90
        ? { x: box.x + box.width, y: box.y }
        : rot === 180
          ? { x: box.x + box.width, y: box.y + box.height }
          : rot === 270
            ? { x: box.x, y: box.y + box.height }
            : { x: box.x, y: box.y };
    page.drawImage(image, { x: place.x, y: place.y, width: dispW, height: dispH, rotate: lib.degrees(rot) });
  }
  return doc.save();
}

const MAX_IMAGE_EDGE = 2600;

/** An image + strokes -> a PNG at (at most) 2600px on the long edge. */
export async function flattenImage(img: HTMLImageElement, shapes: Shape[]): Promise<Blob> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser couldn't create a drawing surface.");
  ctx.drawImage(img, 0, 0, w, h);
  drawShapes(ctx, shapes, w, h);
  return canvasToPng(canvas);
}

/** A marked PNG -> a one-page PDF. */
export async function imageToPdf(png: Blob): Promise<Uint8Array> {
  const lib = await loadPdfLib();
  const doc = await lib.PDFDocument.create();
  const image = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
  const k = 842 / Math.max(image.width, image.height);
  const page = doc.addPage([image.width * k, image.height * k]);
  page.drawImage(image, { x: 0, y: 0, width: image.width * k, height: image.height * k });
  return doc.save();
}
