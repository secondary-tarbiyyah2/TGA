// Public job application (Careers page). Deployed with verify_jwt = false
// (supabase/config.toml): candidates are not signed in. This function is the
// ONLY way an application gets into job_applications (there is no client
// insert policy, migration 0182). Spam protection: honeypot, minimum fill-in
// time, per-IP and per-email rate limit (booking_attempts). Files are sniffed
// from their first bytes, never trusted by name or MIME type, and written to
// the private 'recruitment-documents' bucket with the service role.
//
// POST multipart/form-data
//   payload    JSON (see Payload below)
//   cv         one file, PDF or Word, <= 10 MB (required)
//   documents  up to 3 files, PDF / Word / JPG / PNG, <= 10 MB each (optional)
//  -> { ok: true, reference, emailSent }
//  -> { ok: false, error: "validation" | "rate_limited" | "vacancy_closed" | "file_type" | "file_size" | "save_failed", fields? }
//
// On success the recruitment inbox (recruitment_settings.notify_email) gets a
// structured summary of the whole application, with the CV attached if the
// setting allows, and the candidate gets an acknowledgement with their
// reference (if auto_acknowledge is on).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashIp, isRateLimited, recordAttempt } from "../_shared/spam.ts";
import { screenApplication, screeningConfigured, type AiScreening } from "../_shared/recruitmentScreen.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FALLBACK_INBOX = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const BUCKET = "recruitment-documents";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 3;
const MAX_REQUEST_BYTES = 45 * 1024 * 1024;
/** Attach the CV to the inbox email only below this size (mail providers cap messages at ~10 MB). */
const MAX_ATTACH_BYTES = 6 * 1024 * 1024;
/** A thorough form: anything submitted faster than this is a script. */
const MIN_FILL_MS = 30 * 1000;

// Allowed values: keep in step with src/lib/careers.ts and migration 0182.
const RIGHT_TO_WORK = ["uk_yes", "outside_uk"];
const TEACHER_STATUS = ["qts", "qtls", "overseas", "training", "none"];
const YEARS_EXPERIENCE = ["none", "under_2", "2_5", "5_10", "over_10"];
const ONLINE_EXPERIENCE = ["regular", "some", "none"];
const HOURS = ["full_time", "part_time", "either"];
const DBS = ["enhanced_update_service", "enhanced", "willing", "overseas_check", "overseas_willing", "not_available"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LABELS: Record<string, Record<string, string>> = {
  rightToWork: { uk_yes: "Yes, has the right to work in the UK", uk_sponsorship: "Would need visa sponsorship to work in the UK", outside_uk: "Lives outside the UK (would work remotely from there)" },
  teacherStatus: { qts: "Qualified Teacher Status (QTS)", qtls: "QTLS", overseas: "Teaching qualification from outside the UK", training: "Currently training to teach", none: "No formal teaching qualification" },
  yearsExperience: { none: "None yet", under_2: "Less than 2 years", "2_5": "2 to 5 years", "5_10": "5 to 10 years", over_10: "More than 10 years" },
  onlineExperience: { regular: "Teaches online regularly", some: "Some online teaching", none: "No online teaching yet" },
  hours: { full_time: "Full-time", part_time: "Part-time", either: "Either" },
  dbs: {
    enhanced_update_service: "UK: Enhanced DBS on the Update Service",
    enhanced: "UK: Enhanced DBS (not on the Update Service)",
    willing: "UK: no DBS yet, happy to apply",
    overseas_check: "Outside the UK: has a police / criminal record certificate",
    overseas_willing: "Outside the UK: can get a police / criminal record certificate",
    not_available: "No such check available where they live, or not sure: agree alternative checks",
  },
};

type Job = { employer: string; role: string; from: string; to: string; current: boolean; reason: string };
type Referee = { name: string; position: string; organisation: string; relationship: string; email: string; phone: string; contactBeforeInterview: boolean };

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const str = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);
const strList = (v: unknown, allowed?: string[], max = 20): string[] =>
  (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter((x) => x && x.length <= 80 && (!allowed || allowed.includes(x))).slice(0, max);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
}

