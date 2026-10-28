// SEND support plans (migration 0169): shared vocabulary, types and loaders.
// RLS decides who reads what: SENCo, Headteacher and admin manage every plan;
// a pupil's teachers read active plans for pupils they teach; parents read
// their own child's plan once it is active; pupils see nothing.

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission, useLearnSession } from "@/lib/learn/session";

export type PlanStatus = "draft" | "active" | "closed";
export type SupportLevel = "monitoring" | "sen_support" | "ehcp";
export type PrimaryNeed = "cognition_learning" | "communication_interaction" | "semh" | "sensory_physical";
export type TargetStatus = "not_started" | "working_towards" | "achieved" | "partly_achieved" | "not_achieved";

export type SupportPlan = {
  id: string;
  child_id: string;
  status: PlanStatus;
  support_level: SupportLevel;
  primary_need: PrimaryNeed | null;
  needs_summary: string | null;
  needs_source: string | null;
  strengths: string | null;
  pupil_views: string | null;
  adjustments: string[];
  adjustments_other: string | null;
  access_extra_time_pct: number;
  access_reader: boolean;
  access_scribe: boolean;
  access_rest_breaks: boolean;
  access_word_processor: boolean;
  access_separate_room: boolean;
  access_other: string | null;
  senco_id: string | null;
  key_adult_id: string | null;
  next_review_due: string | null;
  last_reviewed_on: string | null;
  updated_at: string;
};

export type PlanTarget = {
  id: string;
  plan_id: string;
  target: string;
  success_criteria: string | null;
  support: string | null;
  by_when: string | null;
  status: TargetStatus;
  review_note: string | null;
  sort: number;
};

export type PlanReview = {
  id: string;
  plan_id: string;
  held_on: string;
  attendees: string | null;
  parent_attended: boolean;
  pupil_views: string | null;
  notes: string | null;
  outcomes: string | null;
  next_review_due: string | null;
  shared_with_family: boolean;
};

export type FamilyResponse = {
  id: string;
  plan_id: string;
  agreed: boolean;
  comment: string | null;
  plan_updated_at: string | null;
  reply: string | null;
  replied_at: string | null;
  seen_at: string | null;
  created_at: string;
};

export const PLAN_COLUMNS =
  "id, child_id, status, support_level, primary_need, needs_summary, needs_source, strengths, pupil_views, adjustments, adjustments_other, access_extra_time_pct, access_reader, access_scribe, access_rest_breaks, access_word_processor, access_separate_room, access_other, senco_id, key_adult_id, next_review_due, last_reviewed_on, updated_at";
export const TARGET_COLUMNS = "id, plan_id, target, success_criteria, support, by_when, status, review_note, sort";
export const REVIEW_COLUMNS = "id, plan_id, held_on, attendees, parent_attended, pupil_views, notes, outcomes, next_review_due, shared_with_family";
export const RESPONSE_COLUMNS = "id, plan_id, agreed, comment, plan_updated_at, reply, replied_at, seen_at, created_at";

/** Common adjustments for live online lessons. `short` is what teachers see in the at-a-glance panel. */
export const ADJUSTMENTS: { key: string; label: string; short: string }[] = [
  { key: "camera_off", label: "Camera off allowed when needed", short: "Camera off OK" },
  { key: "processing_time", label: "Extra processing time before answering", short: "Processing time" },
  { key: "chunked", label: "Instructions broken into small steps", short: "Chunked instructions" },
  { key: "written_in_chat", label: "Instructions also written in the chat", short: "Instructions in chat" },
  { key: "answer_in_chat", label: "May answer in the chat instead of speaking", short: "May answer in chat" },
  { key: "no_cold_call", label: "Warned before being asked to answer (no cold calling)", short: "No cold calling" },
  { key: "check_in", label: "Checked in with early in each lesson (front-row equivalent)", short: "Early check-in" },
  { key: "breaks", label: "Short movement or sensory breaks", short: "Breaks" },
  { key: "screen_settings", label: "Coloured overlay or screen settings (font, background, zoom)", short: "Overlay / screen settings" },
  { key: "captions", label: "Live captions on", short: "Captions" },
  { key: "pre_teach", label: "Key words and slides shared before the lesson", short: "Pre-teach vocabulary" },
  { key: "recording", label: "Slides or recording shared after the lesson", short: "Slides after lesson" },
  { key: "visual_timer", label: "Lesson agenda and visual timer shown", short: "Agenda and timer" },
  { key: "fidget", label: "Fidget or sensory tools allowed", short: "Fidget tools" },
  { key: "reduced_workload", label: "Reduced or adapted workload", short: "Reduced workload" },
  { key: "homework_adapted", label: "Homework adapted or extra time for homework", short: "Homework adapted" },
];
const ADJ_SHORT = new Map(ADJUSTMENTS.map((a) => [a.key, a.short]));
export const adjustmentShort = (k: string) => ADJ_SHORT.get(k) || k;

