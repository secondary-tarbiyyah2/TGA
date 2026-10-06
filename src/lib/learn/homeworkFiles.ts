import { getSupabaseClient } from "@/lib/supabase/client";

// Files on homework: what a student may hand in, what a teacher may attach,
// and how they are uploaded and opened. Buckets (migration 0077/0078):
//   homework-submissions  '<homework_id>/<child_id>/<file>'  student/parent work
//   homework-attachments  '<homework_id>/<file>'             files the teacher attaches
//   homework-marked       '<homework_id>/<child_id>/<file>'  flattened marked copies
// All three are private. Files are opened in the app (fetched as a blob and shown
// from a same-origin blob: URL), never by handing out a raw Supabase URL.

export type HomeworkBucket = "homework-submissions" | "homework-attachments" | "homework-marked";

export type SubmissionType = "text" | "file" | "link";
export type FileCategory = "pdf" | "image" | "document" | "audio" | "video";

export const ALL_SUBMISSION_TYPES: SubmissionType[] = ["text", "file", "link"];
export const ALL_FILE_CATEGORIES: FileCategory[] = ["pdf", "image", "document", "audio", "video"];

export const SUBMISSION_TYPE_LABEL: Record<SubmissionType, string> = {
  text: "Typed answer",
  file: "File upload",
  link: "Link",
};

export const FILE_CATEGORY_LABEL: Record<FileCategory, string> = {
  pdf: "PDF",
  image: "Photos & images",
  document: "Word / Pages / Docs",
  audio: "Audio (e.g. recitation)",
  video: "Video",
};

/** Per-file cap; matches the 50MB bucket limit (a lower project-wide Supabase limit still applies). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Files per submission (the database allows at most 10). */
export const MAX_FILES = 10;

export type HomeworkFileRef = { path: string; name: string; mime: string; size: number };

type ExtInfo = { cats: FileCategory[]; mime: string };

