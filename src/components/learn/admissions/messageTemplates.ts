import type { ApplicationRow } from "@/components/admissions/applicationShared";
import type { FeeSummary } from "@/components/learn/admissions/paymentCalc";
import type { AdmissionsSettings, StageDetails } from "@/components/learn/admissions/stageTypes";
import {
  DEFAULT_TEMPLATES,
  PAYMENT_LINK_PLACEHOLDER,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS as SHARED_LABELS,
  buildTemplateContext,
  renderTemplate,
  type TemplateKey,
  type TemplateRow,
} from "../../../../supabase/functions/admissions-correspond/templating";

// The templating itself (tokens, defaults, buildTemplateContext, renderTemplate)
// lives in supabase/functions/admissions-correspond/templating.ts so the portal
// and the Edge Function render identically. This file adapts it to the portal's types.
export {
  DEFAULT_TEMPLATES,
  NEVER_AUTO,
  SAMPLE_APP,
  SAMPLE_EXTRA,
  SAMPLE_FEES,
  SAMPLE_STAGE,
  SAMPLE_TOKEN_VALUES_NOTE,
  TEMPLATE_KEYS,
  TOKEN_DOCS,
  buildTemplateContext,
  findUnresolvedTokens,
  renderTemplate,
  type TemplateKey,
  type TemplateRow,
} from "../../../../supabase/functions/admissions-correspond/templating";

/** The edge function swaps this token for the family's personal upload link when it sends. */
export const PAYMENT_LINK_TOKEN = PAYMENT_LINK_PLACEHOLDER;

/** Template keys, plus the legacy keys that old history rows may carry. */
export type TemplateId = TemplateKey | "assessment_details" | "decline_waitlist" | "custom";

export const TEMPLATE_LABELS = SHARED_LABELS as Record<TemplateId, string>;

/** Offered in the Messages tab picker. (payment_rejected needs a specific proof, so it is sent from the Payments tab.) */
export const SELECTABLE_TEMPLATES: TemplateKey[] = ["received", "assessment_invite", "interview_invite", "offer", "payment_received", "waitlist", "decline", "request_documents"];

export type TemplateContext = {
  settings?: AdmissionsSettings | null;
  details?: StageDetails | null;
  fees?: FeeSummary | null;
  /** Editable template texts from admissions_email_templates; the built-in defaults are used for any missing key. */
  templates?: Record<string, TemplateRow> | null;
  /** Event-specific values: payment_covers, payment_amount, reject_reason, reject_item. */
  extra?: Record<string, string | undefined>;
};

export function templateText(key: TemplateKey, templates?: Record<string, TemplateRow> | null) {
  const row = templates?.[key];
  return row ? { subject: row.subject, body: row.body } : { subject: DEFAULT_TEMPLATES[key].subject, body: DEFAULT_TEMPLATES[key].body };
}

/** Filled-in subject + body for a template, with every known value substituted. `unresolved` lists any unknown {{tokens}} left. */
export function buildTemplate(key: TemplateKey, app: ApplicationRow, ctx: TemplateContext): { subject: string; body: string; unresolved: string[] } {
  const vars = buildTemplateContext(app, ctx.settings || null, ctx.details || null, { fees: ctx.fees || null, extra: ctx.extra });
  return renderTemplate(templateText(key, ctx.templates), vars);
}

export function isTemplateKey(k: string): k is TemplateKey {
  return (TEMPLATE_KEYS as string[]).includes(k);
}
