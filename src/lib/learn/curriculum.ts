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
};

export type CurriculumVersion = {
  id: string;
  version: number;
  deck_path: string | null;
  pdf_path: string | null;
  note: string | null;
  created_at: string;
};

export const LESSON_COLUMNS = "id, subject_slug, subject, year, board, unit, lesson_no, title, duration, objectives, deck_path, pdf_path, version, edited_at";

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

export function fileNameFor(l: Pick<CurriculumLesson, "subject" | "year" | "lesson_no" | "title">, ext: string): string {
  const base = `${l.subject} ${yearLabel(l.year)} L${l.lesson_no} ${l.title}`.replace(/[^\w .\-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 110);
  return `${base}.${ext}`;
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
