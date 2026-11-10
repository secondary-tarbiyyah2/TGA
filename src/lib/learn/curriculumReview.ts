import { getSupabaseClient } from "@/lib/supabase/client";
import type { WorkflowStatus } from "@/components/learn/kit";

/**
 * The lesson review workflow (migration 0192; docs/portal-redesign.md):
 * draft -> submitted -> in_review -> changes_needed | approved -> published.
 * One row per lesson ("y7/12") or spec unit in curriculum_signoffs; every
 * step in curriculum_review_events. Editing an approved lesson reopens it.
 */
export type ReviewRow = {
  subject_slug: string;
  scope: "spec" | "lesson";
  ref: string;
  status: WorkflowStatus;
  note: string | null;
  checked_name: string | null;
  checked_at: string;
  submitted_name: string | null;
  submitted_at: string | null;
  approved_name: string | null;
  approved_at: string | null;
  approved_version: number | null;
  changed_since_approval: boolean;
};

export type ReviewEvent = {
  id: string;
  from_status: string | null;
  to_status: WorkflowStatus;
  note: string | null;
  lesson_version: number | null;
  actor_name: string | null;
  created_at: string;
};

const ROW_SELECT = "subject_slug, scope, ref, status, note, checked_name, checked_at, submitted_name, submitted_at, approved_name, approved_at, approved_version, changed_since_approval";

export const reviewKey = (slug: string, scope: string, ref: string) => `${slug}|${scope}|${ref}`;
export const lessonRef = (year: string, lessonNo: number) => `${year}/${lessonNo}`;

/** Every review row (a few thousand at most), keyed by reviewKey. Works before 0192 too (older columns only). */
export async function loadReviews(): Promise<Record<string, ReviewRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  let { data, error } = await supabase.from("curriculum_signoffs").select(ROW_SELECT);
  if (error) ({ data, error } = await supabase.from("curriculum_signoffs").select("subject_slug, scope, ref, status, note, checked_name, checked_at"));
  const out: Record<string, ReviewRow> = {};
  for (const r of (data as Partial<ReviewRow>[] | null) || []) {
    const row = { submitted_name: null, submitted_at: null, approved_name: null, approved_at: null, approved_version: null, changed_since_approval: false, ...r } as ReviewRow;
    out[reviewKey(row.subject_slug, row.scope, row.ref)] = row;
  }
  return out;
}

export async function loadReviewHistory(slug: string, scope: "spec" | "lesson", ref: string): Promise<ReviewEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("curriculum_review_events")
    .select("id, from_status, to_status, note, lesson_version, actor_name, created_at")
    .eq("subject_slug", slug)
    .eq("scope", scope)
    .eq("ref", ref)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as ReviewEvent[] | null) || [];
}

/** Take one step. Returns an error sentence, or null when it worked. */
export async function reviewStep(slug: string, scope: "spec" | "lesson", ref: string, to: WorkflowStatus, note?: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "The portal isn't connected.";
  const { error } = await supabase.rpc("curriculum_review_transition", { p_subject: slug, p_scope: scope, p_ref: ref, p_to: to, p_note: note || null });
  if (!error) return null;
  if (/needs changing|Say what/i.test(error.message)) return "Say what needs changing.";
  if (error.code === "42501") return "That step isn't open to you, or the lesson has moved on since you opened it. Refresh and try again.";
  return error.message;
}

/** The steps a person can take from a status: reviewers (head teacher, admin) get the review steps. */
export function nextSteps(status: WorkflowStatus | undefined, reviewer: boolean): { to: WorkflowStatus; label: string; primary?: boolean; needsNote?: boolean }[] {
  const s = status || "draft";
  const out: { to: WorkflowStatus; label: string; primary?: boolean; needsNote?: boolean }[] = [];
  if (s === "draft" || s === "changes_needed") out.push({ to: "submitted", label: "Submit for review", primary: true });
  if (s === "submitted" || s === "changes_needed") out.push({ to: "draft", label: "Withdraw to draft" });
  if (reviewer) {
    if (s === "submitted" || s === "changes_needed") out.push({ to: "in_review", label: "Start review", primary: s === "submitted" });
    if (s === "submitted" || s === "in_review") out.push({ to: "approved", label: "Approve", primary: s === "in_review" });
    if (s === "submitted" || s === "in_review" || s === "approved" || s === "published") out.push({ to: "changes_needed", label: "Request changes", needsNote: true });
    if (s === "approved") out.push({ to: "published", label: "Publish to classes", primary: true });
    if (s === "approved" || s === "published") out.push({ to: "submitted", label: "Reopen review" });
  }
  // One primary at most.
  let seen = false;
  return out.map((x) => {
    if (x.primary && !seen) {
      seen = true;
      return x;
    }
    return { ...x, primary: false };
  });
}