export const SUPPORT_LEVEL: Record<SupportLevel, string> = { monitoring: "Monitoring", sen_support: "SEN support", ehcp: "EHC plan" };
export const PRIMARY_NEED: Record<PrimaryNeed, string> = {
  cognition_learning: "Cognition and learning",
  communication_interaction: "Communication and interaction",
  semh: "Social, emotional and mental health",
  sensory_physical: "Sensory and/or physical",
};
export const PLAN_STATUS: Record<PlanStatus, string> = { draft: "Draft", active: "Active", closed: "Closed" };
export const TARGET_STATUS: Record<TargetStatus, string> = {
  not_started: "Not started",
  working_towards: "Working towards",
  partly_achieved: "Partly achieved",
  achieved: "Achieved",
  not_achieved: "Not achieved",
};

type AccessFields = Pick<SupportPlan, "access_extra_time_pct" | "access_reader" | "access_scribe" | "access_rest_breaks" | "access_word_processor" | "access_separate_room" | "access_other">;

/** Assessment access arrangements as short labels: "25% extra time", "Reader"… */
export function accessList(p: AccessFields): string[] {
  return [
    p.access_extra_time_pct > 0 ? `${p.access_extra_time_pct}% extra time` : "",
    p.access_reader ? "Reader" : "",
    p.access_scribe ? "Scribe" : "",
    p.access_rest_breaks ? "Rest breaks" : "",
    p.access_word_processor ? "Word processor" : "",
    p.access_separate_room ? "Separate breakout room" : "",
    p.access_other?.trim() || "",
  ].filter(Boolean);
}

/** Classroom adjustments as short labels, free text last. */
export function adjustmentList(p: Pick<SupportPlan, "adjustments" | "adjustments_other">): string[] {
  return [...(p.adjustments || []).map(adjustmentShort), ...(p.adjustments_other?.trim() ? [p.adjustments_other.trim()] : [])];
}

const DAY = 86_400_000;
const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Where a plan is with its review: overdue, due within 14 days, booked, or no date set. */
export function reviewState(nextDue: string | null | undefined): { state: "overdue" | "soon" | "ok" | "none"; days: number | null; label: string } {
  if (!nextDue) return { state: "none", days: null, label: "No review date" };
  const days = Math.round((new Date(nextDue + "T12:00:00Z").getTime() - new Date(todayKey() + "T12:00:00Z").getTime()) / DAY);
  if (days < 0) return { state: "overdue", days, label: `Review overdue by ${-days} day${days === -1 ? "" : "s"}` };
  if (days <= 14) return { state: "soon", days, label: days === 0 ? "Review due today" : `Review due in ${days} day${days === 1 ? "" : "s"}` };
  return { state: "ok", days, label: `Next review ${fmtDate(nextDue)}` };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Headteacher, admin or the SENCo: may write plans and see the SEND register. UX only; RLS enforces it. */
export function useCanManageSend(): boolean {
  const { roles } = useLearnSession();
  const senco = useLearnPermission("senco");
  return senco || roles.some((r) => r.role === "head_teacher" || r.role === "admin");
}

/** Active plans for these pupils (only the ones this user may read), keyed by pupil. */
export function useSupportPlans(childIds: string[] | null): Record<string, SupportPlan> | null {
  const [out, setOut] = useState<Record<string, SupportPlan> | null>(null);
  const key = (childIds || []).slice().sort().join(",");
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || childIds === null) return;
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to load for an empty class
      setOut({});
      return;
    }
    let alive = true;
    supabase
      .from("send_support_plans")
      .select(PLAN_COLUMNS)
      .in("child_id", key.split(","))
      .eq("status", "active")
      .then(({ data, error }) => {
        if (!alive) return;
        // Table not there yet (0169 not applied) or no access: no panel, the page works as before.
        if (error) return setOut({});
        setOut(Object.fromEntries(((data as unknown as SupportPlan[]) || []).map((p) => [p.child_id, p])));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the pupil list
  }, [key, childIds === null]);
  return out;
}

/** Names for staff named on plans (SENCo, key adult), readable by teachers and parents too. */
export async function staffNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!supabase || !list.length) return {};
  const { data } = await supabase.rpc("send_staff_names", { p_ids: list });
  return Object.fromEntries(((data as { user_id: string; full_name: string }[]) || []).map((r) => [r.user_id, r.full_name]));
}

/** One row of send_register(). */
export type RegisterRow = {
  child_id: string;
  child_name: string;
  year_group: string | null;
  plan_id: string | null;
  status: PlanStatus | null;
  support_level: SupportLevel | null;
  primary_need: PrimaryNeed | null;
  next_review_due: string | null;
  last_reviewed_on: string | null;
  senco_name: string | null;
  key_adult_name: string | null;
  has_access: boolean;
  adjustments_count: number;
  open_targets: number;
  flagged: boolean;
  family_agreed_at: string | null;
  unseen_comments: number;
  updated_at: string | null;
};
