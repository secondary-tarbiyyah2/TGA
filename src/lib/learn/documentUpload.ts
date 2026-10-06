import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Uploading a PDF or Word (.docx) file for a policy or a document to sign.
 *
 * No new libraries: a .docx is a zip file, so its text is read in the browser
 * with the built-in DecompressionStream (inflate) and DOMParser. A PDF is
 * uploaded as it is. The original file is always kept; for a Word file the
 * extracted text is stored alongside so it can be previewed and turned into a
 * PDF when somebody signs.
 */

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

export type UploadKind = "pdf" | "docx";

/** What `<input type="file" accept>` should allow. */
export const UPLOAD_ACCEPT = `.pdf,.docx,application/pdf,${DOCX_MIME}`;

/** Which kind of file this is, or null when it is neither a PDF nor a .docx. */
export function uploadKind(file: File): UploadKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  return null;
}

/** A message when the file cannot be used, or null when it is fine. */
export function uploadProblem(file: File): string | null {
  if (file.name.toLowerCase().endsWith(".doc")) return "Please save the file as a .docx (Word) or PDF first. Older .doc files cannot be read.";
  if (!uploadKind(file)) return "Please choose a PDF or a Word (.docx) file.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is over 20 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** A storage-safe object name: `<unique prefix>-<cleaned original name>`. */
export function storageObjectName(file: File, prefix?: string): string {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document";
  return `${prefix ?? Date.now()}-${safe}`;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads `word/document.xml` out of a .docx (zip) file. */
async function readDocumentXml(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // End of central directory record: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === "word/document.xml") {
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = bytes.subarray(start, start + compressedSize);
      const raw = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
      if (!raw) throw new Error("unsupported compression");
      return new TextDecoder("utf-8").decode(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("no document.xml");
}

/** The plain text of a Word (.docx) file, one paragraph per line. Throws if it cannot be read. */
export async function extractDocxText(file: File): Promise<string> {
  const xml = await readDocumentXml(await file.arrayBuffer());
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("unreadable XML");
  const lines: string[] = [];
  const paragraphs = doc.getElementsByTagName("w:p");
  for (let i = 0; i < paragraphs.length; i++) {
    let line = "";
    const walk = (node: Element) => {
      for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
        if (c.tagName === "w:t") line += c.textContent ?? "";
        else if (c.tagName === "w:tab") line += "\t";
        else if (c.tagName === "w:br" || c.tagName === "w:cr") line += "\n";
        else walk(c);
      }
    };
    walk(paragraphs[i]);
    lines.push(line.replace(/[ \t]+$/g, ""));
  }
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

/** Opens a file from the private signable-documents bucket in a new tab, via a short-lived link. */
export async function openSignableFile(supabase: SupabaseClient, path: string): Promise<boolean> {
  const win = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("signable-documents").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    win?.close();
    return false;
  }
  if (win) {
    win.opener = null;
    win.location.href = data.signedUrl;
  } else {
    window.location.href = data.signedUrl;
  }
  return true;
}
