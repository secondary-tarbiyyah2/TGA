import { ALL_FILE_CATEGORIES, ALL_SUBMISSION_TYPES, parseFileRefs, type FileCategory, type HomeworkFileRef, type SubmissionType } from "@/lib/learn/homeworkFiles";

// Shared homework shapes and helpers (columns from migrations 0010, 0077).

export type Homework = {
  id: string;
  class_id: string;
  teacher_id?: string;
  title: string;
  instructions: string | null;
  due_at: string;
  max_points?: number | null;
  allowed_submission_types?: SubmissionType[] | null;
  allowed_file_types?: FileCategory[] | null;
  late_policy?: "allow" | "block" | null;
  attachments?: unknown;
  edited_at?: string | null;
  archived_at?: string | null;
  classes?: { name: string } | null;
};

export const HOMEWORK_COLUMNS =
  "id, class_id, teacher_id, title, instructions, due_at, max_points, allowed_submission_types, allowed_file_types, late_policy, attachments, edited_at, archived_at, classes(name)";

export function submissionTypesOf(hw: Pick<Homework, "allowed_submission_types">): SubmissionType[] {
  const t = hw.allowed_submission_types;
  return t && t.length > 0 ? t : ALL_SUBMISSION_TYPES;
}

export function fileTypesOf(hw: Pick<Homework, "allowed_file_types">): FileCategory[] {
  return hw.allowed_file_types ?? ALL_FILE_CATEGORIES;
}

export function attachmentsOf(hw: Pick<Homework, "attachments">): HomeworkFileRef[] {
  return parseFileRefs(hw.attachments);
}

/** datetime-local wants local "YYYY-MM-DDTHH:mm", not a UTC ISO string. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatEdited(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** One-line summary of what a student may hand in, e.g. "Typed answer, file upload (PDF, Photos & images)". */
export function describeAllowed(hw: Homework, labels: { types: Record<SubmissionType, string>; files: Record<FileCategory, string> }): string {
  const types = submissionTypesOf(hw);
  // "Typed answer, file upload or link": sentence case after the first item.
  const parts = types.map((t, i) => (i === 0 ? labels.types[t] : labels.types[t].charAt(0).toLowerCase() + labels.types[t].slice(1)));
  let out = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}` : parts.join("");
  if (types.includes("file")) {
    const cats = fileTypesOf(hw);
    if (cats.length > 0 && cats.length < ALL_FILE_CATEGORIES.length) out += ` (${cats.map((c) => labels.files[c]).join(", ")})`;
  }
  return out;
}

/** "7", "7/10", "7.5 out of 10" -> 7 / 7 / 7.5; "B+" -> null. */
export function parseMarkNumber(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*\d+(?:\.\d+)?|out of\s*\d+(?:\.\d+)?|%)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null;
}
