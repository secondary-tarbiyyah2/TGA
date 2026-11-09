"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction, type EdgeResult } from "@/lib/learn/edge";

// Client side of the ai-assist Edge Function (supabase/functions/ai-assist).
// Every AI result is a draft that staff check and edit; nothing here sends
// anything to a family.

export const AI_DISCLAIMER = "Drafted by AI from your notes. Check before sending.";

export type AiStatus = {
  configured: boolean;
  daily_limit?: number;
  can: { report_comment: boolean; tarbiyah_note: boolean; message_triage: boolean };
};

const OFF: AiStatus = { configured: false, can: { report_comment: false, tarbiyah_note: false, message_triage: false } };

let statusPromise: Promise<AiStatus> | null = null;

/** Asks the server once per page load whether AI is set up and what this person may use. Parents and errors read as "off". */
export function loadAiStatus(): Promise<AiStatus> {
  if (!statusPromise) {
    statusPromise = callEdgeFunction("ai-assist", { task: "status" }).then((r) => (r.ok ? { configured: r.configured === true, daily_limit: typeof r.daily_limit === "number" ? r.daily_limit : undefined, can: { ...OFF.can, ...(r.can as AiStatus["can"]) } } : OFF));
    // A transient failure shouldn't hide AI for the rest of the session.
    statusPromise.then((s) => {
      if (!s.configured) setTimeout(() => (statusPromise = null), 60_000);
    });
  }
  return statusPromise;
}

/** null while loading; buttons stay hidden until AI is known to be set up. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    loadAiStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export function aiAssist(task: "report_comment" | "tarbiyah_note" | "triage_message" | "triage_batch", body: Record<string, unknown>): Promise<EdgeResult> {
  return callEdgeFunction("ai-assist", { task, ...body });
}

const MESSAGES: Record<string, string> = {
  ai_not_configured: "AI is not set up yet.",
  ai_daily_limit: "The school's AI limit for today has been reached. It resets at midnight.",
  ai_failed: "The AI couldn't write a draft just now. Try again in a moment.",
  forbidden: "Your account can't use this AI helper.",
  function_not_deployed: "AI is not set up yet.",
  network_error: "Couldn't reach the server. Check your connection and try again.",
};

export function aiErrorMessage(r: EdgeResult): string {
  // ai_failed carries the server's reason when it knows one (a refused key, a
  // retired model, no credit), so staff can tell the admin what to fix (T32).
  return (r.error === "invalid_input" || r.error === "input_too_long" || r.error === "ai_failed" ? r.detail : undefined) || (r.error && MESSAGES[r.error]) || r.detail || "Something went wrong. Try again.";
}

export const TRIAGE_CATEGORY_LABEL: Record<string, string> = {
  absence: "Absence",
  "fees and payments": "Fees and payments",
  admissions: "Admissions",
  "academic or homework": "Academic or homework",
  "pastoral or wellbeing": "Pastoral or wellbeing",
  "safeguarding concern": "Safeguarding",
  "technical or portal": "Technical or portal",
  complaint: "Complaint",
  other: "Other",
};

export type Triage = { message_id: string; category: string; urgency: string; summary: string; handler: string; dsl: boolean; cached: boolean };