const EXT: Record<string, ExtInfo> = {
  pdf: { cats: ["pdf"], mime: "application/pdf" },
  png: { cats: ["image"], mime: "image/png" },
  jpg: { cats: ["image"], mime: "image/jpeg" },
  jpeg: { cats: ["image"], mime: "image/jpeg" },
  webp: { cats: ["image"], mime: "image/webp" },
  gif: { cats: ["image"], mime: "image/gif" },
  heic: { cats: ["image"], mime: "image/heic" },
  heif: { cats: ["image"], mime: "image/heif" },
  doc: { cats: ["document"], mime: "application/msword" },
  docx: { cats: ["document"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  odt: { cats: ["document"], mime: "application/vnd.oasis.opendocument.text" },
  rtf: { cats: ["document"], mime: "application/rtf" },
  txt: { cats: ["document"], mime: "text/plain" },
  pages: { cats: ["document"], mime: "application/vnd.apple.pages" },
  ppt: { cats: ["document"], mime: "application/vnd.ms-powerpoint" },
  pptx: { cats: ["document"], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  xls: { cats: ["document"], mime: "application/vnd.ms-excel" },
  xlsx: { cats: ["document"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  csv: { cats: ["document"], mime: "text/csv" },
  mp3: { cats: ["audio"], mime: "audio/mpeg" },
  m4a: { cats: ["audio"], mime: "audio/mp4" },
  aac: { cats: ["audio"], mime: "audio/aac" },
  wav: { cats: ["audio"], mime: "audio/wav" },
  ogg: { cats: ["audio"], mime: "audio/ogg" },
  oga: { cats: ["audio"], mime: "audio/ogg" },
  opus: { cats: ["audio"], mime: "audio/opus" },
  webm: { cats: ["audio", "video"], mime: "video/webm" },
  mp4: { cats: ["video"], mime: "video/mp4" },
  mov: { cats: ["video"], mime: "video/quicktime" },
  m4v: { cats: ["video"], mime: "video/x-m4v" },
  "3gp": { cats: ["video"], mime: "video/3gpp" },
};

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Same extension table as homework_file_categories() in migration 0077. */
export function fileCategories(name: string): FileCategory[] {
  return EXT[extOf(name)]?.cats ?? [];
}

/** The content type to store a file under (always one the buckets accept). */
export function mimeForName(name: string, browserType?: string): string {
  const base = (browserType || "").split(";")[0].trim().toLowerCase();
  const info = EXT[extOf(name)];
  if (extOf(name) === "webm") return base === "audio/webm" ? "audio/webm" : "video/webm";
  return info?.mime ?? (base || "application/octet-stream");
}

export function categoryOfMime(mime: string): "pdf" | "image" | "audio" | "video" | "other" {
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "other";
}

/** File picker `accept` for the allowed categories (extensions work on every platform). */
export function acceptFor(allowed: FileCategory[]): string {
  const parts: string[] = [];
  for (const [ext, info] of Object.entries(EXT)) {
    if (info.cats.some((c) => allowed.includes(c))) parts.push(`.${ext}`);
  }
  if (allowed.includes("image")) parts.push("image/*");
  if (allowed.includes("audio")) parts.push("audio/*");
  if (allowed.includes("video")) parts.push("video/*");
  return parts.join(",");
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** null when fine, otherwise a sentence for the user. */
export function validateFile(file: File, allowed: FileCategory[]): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} per file.`;
  const cats = fileCategories(file.name);
  if (cats.length === 0) return `"${file.name}" is a type of file that can't be uploaded here.`;
  if (!cats.some((c) => allowed.includes(c))) {
    return `"${file.name}" isn't an allowed type for this homework (allowed: ${allowed.map((c) => FILE_CATEGORY_LABEL[c]).join(", ") || "none"}).`;
  }
  return null;
}

/** Keeps object names ASCII-safe and short; the original name is kept separately for display. */
export function safeObjectName(name: string): string {
  const ext = extOf(name);
  const stem = name.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return ext ? `${stem}.${ext}` : stem;
}

/** Reads a jsonb list of file refs defensively. */
export function parseFileRefs(value: unknown): HomeworkFileRef[] {
  if (!Array.isArray(value)) return [];
  const out: HomeworkFileRef[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    if (typeof o.path !== "string" || !o.path) continue;
    const name = typeof o.name === "string" && o.name ? o.name : displayNameFromPath(o.path);
    out.push({
      path: o.path,
      name,
      mime: typeof o.mime === "string" && o.mime ? o.mime : mimeForName(name),
      size: typeof o.size === "number" ? o.size : 0,
    });
  }
  return out;
}

/** '<hw>/<child>/1699999999999-3-photo.jpg' -> 'photo.jpg' (also handles older '<ts>-<name>' objects). */
export function displayNameFromPath(path: string): string {
  const last = path.split("/").pop() || path;
  return last.replace(/^\d{10,}(-\d+)?-/, "");
}

/** A submission's files, including older rows that only have file_path. */
export function submissionFiles(sub: { files?: unknown; file_path?: string | null }): HomeworkFileRef[] {
  const list = parseFileRefs(sub.files);
  if (list.length > 0) return list;
  if (sub.file_path) {
    const name = displayNameFromPath(sub.file_path);
    return [{ path: sub.file_path, name, mime: mimeForName(name), size: 0 }];
  }
  return [];
}

export type UploadResult = { ok: true } | { ok: false; error: string };

function describeUploadError(status: number, body: string): string {
  let msg = "";
  try {
    const j = JSON.parse(body) as { message?: string; error?: string };
    msg = j.message || j.error || "";
  } catch {
    msg = "";
  }
  if (status === 413 || /too large|exceeded the maximum/i.test(msg)) return "That file is too large for the server.";
  if (/mime/i.test(msg)) return "That type of file isn't accepted.";
  if (status === 401 || status === 403 || /row-level security|not authorized|unauthorized/i.test(msg)) {
    return "You don't have permission to upload this file (the homework may be closed).";
  }
  return msg || `Upload failed (${status}).`;
}

/**
 * Uploads one file with progress (supabase-js has no progress events, so this is
 * a direct request to the storage endpoint, authenticated as the signed-in user).
 */
export async function uploadWithProgress(
  bucket: HomeworkBucket,
  path: string,
  file: Blob,
  contentType: string,
  fileName: string,
  onProgress: (fraction: number) => void
): Promise<UploadResult> {
  const supabase = getSupabaseClient();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabase || !base || !anon) return { ok: false, error: "Not connected." };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "You are signed out. Please sign in again." };

  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new File([file], fileName, { type: contentType }));

  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: describeUploadError(xhr.status, xhr.responseText) });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "The upload was interrupted. Check your connection and try again." });
    xhr.ontimeout = () => resolve({ ok: false, error: "The upload timed out. Check your connection and try again." });
    xhr.send(form);
  });
}

/** Fetches a private object as a Blob of the given type (RLS applies exactly as for a direct read). */
export async function downloadFileBlob(bucket: HomeworkBucket, path: string, mime: string): Promise<Blob | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Blob([data], { type: mime || data.type });
}

export async function removeObjects(bucket: HomeworkBucket, paths: string[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(bucket).remove(paths);
}
