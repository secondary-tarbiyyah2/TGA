// Term resources (migration 0201): every resource the lessons name, per term, with the printable PDFs
// TGA makes (worksheets, quizzes, tests and mocks with a separate mark scheme, knowledge organisers,
// writing frames, printable grids, practical guides). Written by the "Build term resources" workflow
// (scripts/resources); staff read only. Pupils get a resource when a teacher shares it to a class.
import { getSupabaseClient } from "@/lib/supabase/client";
import { downloadDeck, saveBlob, yearCode } from "@/lib/learn/curriculum";

export type ResourceLessonRef = { n: number; title: string; term: string };
export type CurriculumResource = {
  id: string;
  terms: string[];
  title: string;
  type: string;
  subject: string;
  subject_slug: string;
  year: string;
  units: string[];
  lesson_nos: number[];
  lessons: ResourceLessonRef[];
  source: string;
  status: string;
  wording: string | null;
  pdf_path: string | null;
  mark_scheme_path: string | null;
  docx_path: string | null;
};

export const RESOURCE_COLUMNS = "id, terms, title, type, subject, subject_slug, year, units, lesson_nos, lessons, source, status, wording, pdf_path, mark_scheme_path, docx_path";

export const TERMS = [
  { id: "spring-1", label: "Spring 1", dates: "11 Jan to 8 Feb" },
  { id: "spring-2", label: "Spring 2", dates: "15 Mar to 23 Apr" },
  { id: "summer-1", label: "Summer 1", dates: "26 Apr to 11 Jun" },
  { id: "summer-2", label: "Summer 2", dates: "14 Jun to 9 Jul" },
] as const;

export const SOURCE_LABEL: Record<string, string> = {
  generated: "Made by TGA",
  builder: "Slides or pupil PDF",
  school: "School file",
  external: "External",
  household: "Pupil's own or household",
};

export const STATUS_LABEL: Record<string, string> = {
  made: "Ready to download",
  "to make": "Still to make",
  ready: "Nothing to make",
  "in school files": "In the school's files",
};

/** Types in the order staff think of them. */
export const TYPE_ORDER = [
  "worksheet",
  "quiz",
  "test paper",
  "mock paper",
  "mark scheme",
  "revision set",
  "knowledge organiser",
  "writing frame",
  "model text",
  "printable graph/grid",
  "practical guide",
  "school file",
  "textbook",
  "external tool",
  "slides",
  "equipment",
];

export const typeLabel = (t: string) => (t === "printable graph/grid" ? "Printable grid or map" : t === "model text" ? "Reading text" : t.charAt(0).toUpperCase() + t.slice(1));

/** Every resource for one term (the register), in subject and year order. */
export async function loadTermResources(term: string): Promise<CurriculumResource[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const out: CurriculumResource[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("curriculum_resources").select(RESOURCE_COLUMNS).contains("terms", [term]).order("subject_slug").order("year").order("id").range(from, from + 999);
    if (error) return null;
    out.push(...((data as unknown as CurriculumResource[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The resources one lesson names (made ones first). */
export async function loadLessonResources(subjectSlug: string, year: string, lessonNo: number): Promise<CurriculumResource[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("curriculum_resources").select(RESOURCE_COLUMNS).eq("subject_slug", subjectSlug).eq("year", year).contains("lesson_nos", [lessonNo]);
  if (error || !data) return [];
  const rows = data as unknown as CurriculumResource[];
  const rank = (r: CurriculumResource) => (r.pdf_path ? 0 : r.status === "to make" ? 1 : r.source === "school" ? 2 : 3);
  return rows.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

export type ResourceFile = "pdf" | "mark-scheme" | "docx";
export const fileOf = (r: CurriculumResource, f: ResourceFile) => (f === "pdf" ? r.pdf_path : f === "mark-scheme" ? r.mark_scheme_path : r.docx_path);
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
export function resourceFileName(r: CurriculumResource, f: ResourceFile): string {
  const ext = f === "docx" ? "docx" : "pdf";
  return `${safe(`${yearCode(r.year)} ${r.subject} - ${r.title}`).slice(0, 110)}${f === "mark-scheme" ? " (mark scheme)" : ""}.${ext}`;
}
export async function resourceBlob(r: CurriculumResource, f: ResourceFile): Promise<Blob | null> {
  const p = fileOf(r, f);
  if (!p) return null;
  const blob = await downloadDeck(p);
  if (!blob) return null;
  return new Blob([blob], { type: f === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf" });
}
export async function downloadResource(r: CurriculumResource, f: ResourceFile): Promise<boolean> {
  const b = await resourceBlob(r, f);
  if (!b) return false;
  saveBlob(b, resourceFileName(r, f));
  return true;
}
