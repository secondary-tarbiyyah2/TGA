import { getSupabaseClient } from "@/lib/supabase/client";

export const DECK_BUCKET = "lesson-decks";

export type CurriculumLesson = {
  id: string;
  subject_slug: string;
  subject: string;
  year: string;
  board: string | null;
  unit: string | null;
  lesson_no: number;
  title: string;
  duration: number | null;
  objectives: string[];
  deck_path: string | null;
  pdf_path: string | null;
  version: number;
  edited_at: string | null;
  plan_pdf_path?: string | null;
  plan_docx_path?: string | null;
};

export type CurriculumVersion = {
  id: string;
  version: number;
  deck_path: string | null;
  pdf_path: string | null;
  note: string | null;
  created_at: string;
};

export const LESSON_COLUMNS = "id, subject_slug, subject, year, board, unit, lesson_no, title, duration, objectives, deck_path, pdf_path, version, edited_at, plan_pdf_path, plan_docx_path";

export const YEARS = ["reception", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11"];

export function yearLabel(y: string): string {
  return y === "reception" ? "Reception" : `Year ${y.slice(1)}`;
}

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Download a stored deck as the signed-in user. */
export async function downloadDeck(path: string): Promise<Blob | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(DECK_BUCKET).download(path);
  return error ? null : data;
}

/** "Unit 3: Fractions" -> "U3"; otherwise "". */
export function unitCode(unit: string | null | undefined): string {
  const m = String(unit || "").match(/\bunit\s*(\d+)/i);
  return m ? `U${m[1]}` : "";
}

/** "Year 5" -> "Y05", "Reception" -> "R", so files sort in year order. */
export function yearCode(y: string): string {
  return y === "reception" ? "R" : `Y${y.slice(1).padStart(2, "0")}`;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();

export type LessonFileKind = "slides-pdf" | "slides-pptx" | "plan-pdf" | "plan-docx";

/**
 * Download name that sorts and reads well in a folder:
 *   "Y05 Mathematics U1 L01 - Reading and writing numbers (slides).pdf"
 */
export function fileNameFor(l: Pick<CurriculumLesson, "subject" | "year" | "lesson_no" | "title"> & { unit?: string | null }, kind: LessonFileKind | "pdf" | "pptx"): string {
  const k: LessonFileKind = kind === "pdf" ? "slides-pdf" : kind === "pptx" ? "slides-pptx" : kind;
  const label = k.startsWith("plan") ? "lesson plan" : "slides";
  const ext = k.endsWith("pdf") ? "pdf" : k.endsWith("pptx") ? "pptx" : "docx";
  const code = [yearCode(l.year), l.subject, unitCode(l.unit), `L${String(l.lesson_no).padStart(2, "0")}`].filter(Boolean).join(" ");
  return `${safeName(`${code} - ${l.title}`).slice(0, 110)} (${label}).${ext}`;
}

/** Folder name for a whole unit: "Y05 Mathematics - Unit 1 Place value to 1,000,000". */
export function unitFolderName(year: string, subject: string, unit: string | null): string {
  return safeName(`${yearCode(year)} ${subject} - ${unit || "Lessons"}`).slice(0, 100);
}

export function pathFor(l: CurriculumLesson, kind: LessonFileKind): string | null {
  return kind === "slides-pdf" ? l.pdf_path : kind === "slides-pptx" ? l.deck_path : kind === "plan-pdf" ? l.plan_pdf_path || null : l.plan_docx_path || null;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Upload a replacement deck (and optional PDF), then record it as a new version. */
export async function replaceDeck(lesson: CurriculumLesson, pptx: File, pdf: File | null, note: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Not connected.";
  if (pptx.size > 50 * 1024 * 1024 || (pdf && pdf.size > 50 * 1024 * 1024)) return "Files must be under 50 MB.";
  const stamp = Date.now();
  const safe = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
  const dir = `${lesson.subject_slug}/${lesson.year}/${lesson.lesson_no}`;
  const deckPath = `${dir}/${stamp}-${safe(pptx.name)}`;
  const up1 = await supabase.storage.from(DECK_BUCKET).upload(deckPath, pptx, { contentType: pptx.type || PPTX_MIME });
  if (up1.error) return "Could not upload the PowerPoint. Check it is a .pptx file.";
  let pdfPath: string | null = null;
  if (pdf) {
    pdfPath = `${dir}/${stamp}-${safe(pdf.name)}`;
    const up2 = await supabase.storage.from(DECK_BUCKET).upload(pdfPath, pdf, { contentType: "application/pdf" });
    if (up2.error) return "Could not upload the PDF.";
  }
  const { error } = await supabase.rpc("curriculum_replace_deck", { p_lesson: lesson.id, p_deck_path: deckPath, p_pdf_path: pdfPath, p_note: note });
  return error ? "Could not save the new version." : null;
}
