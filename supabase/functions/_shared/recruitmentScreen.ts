// AI screening of a job application (migration 0182). Used by careers-apply
// (automatically, when recruitment_settings.auto_screen is on) and by the
// staff-only recruitment-screen function (the portal's "Screen with AI").
//
// ADVISORY ONLY. The result is a score, a short summary, how the application
// meets each requirement, strengths, concerns, checks and interview
// questions, for the recruitment panel to read. Nothing here changes an
// application's status or contacts a candidate: a person makes every
// decision (UK GDPR Art. 22: no solely automated decisions).
//
// Fairness: the model is NOT sent the candidate's name, contact details,
// country or town, right-to-work answer, criminal record check answer, or
// referees' names and contact details. The CV is sent as written (it may
// contain personal details), so the prompt tells the model to ignore
// anything about protected characteristics, nationality or location.
//
// Cost control: every call is counted in public.ai_usage under the task
// 'recruitment_screen' and shares the AI_DAILY_LIMIT cap with ai-assist.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { callClaudeJson, claudeModel, isClaudeConfigured, type ClaudeContent } from "./claude.ts";

const BUCKET = "recruitment-documents";
const TASK = "recruitment_screen";
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_CV_TEXT = 40_000;

export type AiScreening = {
  score: number;
  recommendation: "strong" | "possible" | "unlikely";
  summary: string;
  subjects_fit: string;
  requirements: { requirement: string; met: "yes" | "partly" | "no" | "unclear"; evidence: string }[];
  strengths: string[];
  concerns: string[];
  checks: string[];
  interview_questions: string[];
  cv_read: boolean;
  model: string;
};

export type ScreenResult = { ok: true; screening: AiScreening } | { ok: false; error: "ai_not_configured" | "ai_daily_limit" | "not_found" | "ai_failed"; detail?: string };

export function screeningConfigured(): boolean {
  return isClaudeConfigured();
}

function dailyLimit(): number {
  const n = Number(Deno.env.get("AI_DAILY_LIMIT"));
  return Number.isInteger(n) && n >= 0 ? n : 500;
}

const LABELS: Record<string, Record<string, string>> = {
  teacher: { qts: "UK Qualified Teacher Status (QTS)", qtls: "QTLS", overseas: "A teaching qualification from outside the UK", training: "Training to teach", none: "No formal teaching qualification" },
  years: { none: "None", under_2: "Less than 2 years", "2_5": "2 to 5 years", "5_10": "5 to 10 years", over_10: "More than 10 years" },
  online: { regular: "Teaches online regularly", some: "Some online teaching", none: "No online teaching yet" },
  hours: { full_time: "Full-time", part_time: "Part-time", either: "Either" },
};

// ── reading the CV ───────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The text of a .docx (word/document.xml), or "" if it can't be read. */
export async function docxText(bytes: Uint8Array): Promise<string> {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return "";
    const entries = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < entries && p + 46 <= bytes.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) return "";
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (name === "word/document.xml") {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const raw = bytes.subarray(start, start + size);
        const xml = new TextDecoder().decode(method === 8 ? await inflateRaw(raw) : raw);
        return xml
          .replace(/<\/w:p>/g, "\n")
          .replace(/<w:tab\/>/g, " ")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return "";
  } catch {
    return "";
  }
}

async function cvBlocks(service: SupabaseClient, path: string | null): Promise<{ blocks: Record<string, unknown>[]; read: boolean }> {
  if (!path) return { blocks: [], read: false };
  const { data, error } = await service.storage.from(BUCKET).download(path);
  if (error || !data) return { blocks: [], read: false };
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (path.endsWith(".pdf") && bytes.length <= MAX_PDF_BYTES) {
    return { blocks: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) }, title: "Candidate CV" }], read: true };
  }
  if (path.endsWith(".docx")) {
    const text = (await docxText(bytes)).slice(0, MAX_CV_TEXT);
    if (text) return { blocks: [{ type: "text", text: `<cv>\n${text}\n</cv>` }], read: true };
  }
  return { blocks: [], read: false };
}

// ── the prompt ───────────────────────────────────────────────────────────

