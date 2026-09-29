"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

const SESSION_KEY = "tga_quiz_session_token";

/**
 * A random client-generated id for a row the anon role can insert but
 * never read back (e.g. quiz_leads — RLS deliberately has no SELECT
 * policy for anon here, see YourChildsWeekQuiz.tsx's submitLead). Factored
 * out of the component so eslint's react-hooks/purity rule doesn't flag
 * the Date.now()/Math.random() fallback as an impure call "during render"
 * — it only ever runs inside an event handler, but the rule can't tell
 * that from inside a component file.
 */
export function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A random, non-identifying session id the browser generates itself and
 * keeps for the current tab only (sessionStorage, not localStorage — this
 * is a single quiz attempt, not a returning-visitor identity). Never
 * derived from an email, IP or auth identity — see 0016's quiz_sessions
 * table comment for why that's a schema-level guarantee, not just this
 * function's discipline.
 */
export function getOrCreateSessionToken(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, token);
    return token;
  } catch {
    // Private browsing / storage blocked — fall back to an in-memory token
    // for this render only; analytics simply won't persist across steps,
    // which is an acceptable degradation (never required for correctness).
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export type QuizEventType =
  | "started"
  | "step_viewed"
  | "step_answered"
  | "completed"
  | "pdf_email_sent"
  | "call_booked"
  | "abandoned";

/** Best-effort, anonymous, fire-and-forget analytics — never blocks the UI, never throws into the caller. */
export async function recordQuizEvent(sessionRowId: string | null, type: QuizEventType, stepIndex?: number) {
  const supabase = getSupabaseClient();
  if (!supabase || !sessionRowId) return;
  try {
    await supabase.from("quiz_events").insert({ session_id: sessionRowId, event_type: type, step_index: stepIndex ?? null });
  } catch {
    // analytics only — never surfaced to the parent filling in the quiz
  }
}

/**
 * Creates (or updates) the anonymous quiz_sessions row for this attempt.
 * Returns the row's DB id (distinct from the browser's session TOKEN) so
 * subsequent updates/events can target it, or null if Supabase isn't
 * configured / the write failed — callers must treat that as "analytics
 * unavailable", never as "block the quiz".
 */
export async function upsertQuizSession(params: {
  rowId: string | null;
  quizConfigVersionId: string | null;
  yearGroupId: string | null;
  timezone: string | null;
  currentStep: number;
  answers: Record<string, string>;
  completed?: boolean;
}): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const token = getOrCreateSessionToken();

  try {
    if (params.rowId) {
      // Anon has no SELECT policy on quiz_sessions (write-only, by design —
      // see 0016's table comment), so this never chains .select(): a plain
      // update with Prefer: return=minimal needs no read-back permission.
      await supabase
        .from("quiz_sessions")
        .update({
          year_group_id: params.yearGroupId,
          timezone: params.timezone,
          current_step: params.currentStep,
          answers: params.answers,
          completed_at: params.completed ? new Date().toISOString() : undefined,
        })
        .eq("id", params.rowId);
      return params.rowId;
    }

    // The client generates the row's id itself, rather than reading it
    // back via RETURNING/.select() (which anon cannot do — no SELECT
    // policy on this table, deliberately). This keeps the insert a plain
    // write with no read-back requirement at all.
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { error } = await supabase.from("quiz_sessions").insert({
      id,
      session_token: token,
      quiz_config_version_id: params.quizConfigVersionId,
      year_group_id: params.yearGroupId,
      timezone: params.timezone,
      current_step: params.currentStep,
      answers: params.answers,
    });
    if (error) return null;
    return id;
  } catch {
    return null;
  }
}