/** Sniff the real file type from its first bytes. */
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { type: "application/pdf", ext: "pdf" };
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    // A .docx is a zip whose entries include word/. Look for it near the start.
    const head = new TextDecoder("latin1").decode(b.subarray(0, Math.min(b.length, 64 * 1024)));
    if (head.includes("word/") || head.includes("[Content_Types].xml")) return { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    return null;
  }
  if (b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return { type: "application/msword", ext: "doc" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const safeName = (name: string): string => name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";

const monthLabel = (ym: string): string => {
  const m = MONTH.exec(ym);
  if (!m) return ym;
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) return jsonResponse({ ok: false, error: "file_size" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ ok: false, error: "validation", fields: ["form"] }, 400);
  }
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(String(form.get("payload") || "{}"));
  } catch {
    return jsonResponse({ ok: false, error: "validation", fields: ["form"] }, 400);
  }

  // Honeypot: accept silently so bots don't retry, but save nothing.
  if (typeof p.company === "string" && p.company.trim() !== "") return jsonResponse({ ok: true, reference: "TGA-J-0000" });
  const renderedAt = Number(p.formRenderedAt);
  if (!renderedAt || Date.now() - renderedAt < MIN_FILL_MS) return jsonResponse({ ok: false, error: "validation", fields: ["form"] }, 400);

  // ── read and check every field ──
  const bad: string[] = [];
  const need = (ok: boolean, field: string) => {
    if (!ok) bad.push(field);
  };

  const vacancyId = str(p.vacancyId, 40);
  const firstName = str(p.firstName, 80);
  const lastName = str(p.lastName, 80);
  const email = str(p.email, 254).toLowerCase();
  const phone = str(p.phone, 40);
  const country = str(p.country, 80);
  const rightToWork = str(p.rightToWork, 40);
  const teacherStatus = str(p.teacherStatus, 40);
  const highestQualification = str(p.highestQualification, 300);
  const yearsExperience = str(p.yearsExperience, 40);
  const onlineExperience = str(p.onlineExperience, 40);
  const hoursPreference = str(p.hoursPreference, 40);
  const statement = str(p.statement, 8000);
  const dbsStatus = str(p.dbsStatus, 40);
  const declarationName = str(p.declarationName, 160);
  const subjects = strList(p.subjects);
  const yearGroups = strList(p.yearGroups);
  const availableDays = strList(p.availableDays, DAYS, 7);

  need(firstName.length >= 1, "firstName");
  need(lastName.length >= 1, "lastName");
  need(isEmail(email), "email");
  need(phone.replace(/\D/g, "").length >= 6, "phone");
  need(country.length >= 2, "country");
  need(RIGHT_TO_WORK.includes(rightToWork), "rightToWork");
  need(TEACHER_STATUS.includes(teacherStatus), "teacherStatus");
  need(highestQualification.length >= 2, "highestQualification");
  need(subjects.length > 0, "subjects");
  need(YEARS_EXPERIENCE.includes(yearsExperience), "yearsExperience");
  need(ONLINE_EXPERIENCE.includes(onlineExperience), "onlineExperience");
  need(HOURS.includes(hoursPreference), "hoursPreference");
  need(availableDays.length > 0, "availableDays");
  need(statement.length >= 100, "statement");
  need(DBS.includes(dbsStatus), "dbsStatus");
  need(declarationName.length >= 2, "declarationName");
  need(p.declarationTrue === true, "declarationTrue");
  need(p.consentData === true, "consentData");

  const employment: Job[] = (Array.isArray(p.employment) ? p.employment : []).slice(0, 12).map((j: Record<string, unknown>) => ({
    employer: str(j?.employer, 160),
    role: str(j?.role, 160),
    from: str(j?.from, 7),
    to: j?.current ? "" : str(j?.to, 7),
    current: j?.current === true,
    reason: str(j?.reason, 400),
  }));
  employment.forEach((j, i) => {
    need(j.employer.length >= 2 && j.role.length >= 2 && MONTH.test(j.from) && (j.current || (MONTH.test(j.to) && j.to >= j.from)), `employment.${i}`);
  });
  need(employment.length > 0 || yearsExperience === "none", "employment");

  const referees: Referee[] = (Array.isArray(p.referees) ? p.referees : []).slice(0, 3).map((r: Record<string, unknown>) => ({
    name: str(r?.name, 120),
    position: str(r?.position, 120),
    organisation: str(r?.organisation, 160),
    relationship: str(r?.relationship, 160),
    email: str(r?.email, 254).toLowerCase(),
    phone: str(r?.phone, 40),
    contactBeforeInterview: r?.contactBeforeInterview === true,
  }));
  need(referees.length >= 2, "referees");
  referees.forEach((r, i) => need(r.name.length >= 2 && r.organisation.length >= 2 && r.relationship.length >= 2 && isEmail(r.email) && r.email !== email, `referees.${i}`));

  // Files
  const cv = form.get("cv");
  const docs = form.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  need(cv instanceof File && cv.size > 0, "cv");
  if (docs.length > MAX_DOCUMENTS) bad.push("documents");

  if (bad.length > 0) return jsonResponse({ ok: false, error: "validation", fields: bad }, 400);

  // ── rate limit ──
  const ipHash = await hashIp(clientIp(req));
  const rateKey = `careers:${email}`;
  if (await isRateLimited(supabase, ipHash, rateKey)) return jsonResponse({ ok: false, error: "rate_limited" }, 429);
  await recordAttempt(supabase, ipHash, rateKey);

  // ── the role ──
  let vacancyTitle = "General application (any suitable role)";
  let vacancyRowId: string | null = null;
  if (vacancyId && vacancyId !== "general") {
    const { data: v } = await supabase.from("job_vacancies").select("id, title, status, closing_date").eq("id", vacancyId).maybeSingle();
    const ukToday = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (!v || v.status !== "open" || (v.closing_date && v.closing_date < ukToday)) return jsonResponse({ ok: false, error: "vacancy_closed" }, 409);
    vacancyTitle = v.title;
    vacancyRowId = v.id;
  }

  // ── check and store the files ──
  const id = crypto.randomUUID();
  const stored: { path: string; name: string; kind: "cv" | "document"; size: number; type: string }[] = [];
  let cvBytes: Uint8Array | null = null;
  let cvType = "";
  const files: { file: File; kind: "cv" | "document" }[] = [{ file: cv as File, kind: "cv" }, ...docs.map((file) => ({ file, kind: "document" as const }))];
  for (const { file, kind } of files) {
    if (file.size > MAX_FILE_BYTES) return jsonResponse({ ok: false, error: "file_size", fields: [kind === "cv" ? "cv" : "documents"] }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const t = sniff(bytes);
    if (!t || (kind === "cv" && !["pdf", "docx", "doc"].includes(t.ext))) return jsonResponse({ ok: false, error: "file_type", fields: [kind === "cv" ? "cv" : "documents"] }, 400);
    const path = `${id}/${kind}-${crypto.randomUUID()}.${t.ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: t.type, upsert: false });
    if (error) {
      if (stored.length) await supabase.storage.from(BUCKET).remove(stored.map((s) => s.path));
      return jsonResponse({ ok: false, error: "save_failed" }, 500);
    }
    stored.push({ path, name: safeName(file.name || `${kind}.${t.ext}`), kind, size: bytes.length, type: t.type });
    if (kind === "cv") {
      cvBytes = bytes;
      cvType = t.ext;
    }
  }
  const cvStored = stored.find((s) => s.kind === "cv")!;

  // ── save ──
  const row = {
    id,
    vacancy_id: vacancyRowId,
    vacancy_title: vacancyTitle,
    title: str(p.title, 20) || null,
    first_name: firstName,
    last_name: lastName,
    preferred_name: str(p.preferredName, 80) || null,
    email,
    phone,
    country,
    town: str(p.town, 120) || null,
    right_to_work: rightToWork,
    teacher_status: teacherStatus,
    highest_qualification: highestQualification,
    qualifications: str(p.qualifications, 3000) || null,
    islamic_qualifications: str(p.islamicQualifications, 3000) || null,
    subjects,
    year_groups: yearGroups,
    languages: str(p.languages, 300) || null,
    years_experience: yearsExperience,
    online_experience: onlineExperience,
    employment,
    employment_gaps: str(p.employmentGaps, 2000) || null,
    hours_preference: hoursPreference,
    available_days: availableDays,
    earliest_start: str(p.earliestStart, 120) || null,
    notice_period: str(p.noticePeriod, 120) || null,
    has_equipment: p.hasEquipment === true,
    statement,
    why_tga: str(p.whyTga, 3000) || null,
    referees,
    dbs_status: dbsStatus,
    how_heard: str(p.howHeard, 200) || null,
    declaration_name: declarationName,
    declaration_true: true,
    consent_data: true,
    cv_path: cvStored.path,
    cv_filename: cvStored.name,
    documents: stored.filter((s) => s.kind === "document").map(({ path, name, size, type }) => ({ path, name, size, type })),
    ip_hash: ipHash,
  };
  const { data: saved, error: saveError } = await supabase.from("job_applications").insert(row).select("reference").single();
  if (saveError || !saved) {
    console.error("careers-apply insert failed", saveError);
    await supabase.storage.from(BUCKET).remove(stored.map((s) => s.path));
    return jsonResponse({ ok: false, error: "save_failed" }, 500);
  }
  const reference = (saved as { reference: string }).reference;

  // ── emails (best effort: the application is already safe) ──
  const { data: settingsRow } = await supabase.from("recruitment_settings").select("notify_email, attach_cv, auto_acknowledge, auto_screen").eq("id", true).maybeSingle();
  const settings = (settingsRow as { notify_email: string; attach_cv: boolean; auto_acknowledge: boolean; auto_screen: boolean } | null) || { notify_email: FALLBACK_INBOX, attach_cv: true, auto_acknowledge: true, auto_screen: true };
  const fullName = `${firstName} ${lastName}`;

  let emailSent = false;
  if (settings.auto_acknowledge) {
    const ack = await acknowledge(email, fullName, str(p.preferredName, 80) || firstName, reference, vacancyTitle, settings.notify_email, { ...row, reference } as SavedRow);
    emailSent = ack.ok;
    await logEmail(id, ack.ok ? `Acknowledgement sent to ${email}.` : `Could not send the acknowledgement to ${email}: ${ack.detail.slice(0, 300)}`);
  }

  // The AI screening (if on) runs first so the inbox email can include it.
  // It takes a little while, so it runs after the candidate has their answer.
  const attachment = cvBytes && settings.attach_cv && cvBytes.length <= MAX_ATTACH_BYTES ? { bytes: cvBytes, filename: `${reference} CV ${safeName(fullName)}.${cvType}` } : null;
  const afterResponse = async () => {
    let ai: AiScreening | null = null;
    if (settings.auto_screen && screeningConfigured()) {
      const r = await screenApplication(supabase, id, null).catch(() => null);
      if (r && r.ok) ai = r.screening;
    }
    const inbox = await notifyInbox(settings, { ...row, reference }, attachment, ai);
    await logEmail(id, inbox.ok ? `Application summary emailed to ${settings.notify_email}.` : `Could not email the application summary to ${settings.notify_email}: ${inbox.detail.slice(0, 300)}`);
  };
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(afterResponse().catch((e) => console.error("careers-apply background", e)));
  else await afterResponse().catch((e) => console.error("careers-apply background", e));

  return jsonResponse({ ok: true, reference, emailSent });
});

async function logEmail(applicationId: string, body: string) {
  await supabase.from("job_application_events").insert({ application_id: applicationId, kind: "email", body });
}

function candidateCopy(a: SavedRow): string {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? `<span style="color:#888;">Not given</span>` : esc(String(x)).replace(/\n/g, "<br>"));
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#6b6b6b;width:38%;">${esc(label)}</td><td style="padding:4px 0;vertical-align:top;">${value}</td></tr>`;
  const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? esc(xs.join(", ")) : v(""));
  const jobs = a.employment.length
    ? a.employment.map((j) => `${esc(j.role)}, ${esc(j.employer)} (${esc(monthLabel(j.from))} to ${j.current ? "present" : esc(monthLabel(j.to))})`).join("<br>")
    : v("");
  const refs = a.referees.map((r) => `${esc(r.name)}, ${esc(r.organisation)}`).join("<br>");
  return (
    `<h2 style="font-size:15px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid #E3C98F;color:#5E4B1E;">A copy of your application</h2>` +
    `<table style="border-collapse:collapse;width:100%;font-size:14px;">` +
    row("Role", v(a.vacancy_title)) +
    row("Name", v(`${a.first_name} ${a.last_name}`)) +
    row("Email", v(a.email)) +
    row("Phone", v(a.phone)) +
    row("Lives in", v([a.town, a.country].filter(Boolean).join(", "))) +
    row("Right to work", v(LABELS.rightToWork[String(a.right_to_work)])) +
    row("Teacher status", v(LABELS.teacherStatus[String(a.teacher_status)])) +
    row("Highest qualification", v(a.highest_qualification)) +
    row("Subjects", list(a.subjects)) +
    row("Year groups", list(a.year_groups)) +
    row("Employment", jobs) +
    row("Hours", v(LABELS.hours[String(a.hours_preference)])) +
    row("Days available", list(a.available_days)) +
    row("Referees", refs || v("")) +
    row("Documents", `CV${a.documents.length ? ` and ${a.documents.length} supporting document${a.documents.length === 1 ? "" : "s"}` : ""}`) +
    `</table>` +
    `<p style="margin:10px 0 0;font-size:13px;color:#6b6b6b;">If anything here is wrong, reply to this email and we will update it.</p>`
  );
}

