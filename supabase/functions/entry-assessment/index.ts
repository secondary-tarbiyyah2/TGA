// TGA entry assessment: issuing, sitting and marking.
//
// Deployed with verify_jwt = false because candidates (applicants, often with
// no account yet) sit the test from a one-time link. Two kinds of caller:
//
//  Staff (Authorization: Bearer <user jwt>, Headteacher/Admin/Admissions):
//    create   { applicationId? | childId? | candidateName, year, dob?, eal?, sendNotes?,
//               access?: { extraTimePct?, readAloud?, largeText?, other? }, invigilator?, skip?, email? }
//             -> { ok, id, link, emailed }
//    reissue  { id, newPaper? }      -> { ok, link }   (new link; optionally a fresh paper)
//    email    { id, to? }            -> { ok }
//    void     { id }
//    mark     { id, section: "writing" | "quran" | "arabic", data }  -> { ok, report }
//    recompute{ id }
//
//  Candidate ({ token }):
//    state         { token, device?, timezone? } -> the current section WITHOUT answers
//    start_section { token }
//    answer        { token, itemId, value, ms? }
//    event         { token, type }                 (tab hidden/visible etc., for the integrity notes)
//    submit_section{ token }
//
// The paper (with answers) never leaves the server; timing is enforced from
// server timestamps, so changing the clock or reloading the page doesn't help.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";
import { toPublic } from "../_shared/assess/core.ts";
import { buildForm, type Form, newSeed, type SectionKey } from "../_shared/assess/form.ts";
import { buildReport, type Responses, type TeacherMarks } from "../_shared/assess/score.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEARN = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const STAFF = ["head_teacher", "admin", "admissions"];
const GRACE_MS = 20_000;
const UUID = /^[0-9a-f-]{36}$/i;