const SYSTEM = `You help the recruitment panel of Tarbiyyah Global Academy, a live online Islamic school (Year 1 to Year 11, UK national curriculum with Qur'an, Arabic and Islamic Studies, classes of up to 15, lessons on Microsoft Teams in UK school hours). You read one job application and give the panel a fair, evidence-based first read. You are advisory only: people make every decision.

Rules:
- Judge only job-relevant evidence: teaching experience and quality, subject knowledge, qualifications, online teaching, availability, the supporting statement and the CV.
- Ignore and never mention: name, age, sex or gender, race, nationality, country or location, religion beyond the stated role requirements, disability, pregnancy, marital status, accent or language background. Do not infer any of these.
- Follow the school's own screening guidance, which overrides your defaults.
- Be specific: cite evidence from the application. If something isn't shown, say "unclear" rather than guessing.
- Score 0 to 100 for fit to the role: 75+ strong, 50 to 74 possible, under 50 unlikely. Recommendation must match the score band.
- Reply with ONE JSON object and nothing else.`;

function list(xs: unknown): string {
  return Array.isArray(xs) && xs.length ? xs.join(", ") : "not given";
}

type AppRow = Record<string, unknown> & {
  id: string;
  vacancy_id: string | null;
  vacancy_title: string;
  employment: { employer: string; role: string; from: string; to: string; current: boolean; reason: string }[];
  referees: { position?: string; organisation?: string; relationship?: string; contactBeforeInterview?: boolean }[];
  cv_path: string | null;
};

function buildPrompt(a: AppRow, vacancy: Record<string, string | null> | null, criteria: string): string {
  const jobs = a.employment.length
    ? a.employment.map((j) => `- ${j.role} at ${j.employer}, ${j.from} to ${j.current ? "present" : j.to}${j.reason ? ` (reason for leaving: ${j.reason})` : ""}`).join("\n")
    : "- none given";
  const refs = a.referees.map((r, i) => `- Referee ${i + 1}: ${[r.position, r.organisation, r.relationship].filter(Boolean).join(", ")}${r.contactBeforeInterview ? "" : " (not to be contacted before interview)"}`).join("\n");
  const role = vacancy
    ? `Title: ${vacancy.title}\nAbout: ${vacancy.description || ""}\nEssential:\n${vacancy.requirements || "not set"}\nDesirable:\n${vacancy.desirable || "not set"}`
    : `Title: ${a.vacancy_title} (a general application: judge fit for teaching the subjects the candidate lists)`;
  return `<school_guidance>
${criteria}
</school_guidance>

<role>
${role}
</role>

<application>
Teacher status: ${LABELS.teacher[String(a.teacher_status)] || a.teacher_status}
Highest qualification: ${a.highest_qualification}
Other qualifications: ${a.qualifications || "not given"}
Islamic qualifications / study: ${a.islamic_qualifications || "not given"}
Subjects they can teach: ${list(a.subjects)}
Year groups taught: ${list(a.year_groups)}
Languages: ${a.languages || "not given"}
Teaching experience: ${LABELS.years[String(a.years_experience)] || a.years_experience}
Online teaching: ${LABELS.online[String(a.online_experience)] || a.online_experience}
Employment history (most recent first):
${jobs}
Gaps explained: ${a.employment_gaps || "nothing written"}
Hours wanted: ${LABELS.hours[String(a.hours_preference)] || a.hours_preference}
Days available: ${list(a.available_days)}
Earliest start: ${a.earliest_start || "not given"}; notice: ${a.notice_period || "not given"}
Has computer, camera and reliable internet: ${a.has_equipment ? "yes" : "not confirmed"}
References:
${refs}

Supporting statement:
${a.statement}

Why this school:
${a.why_tga || "not given"}
</application>

Return JSON exactly in this shape:
{"score": 0-100, "recommendation": "strong"|"possible"|"unlikely", "summary": "2 to 3 sentences", "subjects_fit": "one sentence on which subjects/year groups they look suited to", "requirements": [{"requirement": "each essential and desirable point from the role", "met": "yes"|"partly"|"no"|"unclear", "evidence": "short"}], "strengths": ["up to 5"], "concerns": ["up to 5, job-related only"], "checks": ["up to 5 things to verify, e.g. unexplained gaps, referee coverage, qualifications"], "interview_questions": ["4 to 6 tailored questions"]}`;
}

