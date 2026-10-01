import { getSupabaseClient } from "@/lib/supabase/client";
import { callEdgeFunction, edgeErrorMessage } from "@/lib/learn/edge";
import type { ApplicationRow } from "@/components/admissions/applicationShared";
import { summariseFees, type FeeSummary } from "@/components/learn/admissions/paymentCalc";
import { buildTemplateContext, type TemplateKey, type TemplateRow } from "@/components/learn/admissions/messageTemplates";
import { SETTINGS_COLUMNS, STAGE_COLUMNS, type AdmissionsSettings, type FeeBandRow, type StageDetails } from "@/components/learn/admissions/stageTypes";

export const TEMPLATE_COLUMNS = "key, subject, body, auto_send";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export function normaliseDetails(row: Record<string, unknown> | null): StageDetails | null {
  if (!row) return null;
  return {
    ...(row as unknown as StageDetails),
    application_fee_amount: num(row.application_fee_amount),
    annual_fee_override: num(row.annual_fee_override),
    first_payment_override: num(row.first_payment_override),
  };
}

export function normaliseSettings(sr: Record<string, unknown> | null): AdmissionsSettings | null {
  if (!sr) return null;
  return {
    ...(sr as unknown as AdmissionsSettings),
    application_fee: num(sr.application_fee),
    registration_fee: num(sr.registration_fee),
    annual_discount_percent: num(sr.annual_discount_percent),
  };
}

export type AdmissionsData = {
  error: string | null;
  settings: AdmissionsSettings | null;
  bands: FeeBandRow[];
  details: StageDetails | null;
  planIntent: string | null;
  /** Keyed by template key. Empty when the table isn't there yet (the built-in defaults then apply). */
  templates: Record<string, TemplateRow>;
};

/** Everything the admissions panels and the automatic emails need for one application. */
export async function fetchAdmissionsData(applicationId: string): Promise<AdmissionsData> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "The portal isn't connected to the server yet.", settings: null, bands: [], details: null, planIntent: null, templates: {} };
  const [s, b, d, i, t] = await Promise.all([
    supabase.from("site_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle(),
    supabase.from("fee_bands").select("year_group_range, annual_fee").order("order_index"),
    supabase.from("admissions_stage_details").select(STAGE_COLUMNS).eq("application_id", applicationId).maybeSingle(),
    // From migration 0060; ignore the error if that column isn't there yet.
    supabase.from("admissions_applications").select("payment_plan_intent").eq("id", applicationId).maybeSingle(),
    // From migration 0065; before it is applied the built-in default texts are used.
    supabase.from("admissions_email_templates").select(TEMPLATE_COLUMNS),
  ]);
  const templates: Record<string, TemplateRow> = {};
  for (const r of (t.error ? [] : (t.data as TemplateRow[] | null) || [])) templates[r.key] = r;
  return {
    error: s.error || d.error ? "Couldn't load the admissions settings. If this keeps happening, migration 0061 may not be applied yet." : null,
    settings: normaliseSettings(s.data as Record<string, unknown> | null),
    bands: ((b.data as { year_group_range: string; annual_fee: number | string }[] | null) || []).map((x) => ({ year_group_range: x.year_group_range, annual_fee: Number(x.annual_fee) })),
    details: normaliseDetails(d.data as Record<string, unknown> | null),
    planIntent: ((i.data as { payment_plan_intent?: string | null } | null)?.payment_plan_intent) ?? null,
    templates,
  };
}

export function feesFor(app: ApplicationRow, data: Pick<AdmissionsData, "settings" | "bands" | "details" | "planIntent">): FeeSummary {
  return summariseFees({
    yearGroup: app.year_group_applying,
    adminFeeAmount: app.admin_fee_amount === null ? null : Number(app.admin_fee_amount),
    settings: data.settings,
    bands: data.bands,
    details: data.details,
    planIntent: data.planIntent,
  });
}

export type SendOutcome = { ok: boolean; emailSent: boolean; text: string; skipped?: boolean };

/** One call to the admissions-correspond Edge Function with finished (staff-edited) text, with a plain-English outcome. */
export async function sendAdmissionsEmail(applicationId: string, template: string, subject: string, body: string): Promise<SendOutcome> {
  const r = await callEdgeFunction("admissions-correspond", { applicationId, template, subject, body });
  return outcomeOf(r);
}

function outcomeOf(r: Awaited<ReturnType<typeof callEdgeFunction>>): SendOutcome {
  if (!r.ok) {
    if (r.error === "unresolved_tokens") return { ok: false, emailSent: false, text: `Not sent. The message still contains unfilled values: ${((r.unresolved as string[]) || []).map((t) => `{{${t}}}`).join(", ")}.` };
    return { ok: false, emailSent: false, text: `Not sent. ${edgeErrorMessage(r)}` };
  }
  if (r.skipped) return { ok: true, emailSent: false, skipped: true, text: "" };
  if (r.emailSent) return { ok: true, emailSent: true, text: "Email sent." };
  return { ok: true, emailSent: false, text: `The email could not be delivered (${String(r.emailError || "unknown error")}). It is recorded as "not delivered" in the Messages history.` };
}

/**
 * Send a template by key: the Edge Function renders the stored template text
 * with the values computed here (fees, overridden dates and links), logs it
 * to admissions_messages and sends it. With auto:true the template's auto_send
 * switch is honoured (outcome.skipped when off) and 'decline' is never sent.
 * Never throws; a failure is returned, never blocks the caller's stage change.
 */
export async function sendTemplateEmail(opts: {
  app: ApplicationRow;
  key: TemplateKey;
  auto: boolean;
  data: Pick<AdmissionsData, "settings" | "bands" | "details" | "planIntent"> & { fees?: FeeSummary };
  extra?: Record<string, string | undefined>;
}): Promise<SendOutcome> {
  try {
    const { app, key, data } = opts;
    const fees = data.fees || feesFor(app, data);
    const vars = buildTemplateContext(app, data.settings, data.details, { fees, extra: opts.extra });
    const r = await callEdgeFunction("admissions-correspond", { applicationId: app.id, template: key, auto: opts.auto, vars });
    return outcomeOf(r);
  } catch {
    return { ok: false, emailSent: false, text: "Not sent. Something went wrong preparing the email." };
  }
}

/** Short toast text for an automatic send. Empty when nothing was sent because the template is switched off. */
export function autoToast(label: string, parentEmail: string, out: SendOutcome): string {
  if (out.skipped) return "";
  if (out.emailSent) return `${label} emailed to ${parentEmail}.`;
  return `${label} email could not be delivered: ${out.text.replace(/^Not sent\.\s*/, "")}`;
}