type Row = {
  id: string; application_id: string | null; child_id: string | null; candidate_name: string; year: number; dob: string | null;
  eal: boolean; send_notes: string | null; access: Record<string, unknown>; seed: number; form: Form; token_hash: string | null; expires_at: string;
  status: string; section_index: number; section_started_at: string | null; sections_log: { key: string; started: string; ended: string; timedOut: boolean }[];
  responses: Responses; events: { t: string; type: string; section?: string }[]; marks: TeacherMarks; report: unknown; started_at: string | null; submitted_at: string | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkFor = (token: string) => `${LEARN}/assessment/?t=${token}`;

async function staffUser(auth: string | null) {
  if (!auth) return null;
  const c = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await c.auth.getUser();
  if (!data?.user) return null;
  const { data: roles } = await c.from("user_roles").select("role").eq("user_id", data.user.id);
  return (roles || []).some((r) => STAFF.includes(r.role as string)) ? data.user : null;
}

// ── helpers for the candidate flow ─────────────────────────────────────────
const candidateSections = (f: Form) => f.sections.map((s, i) => ({ s, i })).filter((x) => x.s.candidate && x.s.items.length > 0);
function currentSection(row: Row) {
  const cs = candidateSections(row.form);
  return cs.find((x) => x.i >= row.section_index) || null;
}
const msAllowed = (row: Row, minutes: number) => minutes * 60_000;

/** If the running section's time is up, close it (unanswered = wrong) and move on. */
async function enforceTime(row: Row): Promise<Row> {
  const cur = currentSection(row);
  if (!cur || !row.section_started_at) return row;
  const elapsed = Date.now() - new Date(row.section_started_at).getTime();
  if (elapsed <= msAllowed(row, cur.s.minutes) + GRACE_MS) return row;
  return await closeSection(row, true);
}

async function closeSection(row: Row, timedOut: boolean): Promise<Row> {
  const cur = currentSection(row);
  if (!cur) return row;
  const log = [...row.sections_log, { key: cur.s.key, started: row.section_started_at || new Date().toISOString(), ended: new Date().toISOString(), timedOut }];
  const next = candidateSections(row.form).find((x) => x.i > cur.i);
  const patch: Record<string, unknown> = { sections_log: log, section_index: next ? next.i : row.form.sections.length, section_started_at: null, updated_at: new Date().toISOString() };
  if (!next) {
    patch.status = "submitted";
    patch.submitted_at = new Date().toISOString();
  }
  const { data } = await db.from("entry_assessments").update(patch).eq("id", row.id).select("*").single();
  let updated = data as Row;
  if (!next) updated = await recompute(updated);
  return updated;
}

function integrityOf(row: Row) {
  const hidden = row.events.filter((e) => e.type === "hidden" && e.section).length;
  const ms = Object.values(row.responses).map((r) => r.ms ?? 99999);
  const fastAnswers = ms.filter((m) => m < 2000).length;
  const titles = new Map(row.form.sections.map((s) => [s.key, s.title]));
  return { hidden, fastAnswers, timedOutSections: row.sections_log.filter((l) => l.timedOut).map((l) => titles.get(l.key as SectionKey) || l.key) };
}

async function recompute(row: Row): Promise<Row> {
  if (!["submitted", "complete"].includes(row.status)) return row;
  const integ = integrityOf(row);
  let ageMonths: number | null = null, summerBorn = false;
  if (row.dob) {
    const b = new Date(row.dob), t = new Date(row.submitted_at || Date.now());
    ageMonths = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth()) - (t.getDate() < b.getDate() ? 1 : 0);
    summerBorn = [5, 6, 7].includes(b.getMonth()); // June, July, August: youngest in the year group
  }
  const a = (row.access || {}) as { extraTimePct?: number; readAloud?: boolean };
  const report = buildReport(row.form, row.responses || {}, row.marks || {},
    { year: row.year, ageMonths, summerBorn, eal: row.eal, send: row.send_notes, extraTimePct: a.extraTimePct, readAloud: a.readAloud },
    { tabHides: integ.hidden, timedOutSections: integ.timedOutSections });
  const complete = report.pending.length === 0;
  // Cohort comparison: only once there are enough sittings in the same year to mean something.
  let cohort: Record<string, number> | null = null;
  const { data: peers } = await db.from("entry_assessments").select("report").eq("year", row.year).eq("status", "complete").neq("id", row.id).limit(2000);
  const reps = ((peers || []) as { report: { estimates?: { area: string; workingAt: number }[] } | null }[]).map((p) => p.report?.estimates || []);
  if (reps.length >= 20) {
    cohort = { n: reps.length };
    for (const e of report.estimates) {
      const vals = reps.map((r) => r.find((x) => x.area === e.area)?.workingAt).filter((v): v is number => typeof v === "number");
      if (vals.length >= 20) cohort[e.area] = Math.round((vals.filter((v) => v < e.workingAt).length + 0.5 * vals.filter((v) => v === e.workingAt).length) / vals.length * 100);
    }
  }
  const { data } = await db.from("entry_assessments").update({
    report, cohort, status: complete ? "complete" : "submitted", completed_at: complete ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id", row.id).select("*").single();
  return data as Row;
}

function publicState(row: Row) {
  const f = row.form;
  const cur = currentSection(row);
  const done = new Set(row.sections_log.map((l) => l.key));
  const base = {
    ok: true,
    firstName: row.candidate_name.split(" ")[0],
    year: row.year,
    status: row.status,
    readAloud: f.readAloud || !!(row.access as { readAloud?: boolean }).readAloud,
    largeText: !!(row.access as { largeText?: boolean }).largeText,
    sections: f.sections.filter((s) => s.candidate && s.items.length).map((s) => ({ key: s.key, title: s.title, minutes: s.minutes, questions: s.items.length, done: done.has(s.key) })),
  };
  if (!cur || row.status === "submitted" || row.status === "complete") return { ...base, finished: true };
  const started = row.section_started_at ? new Date(row.section_started_at).getTime() : null;
  const remaining = started ? Math.max(0, Math.round((msAllowed(row, cur.s.minutes) - (Date.now() - started)) / 1000)) : cur.s.minutes * 60;
  const answers: Record<string, unknown> = {};
  for (const it of cur.s.items) if (row.responses[it.id] !== undefined) answers[it.id] = row.responses[it.id].value;
  return {
    ...base,
    finished: false,
    current: {
      key: cur.s.key, title: cur.s.title, intro: cur.s.intro, minutes: cur.s.minutes, started: !!started, remaining,
      passages: cur.s.passages || [], writingPrompt: cur.s.writingPrompt ? { title: cur.s.writingPrompt.title, prompt: cur.s.writingPrompt.prompt } : undefined,
      items: started ? cur.s.items.map(toPublic) : [],
      answers,
    },
  };
}

async function byToken(token: unknown): Promise<Row | null> {
  if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) return null;
  const { data } = await db.from("entry_assessments").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  return (data as Row) || null;
}

async function emailLink(row: Row, to: string, toName: string, token: string) {
  const first = row.candidate_name.split(" ")[0];
  const expires = new Date(row.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const total = row.form.sections.filter((s) => s.candidate && s.items.length).reduce((p, s) => p + s.minutes, 0);
  return await sendEmail({
    to, toName,
    subject: `${first}'s entry assessment — Tarbiyyah Global Academy`,
    html: emailShell(`<h1 style="font-size:20px;margin:0 0 16px;">${esc(first)}'s entry assessment</h1>
<p>Assalamu alaikum ${esc(toName.split(" ")[0])},</p>
<p>Here is ${esc(first)}'s entry assessment for Year ${row.year}. It takes about ${total} minutes in timed parts, and ${esc(first)} can take a break between parts. It helps us place ${esc(first)} in the right groups from day one; there is nothing to revise.</p>
<p style="margin:24px 0;"><a href="${linkFor(token)}" style="background:#B08E45;color:#1B1E21;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;">Open the assessment</a></p>
<ul style="padding-left:18px;color:#444;">
<li>Use a laptop, desktop or tablet in a quiet room, with headphones or speakers for the younger children's spoken questions.</li>
<li>${row.year <= 2 ? "You may help with the mouse or reading the screen's buttons, but please don't help with the answers." : "Please don't help with the answers — we want to see what " + esc(first) + " can do on their own."}</li>
<li>The Writing, Qur'an and Arabic parts are done with a teacher on your family call.</li>
<li>The link works until ${expires}. It is for ${esc(first)} only.</li>
</ul>`),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body.action || "");

  // ── candidate actions ──
  if (["state", "start_section", "answer", "event", "submit_section"].includes(action)) {
    let row = await byToken(body.token);
    if (!row) return jsonResponse({ ok: false, error: "not_found" }, 404);
    if (row.status === "void") return jsonResponse({ ok: false, error: "void" }, 410);
    if (new Date(row.expires_at).getTime() < Date.now() && row.status === "issued") return jsonResponse({ ok: false, error: "expired" }, 410);
    row = await enforceTime(row);

    if (action === "state") {
      if (!row.started_at) {
        const patch: Record<string, unknown> = { started_at: new Date().toISOString(), status: "in_progress" };
        if (typeof body.device === "string") patch.device = body.device.slice(0, 300);
        if (typeof body.timezone === "string") patch.timezone = body.timezone.slice(0, 80);
        const { data } = await db.from("entry_assessments").update(patch).eq("id", row.id).select("*").single();
        row = data as Row;
      }
      return jsonResponse(publicState(row));
    }
    const cur = currentSection(row);
    if (action === "event") {
      const type = String(body.type || "").slice(0, 30);
      if (!["hidden", "visible", "blur", "focus", "resize", "copy", "paste"].includes(type)) return jsonResponse({ ok: false, error: "validation" }, 400);
      const events = [...row.events, { t: new Date().toISOString(), type, section: row.section_started_at ? cur?.s.key : undefined }].slice(-500);
      await db.from("entry_assessments").update({ events }).eq("id", row.id);
      return jsonResponse({ ok: true });
    }
    if (!cur || row.status === "submitted" || row.status === "complete") return jsonResponse(publicState(row));
    if (action === "start_section") {
      if (!row.section_started_at) {
        const { data } = await db.from("entry_assessments").update({ section_started_at: new Date().toISOString(), status: "in_progress" }).eq("id", row.id).select("*").single();
        row = data as Row;
      }
      return jsonResponse(publicState(row));
    }
    if (action === "answer") {
      if (!row.section_started_at) return jsonResponse({ ok: false, error: "not_started" }, 409);
      const itemId = String(body.itemId || "");
      const item = cur.s.items.find((i) => i.id === itemId);
      if (!item) return jsonResponse({ ok: false, error: "wrong_section" }, 409);
      let value = body.value;
      if (typeof value === "string") value = value.slice(0, item.type === "text" ? 12000 : 200);
      else if (typeof value !== "number" && value !== null) return jsonResponse({ ok: false, error: "validation" }, 400);
      const ms = Number(body.ms);
      const responses = { ...row.responses, [itemId]: { value, ms: Number.isFinite(ms) ? Math.max(0, Math.min(ms, 3_600_000)) : undefined } };
      await db.from("entry_assessments").update({ responses, updated_at: new Date().toISOString() }).eq("id", row.id);
      return jsonResponse({ ok: true });
    }
    if (action === "submit_section") {
      if (!row.section_started_at) return jsonResponse({ ok: false, error: "not_started" }, 409);
      row = await closeSection(row, false);
      return jsonResponse(publicState(row));
    }
  }

  // ── staff actions ──
  const user = await staffUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  if (action === "create") {
    let name = String(body.candidateName || "").trim();
    let dob: string | null = typeof body.dob === "string" && body.dob ? body.dob : null;
    let year = Number(body.year);
    let sendNotes: string | null = typeof body.sendNotes === "string" ? body.sendNotes.slice(0, 3000) : null;
    let parentEmail: string | null = null, parentName = "";
    const applicationId = typeof body.applicationId === "string" && UUID.test(body.applicationId) ? body.applicationId : null;
    const childId = typeof body.childId === "string" && UUID.test(body.childId) ? body.childId : null;
    if (applicationId) {
      const { data: app } = await db.from("admissions_applications").select("child_first_name, child_last_name, child_dob, year_group_applying, send_or_medical_notes, parent_email, parent_name, child_id").eq("id", applicationId).maybeSingle();
      if (!app) return jsonResponse({ ok: false, error: "not_found" }, 404);
      name ||= `${app.child_first_name} ${app.child_last_name}`;
      dob ||= app.child_dob;
      if (!Number.isFinite(year) || year < 1) year = Number(String(app.year_group_applying).match(/\d+/)?.[0]);
      sendNotes ||= app.send_or_medical_notes;
      parentEmail = app.parent_email; parentName = app.parent_name;
    } else if (childId) {
      const { data: ch } = await db.from("children").select("name, dob, year_groups(name), parent_user_id").eq("id", childId).maybeSingle();
      if (!ch) return jsonResponse({ ok: false, error: "not_found" }, 404);
      name ||= ch.name as string;
      dob ||= ch.dob as string;
      if (!Number.isFinite(year) || year < 1) year = Number(String((ch as { year_groups?: { name?: string } }).year_groups?.name || "").match(/\d+/)?.[0]);
    }
    if (!name || !Number.isFinite(year) || year < 1 || year > 11) return jsonResponse({ ok: false, error: "validation", detail: "Name and a year group from 1 to 11 are needed." }, 400);
    const access = (body.access && typeof body.access === "object" ? body.access : {}) as { extraTimePct?: number; readAloud?: boolean; largeText?: boolean; other?: string };
    const extra = Math.max(0, Math.min(100, Number(access.extraTimePct) || 0));
    const skip = (Array.isArray(body.skip) ? body.skip : []).filter((k): k is SectionKey => ["maths", "english", "reasoning", "writing", "quran", "arabic"].includes(String(k)));
    const seed = newSeed(name);
    const form = buildForm(year, seed, { extraTimePct: extra, readAloud: !!access.readAloud, skip });
    const token = generateToken();
    const { data: ins, error } = await db.from("entry_assessments").insert({
      application_id: applicationId, child_id: childId, candidate_name: name, year, dob, eal: !!body.eal, send_notes: sendNotes,
      access: { extraTimePct: extra || undefined, readAloud: !!access.readAloud || undefined, largeText: !!access.largeText || undefined, other: typeof access.other === "string" ? access.other.slice(0, 200) : undefined },
      seed, form, token_hash: await hashToken(token), invigilator: typeof body.invigilator === "string" ? body.invigilator.slice(0, 120) : null, created_by: user.id,
    }).select("*").single();
    if (error || !ins) return jsonResponse({ ok: false, error: "create_failed", detail: error?.message }, 500);
    if (applicationId) await db.from("admissions_applications").update({ status: "assessment" }).eq("id", applicationId).eq("status", "new");
    let emailed = false;
    const to = typeof body.email === "string" && body.email.includes("@") ? body.email : body.email === true ? parentEmail : null;
    if (to) emailed = !!(await emailLink(ins as Row, to, parentName || "Parent", token))?.ok;
    return jsonResponse({ ok: true, id: (ins as Row).id, link: linkFor(token), emailed });
  }

  const id = String(body.id || "");
  if (!UUID.test(id)) return jsonResponse({ ok: false, error: "validation" }, 400);
  const { data: found } = await db.from("entry_assessments").select("*").eq("id", id).maybeSingle();
  if (!found) return jsonResponse({ ok: false, error: "not_found" }, 404);
  let row = found as Row;

  if (action === "reissue") {
    const token = generateToken();
    const patch: Record<string, unknown> = { token_hash: await hashToken(token), expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), updated_at: new Date().toISOString() };
    if (body.newPaper) {
      const seed = newSeed(row.candidate_name);
      const a = row.access as { extraTimePct?: number; readAloud?: boolean };
      Object.assign(patch, { seed, form: buildForm(row.year, seed, { extraTimePct: a.extraTimePct, readAloud: a.readAloud }), status: "issued", section_index: 0, section_started_at: null, sections_log: [], responses: {}, events: [], report: null, cohort: null, started_at: null, submitted_at: null, completed_at: null });
    } else if (row.status === "void") patch.status = row.submitted_at ? "submitted" : row.started_at ? "in_progress" : "issued";
    await db.from("entry_assessments").update(patch).eq("id", id);
    return jsonResponse({ ok: true, link: linkFor(token) });
  }
  if (action === "email") {
    // A fresh link is needed to email (the old token isn't stored).
    const token = generateToken();
    await db.from("entry_assessments").update({ token_hash: await hashToken(token) }).eq("id", id);
    let to = typeof body.to === "string" ? body.to : "", toName = "Parent";
    if (!to && row.application_id) {
      const { data: app } = await db.from("admissions_applications").select("parent_email, parent_name").eq("id", row.application_id).maybeSingle();
      to = app?.parent_email || ""; toName = app?.parent_name || toName;
    }
    if (!to.includes("@")) return jsonResponse({ ok: false, error: "validation", detail: "No email address to send to." }, 400);
    const res = await emailLink(row, to, toName, token);
    return jsonResponse({ ok: !!res?.ok, link: linkFor(token), error: res?.ok ? undefined : "email_failed", detail: (res as { detail?: string } | undefined)?.detail });
  }
  if (action === "void") {
    await db.from("entry_assessments").update({ status: "void", updated_at: new Date().toISOString() }).eq("id", id);
    return jsonResponse({ ok: true });
  }
  if (action === "mark") {
    const section = String(body.section || "");
    if (!["writing", "quran", "arabic"].includes(section) || typeof body.data !== "object" || !body.data) return jsonResponse({ ok: false, error: "validation" }, 400);
    const d = body.data as Record<string, unknown>;
    const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const stamp = { markedBy: user.email || user.id, markedAt: new Date().toISOString(), notes: typeof d.notes === "string" ? d.notes.slice(0, 2000) : undefined };
    const marks = { ...(row.marks || {}) } as TeacherMarks;
    if (section === "writing") {
      const scores: Record<string, number> = {};
      for (const [k, v] of Object.entries((d.scores as Record<string, unknown>) || {})) if (/^[a-z]{2,20}$/.test(k)) scores[k] = clamp(v, 0, 4);
      marks.writing = { scores, ...stamp };
    } else if (section === "arabic") {
      const sc = ((d.scores as Record<string, unknown>) || d) as Record<string, unknown>;
      marks.arabic = { letters: clamp(sc.letters, 0, 2), vowelled: clamp(sc.vowelled, 0, 4), unvowelled: clamp(sc.unvowelled, 0, 4), understanding: clamp(sc.understanding, 0, 4), speaking: clamp(sc.speaking, 0, 4), ...stamp };
    } else {
      marks.quran = { stage: clamp(d.stage, 0, 6), tajweed: clamp(d.tajweed, 0, 4), fluency: clamp(d.fluency, 0, 4), juz: clamp(d.juz, 0, 30), lastSurah: typeof d.lastSurah === "string" ? d.lastSurah.slice(0, 80) : undefined, ...stamp };
    }
    const { data } = await db.from("entry_assessments").update({ marks, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    row = data as Row;
    // Live sections can be marked before the on-screen part is finished; the report waits for both.
    row = await recompute(row);
    return jsonResponse({ ok: true, report: row.report, status: row.status });
  }
  if (action === "recompute") {
    row = await recompute(row);
    return jsonResponse({ ok: true, report: row.report, status: row.status });
  }
  return jsonResponse({ ok: false, error: "unknown_action" }, 400);
});