const strArr = (v: unknown, max: number, len = 400): string[] =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, len)).filter(Boolean).slice(0, max);

function validate(raw: Record<string, unknown>): Omit<AiScreening, "cv_read" | "model"> | null {
  const score = Math.round(Number(raw.score));
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  const recommendation: AiScreening["recommendation"] = score >= 75 ? "strong" : score >= 50 ? "possible" : "unlikely";
  const summary = String(raw.summary ?? "").trim().slice(0, 1200);
  if (!summary) return null;
  const MET = ["yes", "partly", "no", "unclear"];
  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : [])
    .map((r: Record<string, unknown>) => ({
      requirement: String(r?.requirement ?? "").trim().slice(0, 300),
      met: (MET.includes(String(r?.met)) ? String(r?.met) : "unclear") as AiScreening["requirements"][number]["met"],
      evidence: String(r?.evidence ?? "").trim().slice(0, 400),
    }))
    .filter((r) => r.requirement)
    .slice(0, 15);
  return {
    score,
    recommendation,
    summary,
    subjects_fit: String(raw.subjects_fit ?? "").trim().slice(0, 400),
    requirements,
    strengths: strArr(raw.strengths, 5),
    concerns: strArr(raw.concerns, 5),
    checks: strArr(raw.checks, 5),
    interview_questions: strArr(raw.interview_questions, 6),
  };
}

// ── run ──────────────────────────────────────────────────────────────────

export async function screenApplication(service: SupabaseClient, applicationId: string, by: string | null = null): Promise<ScreenResult> {
  if (!isClaudeConfigured()) return { ok: false, error: "ai_not_configured" };

  const { data: found } = await service.from("job_applications").select("*").eq("id", applicationId).maybeSingle();
  if (!found) return { ok: false, error: "not_found" };
  const app = found as AppRow;

  const [{ data: vacancy }, { data: settings }] = await Promise.all([
    app.vacancy_id ? service.from("job_vacancies").select("title, description, requirements, desirable").eq("id", app.vacancy_id).maybeSingle() : Promise.resolve({ data: null }),
    service.from("recruitment_settings").select("screening_criteria").eq("id", true).maybeSingle(),
  ]);

  const { data: allowed, error: reserveError } = await service.rpc("ai_usage_reserve", { p_task: TASK, p_limit: dailyLimit() });
  if (reserveError || allowed !== true) return { ok: false, error: "ai_daily_limit" };

  const cv = await cvBlocks(service, app.cv_path);
  const prompt = buildPrompt(app, (vacancy as Record<string, string | null> | null) || null, String((settings as { screening_criteria?: string } | null)?.screening_criteria || ""));
  const content: ClaudeContent = [...cv.blocks, { type: "text", text: prompt }];

  const model = Deno.env.get("RECRUITMENT_AI_MODEL") || claudeModel();
  const res = await callClaudeJson({ system: SYSTEM, messages: [{ role: "user", content }], maxTokens: 2000, timeoutMs: 90_000, model }, validate);
  if (res.usage) await service.rpc("ai_usage_add_tokens", { p_task: TASK, p_input: res.usage.input_tokens, p_output: res.usage.output_tokens });
  if (!res.ok) {
    await service.from("job_application_events").insert({ application_id: app.id, kind: "ai", body: `AI screening failed (${res.error}). You can try again from the application.`, created_by: by });
    return { ok: false, error: "ai_failed", detail: res.error };
  }

  const screening: AiScreening = { ...res.data, cv_read: cv.read, model: res.model };
  await service
    .from("job_applications")
    .update({ ai_score: screening.score, ai_recommendation: screening.recommendation, ai_screening: screening, ai_screened_at: new Date().toISOString() })
    .eq("id", app.id);
  await service.from("job_application_events").insert({
    application_id: app.id,
    kind: "ai",
    body: `AI screening: ${screening.score}/100 (${screening.recommendation})${cv.read ? "" : ", CV not read"}. Advisory only.`,
    created_by: by,
  });
  return { ok: true, screening };
}