async function acknowledge(to: string, fullName: string, callName: string, reference: string, role: string, replyInbox: string, copy: SavedRow) {
  const html = emailShell(
    `<h1 style="font-size:20px;margin:0 0 16px;">Thank you for applying</h1>` +
      `<p style="margin:0 0 14px;line-height:1.55;">Assalamu alaikum ${esc(callName)},</p>` +
      `<p style="margin:0 0 14px;line-height:1.55;">Thank you for applying for <strong>${esc(role)}</strong> at Tarbiyyah Global Academy. We have received your application and your documents.</p>` +
      `<p style="margin:0 0 14px;line-height:1.55;">Your reference is <strong>${esc(reference)}</strong>. Please quote it if you contact us.</p>` +
      `<p style="margin:0 0 6px;line-height:1.55;"><strong>What happens next</strong></p>` +
      `<ol style="margin:0 0 14px;padding-left:20px;line-height:1.55;">` +
      `<li>We read every application carefully against the role.</li>` +
      `<li>If you are shortlisted, we will invite you to an online interview and, for teaching roles, a short sample lesson.</li>` +
      `<li>For shortlisted candidates we take up references and carry out the safer recruitment checks every school must make. We agree the right criminal record checks for where you live, as we recruit internationally.</li>` +
      `</ol>` +
      `<p style="margin:0 0 14px;line-height:1.55;">If you have any questions, reply to this email or write to <a href="mailto:${esc(replyInbox)}" style="color:#5E4B1E;">${esc(replyInbox)}</a>.</p>` +
      `<p style="margin:0;line-height:1.55;">JazakAllahu khayran,<br>Tarbiyyah Global Academy</p>` +
      candidateCopy(copy),
    `We have received your application (${reference}).`,
  );
  try {
    return await sendEmail({ to, toName: fullName, subject: `Application received: ${role} (${reference}) | Tarbiyyah Global Academy`, html });
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

type SavedRow = Record<string, unknown> & {
  reference: string;
  vacancy_title: string;
  first_name: string;
  last_name: string;
  employment: Job[];
  referees: Referee[];
  documents: { name: string }[];
};

async function notifyInbox(settings: { notify_email: string }, a: SavedRow, attachment: { bytes: Uint8Array; filename: string } | null, ai: AiScreening | null) {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? `<span style="color:#888;">Not given</span>` : esc(String(x)).replace(/\n/g, "<br>"));
  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 12px 5px 0;vertical-align:top;color:#6b6b6b;width:38%;">${esc(label)}</td><td style="padding:5px 0;vertical-align:top;">${value}</td></tr>`;
  const section = (title: string, rows: string) =>
    `<h2 style="font-size:15px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid #E3C98F;color:#5E4B1E;">${esc(title)}</h2><table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>`;
  const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? esc(xs.join(", ")) : v(""));

  const jobs = a.employment.length
    ? a.employment
        .map((j) => `<li style="margin:0 0 8px;"><strong>${esc(j.role)}</strong>, ${esc(j.employer)}<br><span style="color:#555;">${esc(monthLabel(j.from))} to ${j.current ? "present" : esc(monthLabel(j.to))}</span>${j.reason ? `<br><span style="color:#555;">Reason for leaving: ${esc(j.reason)}</span>` : ""}</li>`)
        .join("")
    : `<li>No previous employment given.</li>`;
  const refs = a.referees
    .map(
      (r, i) =>
        `<li style="margin:0 0 10px;"><strong>Referee ${i + 1}: ${esc(r.name)}</strong>${r.position ? `, ${esc(r.position)}` : ""}<br>${esc(r.organisation)} · ${esc(r.relationship)}<br><a href="mailto:${esc(r.email)}" style="color:#5E4B1E;">${esc(r.email)}</a>${r.phone ? ` · ${esc(r.phone)}` : ""}<br><span style="color:#555;">${r.contactBeforeInterview ? "May be contacted before interview" : "Do NOT contact before interview"}</span></li>`,
    )
    .join("");

  const REC: Record<string, string> = { strong: "Strong match", possible: "Possible", unlikely: "Unlikely" };
  const bullets = (xs: string[]) => (xs.length ? `<ul style="margin:4px 0 0;padding-left:20px;">${xs.map((x) => `<li style="margin:0 0 4px;">${esc(x)}</li>`).join("")}</ul>` : `<span style="color:#888;">None noted</span>`);
  const aiBlock = ai
    ? `<div style="margin:18px 0 0;padding:14px 16px;border:1px solid #E3C98F;border-radius:10px;background:#FBF7EE;">` +
      `<p style="margin:0 0 6px;font-size:13px;color:#5E4B1E;"><strong>AI first read: ${ai.score}/100 · ${esc(REC[ai.recommendation] || ai.recommendation)}</strong>${ai.cv_read ? "" : " (CV not read)"}</p>` +
      `<p style="margin:0 0 8px;line-height:1.5;">${esc(ai.summary)}</p>` +
      (ai.subjects_fit ? `<p style="margin:0 0 8px;line-height:1.5;"><strong>Subjects:</strong> ${esc(ai.subjects_fit)}</p>` : "") +
      `<p style="margin:8px 0 0;"><strong>Strengths</strong></p>${bullets(ai.strengths)}` +
      `<p style="margin:8px 0 0;"><strong>Concerns</strong></p>${bullets(ai.concerns)}` +
      `<p style="margin:8px 0 0;"><strong>To check</strong></p>${bullets(ai.checks)}` +
      `<p style="margin:10px 0 0;font-size:12px;color:#6b6b6b;">Advisory only: it doesn't see the candidate's name, contact details or location, and a person makes every decision. Interview questions are in the portal.</p>` +
      `</div>`
    : "";
  const html = emailShell(
    `<p style="margin:0 0 4px;font-size:13px;color:#6b6b6b;">New job application · ${esc(a.reference)}</p>` +
      `<h1 style="font-size:22px;margin:0 0 4px;">${esc(`${a.first_name} ${a.last_name}`)}</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;">for <strong>${esc(a.vacancy_title)}</strong></p>` +
      aiBlock +
      `<p style="margin:16px 0 8px;"><a href="${LEARN_SITE_URL}/admin/recruitment/?app=${encodeURIComponent(String(a.id))}" style="display:inline-block;background:#B08E45;color:#1B1E21;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;">Open in the portal</a></p>` +
      section(
        "1. Personal details",
        row("Name", v(`${a.title ? `${a.title} ` : ""}${a.first_name} ${a.last_name}${a.preferred_name ? ` (known as ${a.preferred_name})` : ""}`)) +
          row("Email", `<a href="mailto:${esc(String(a.email))}" style="color:#5E4B1E;">${esc(String(a.email))}</a>`) +
          row("Phone", v(a.phone)) +
          row("Lives in", v([a.town, a.country].filter(Boolean).join(", "))) +
          row("Right to work", v(LABELS.rightToWork[String(a.right_to_work)])),
      ) +
      section(
        "2. Qualifications",
        row("Teacher status", v(LABELS.teacherStatus[String(a.teacher_status)])) +
          row("Highest qualification", v(a.highest_qualification)) +
          row("Other qualifications", v(a.qualifications)) +
          row("Islamic qualifications / ijazah", v(a.islamic_qualifications)) +
          row("Subjects", list(a.subjects)) +
          row("Year groups", list(a.year_groups)) +
          row("Languages", v(a.languages)),
      ) +
      section(
        "3. Experience",
        row("Teaching experience", v(LABELS.yearsExperience[String(a.years_experience)])) +
          row("Online teaching", v(LABELS.onlineExperience[String(a.online_experience)])) +
          `<tr><td colspan="2" style="padding:6px 0;"><ul style="margin:4px 0 0;padding-left:20px;">${jobs}</ul></td></tr>` +
          row("Gaps in employment", v(a.employment_gaps)),
      ) +
      section(
        "4. Availability",
        row("Hours", v(LABELS.hours[String(a.hours_preference)])) +
          row("Days available", list(a.available_days)) +
          row("Earliest start", v(a.earliest_start)) +
          row("Notice period", v(a.notice_period)) +
          row("Computer, camera and reliable internet", a.has_equipment ? "Yes" : "No / not confirmed"),
      ) +
      section("5. Supporting statement", `<tr><td style="padding:6px 0;line-height:1.55;">${v(a.statement)}</td></tr>${a.why_tga ? `<tr><td style="padding:10px 0 0;line-height:1.55;"><strong>Why Tarbiyyah Global Academy:</strong><br>${v(a.why_tga)}</td></tr>` : ""}`) +
      section("6. References", `<tr><td style="padding:6px 0;"><ul style="margin:0;padding-left:20px;">${refs}</ul></td></tr>`) +
      section(
        "7. Checks and declarations",
        row("Criminal record check", v(LABELS.dbs[String(a.dbs_status)])) +
          row("Heard about us", v(a.how_heard)) +
          row("Declaration signed by", v(a.declaration_name)) +
          row("Documents", `CV: ${attachment ? "attached to this email" : "in the portal"}${a.documents.length ? `<br>Supporting: ${a.documents.map((d) => esc(d.name)).join(", ")} (in the portal)` : ""}`),
      ) +
      `<p style="margin:22px 0 0;font-size:12px;color:#777;">This email contains a candidate's personal data. Please don't forward it outside the recruitment panel, and delete it once the decision is recorded in the portal.</p>`,
    `${a.first_name} ${a.last_name} applied for ${a.vacancy_title}`,
  );
  try {
    return await sendEmail({
      to: settings.notify_email,
      subject: `New job application: ${a.reference} · ${a.first_name} ${a.last_name} · ${a.vacancy_title}${ai ? ` · AI ${ai.score}/100` : ""}`,
      html,
      attachments: attachment ? [{ filename: attachment.filename, content: toBase64(attachment.bytes) }] : undefined,
    });
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}
