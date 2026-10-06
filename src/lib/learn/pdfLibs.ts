// pdf.js (renders PDF pages) and pdf-lib (writes the marked PDF) are NOT npm
// dependencies: they are loaded on demand from cdnjs at pinned versions, and only
// when a teacher opens the annotator. The learn subdomain's CSP allows
// https://cdnjs.cloudflare.com for script-src and connect-src (see
// deploy/learn-subdomain.htaccess). If a script cannot load (offline, blocked,
// CSP), the loaders reject with a message the annotator shows to the teacher.

export const PDFJS_VERSION = "3.11.174";
export const PDFLIB_VERSION = "1.17.1";
const CDN = "https://cdnjs.cloudflare.com/ajax/libs";
export const PDFJS_URL = `${CDN}/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
export const PDFJS_WORKER_URL = `${CDN}/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
export const PDFLIB_URL = `${CDN}/pdf-lib/${PDFLIB_VERSION}/pdf-lib.min.js`;

export interface PdfViewport {
  width: number;
  height: number;
}
export interface PdfRenderTask {
  promise: Promise<void>;
  cancel(): void;
}
export interface PdfPage {
  getViewport(params: { scale: number }): PdfViewport;
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): PdfRenderTask;
}
export interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
export interface PdfJsLib {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; disableFontFace?: boolean }): { promise: Promise<PdfDocument> };
  GlobalWorkerOptions: { workerSrc: string };
}

export interface PdfLibImage {
  width: number;
  height: number;
}
export interface PdfLibPage {
  getRotation(): { angle: number };
  getCropBox(): { x: number; y: number; width: number; height: number };
  drawImage(image: PdfLibImage, options: { x: number; y: number; width: number; height: number; rotate?: unknown }): void;
}
export interface PdfLibDocument {
  getPages(): PdfLibPage[];
  embedPng(data: Uint8Array): Promise<PdfLibImage>;
  addPage(size: [number, number]): PdfLibPage;
  save(): Promise<Uint8Array>;
}
export interface PdfLibLib {
  PDFDocument: {
    load(data: Uint8Array): Promise<PdfLibDocument>;
    create(): Promise<PdfLibDocument>;
  };
  degrees(angle: number): unknown;
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
    PDFLib?: PdfLibLib;
  }
}

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.crossOrigin = "anonymous";
    el.onload = () => resolve();
    el.onerror = () => {
      el.remove();
      scriptPromises.delete(src);
      reject(new Error("blocked-or-offline"));
    };
    document.head.appendChild(el);
  });
  scriptPromises.set(src, p);
  return p;
}

const LOAD_HELP =
  "The PDF tools are loaded from cdnjs.cloudflare.com and couldn't be reached. Check your connection (or that this site is allowed to load it) and try again.";

let pdfJsPromise: Promise<PdfJsLib> | null = null;

/** Loads pdf.js and points it at a worker (a blob: copy of the CDN worker, falling back to the CDN URL itself). */
export function loadPdfJs(): Promise<PdfJsLib> {
  if (pdfJsPromise) return pdfJsPromise;
  const p = (async () => {
    try {
      await loadScript(PDFJS_URL);
    } catch {
      throw new Error(LOAD_HELP);
    }
    const lib = window.pdfjsLib;
    if (!lib) throw new Error("The PDF viewer loaded but isn't usable in this browser.");
    try {
      const res = await fetch(PDFJS_WORKER_URL);
      if (!res.ok) throw new Error("worker");
      const blob = new Blob([await res.text()], { type: "text/javascript" });
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    } catch {
      // pdf.js falls back to running without a separate worker thread.
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
    return lib;
  })();
  pdfJsPromise = p;
  p.catch(() => {
    if (pdfJsPromise === p) pdfJsPromise = null;
  });
  return p;
}

export async function loadPdfLib(): Promise<PdfLibLib> {
  try {
    await loadScript(PDFLIB_URL);
  } catch {
    throw new Error(LOAD_HELP);
  }
  const lib = window.PDFLib;
  if (!lib) throw new Error("The PDF writer loaded but isn't usable in this browser.");
  return lib;
}
