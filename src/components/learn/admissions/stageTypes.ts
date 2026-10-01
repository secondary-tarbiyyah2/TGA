// Types + small helpers shared by the admissions drawer panels
// (assessment, interview, offer, payments). Table: admissions_stage_details (0061).

export const STAGE_COLUMNS =
  "application_id, assessment_platform, assessment_link, assessment_duration_text, assessment_invigilator, assessment_started_at, assessment_finished_at, assessment_id_verified, assessment_camera_on, assessment_irregularities, assessment_raw_score, assessment_standard_score, assessment_recommendation, assessment_results_path, assessment_emailed_at, interview_interviewer, interview_link, interview_notes, interview_outcome, interview_emailed_at, offer_start_date, offer_emailed_at, chosen_plan, application_fee_amount, application_fee_received, application_fee_received_at, annual_fee_override, first_payment_override, payment_token_created_at";

export type PlanId = "annual" | "termly" | "monthly";
export type InterviewOutcome = "pending" | "positive" | "further_consideration" | "not_progressing";

export type StageDetails = {
  application_id: string;
  assessment_platform: string | null;
  assessment_link: string | null;
  assessment_duration_text: string | null;
  assessment_invigilator: string | null;
  assessment_started_at: string | null;
  assessment_finished_at: string | null;
  assessment_id_verified: boolean;
  assessment_camera_on: boolean;
  assessment_irregularities: string | null;
  assessment_raw_score: string | null;
  assessment_standard_score: string | null;
  assessment_recommendation: string | null;
  assessment_results_path: string | null;
  assessment_emailed_at: string | null;
  interview_interviewer: string | null;
  interview_link: string | null;
  interview_notes: string | null;
  interview_outcome: InterviewOutcome | null;
  interview_emailed_at: string | null;
  offer_start_date: string | null;
  offer_emailed_at: string | null;
  chosen_plan: PlanId | null;
  application_fee_amount: number | null;
  application_fee_received: boolean;
  application_fee_received_at: string | null;
  annual_fee_override: number | null;
  first_payment_override: number | null;
  payment_token_created_at: string | null;
};

export type StagePatch = Partial<Omit<StageDetails, "application_id">>;

export type AdmissionsSettings = {
  application_fee: number | null;
  registration_fee: number | null;
  fee_terms: number | null;
  fee_instalments: number | null;
  annual_discount_percent: number | null;
  payment_instructions: string | null;
  assessment_join_url: string | null;
  interview_join_url: string | null;
  assessment_duration_text: string | null;
};

export const SETTINGS_COLUMNS =
  "application_fee, registration_fee, fee_terms, fee_instalments, annual_discount_percent, payment_instructions, assessment_join_url, interview_join_url, assessment_duration_text";

export type FeeBandRow = { year_group_range: string; annual_fee: number };

export const OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  pending: "Pending",
  positive: "Positive - proceed to offer",
  further_consideration: "Needs further consideration",
  not_progressing: "Not progressing",
};

// ── UK time helpers ─────────────────────────────────────────────────────
// Staff may be abroad; every date/time field in the admissions drawer is
// entered and shown as UK (Europe/London) time, whatever the browser's zone.

const londonParts = (ms: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
};

/** ISO instant -> "yyyy-mm-ddThh:mm" in UK time (value for <input type="datetime-local">). */
export function toLondonInput(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const p = londonParts(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)}T${z(p.h)}:${z(p.mi)}`;
}

/** "yyyy-mm-ddThh:mm" read as UK time -> ISO instant. */
export function fromLondonInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const offsetAt = (ms: number) => {
    const p = londonParts(ms);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - ms;
  };
  const first = wall - offsetAt(wall);
  const second = wall - offsetAt(first);
  return new Date(second).toISOString();
}

export function fmtLondon(iso: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }): string {
  if (!iso) return "";
  return `${new Date(iso).toLocaleString("en-GB", { ...opts, timeZone: "Europe/London" })} (UK time)`;
}

export function fmtDay(d: string | null): string {
  if (!d) return "";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
