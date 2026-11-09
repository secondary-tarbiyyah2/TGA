// TGA entry assessment: issuing, sitting and marking.
//
// Deployed with verify_jwt = false because candidates (applicants, often with
// no account yet) sit the test from a one-time link. Two kinds of caller:
//
//  Staff (Authorization: Bearer <user jwt>, Headteacher/Admin/Admissions):
//    create   { applicationId? | childId? | candidateName, year, dob?, eal?, sendNotes?,
//               access?: { extraTimePct?, readAloud?, largeText?, breaks?: { perSection?, minutes? }, other? },
//               invigilator?, skip?, email? }
//             -> { ok, id, link, emailed }
//    reissue  { id, newPaper? }      -> { ok, link }   (new link; optionally a fresh paper)
//    email    { id, to? }            -> { ok }
//    void     { id }
//    mark     { id, section: "writing" | "quran" | "arabic", data }  -> { ok, report }
//             writing data: { scores, notes?, overall?, overrideReason?, basedOn? (first-mark id) }
//    ai_mark  { id }                 -> { ok, mark }   (first-mark the writing again: AI, or an estimate)
//    recompute{ id }
//
//  Candidate ({ token, session }):
//    state         { token, session?, takeover?, device?, timezone? } -> the current part WITHOUT answers (+ a new session token if one is issued)
//    ping          { token, session }             -> time left from the server (the page's clock is display only)
//    start_section { token, session }
//    answer        { token, session, itemId, value, ms? }
//    event         { token, session, type, detail? }   (window left, copy/paste tried etc., for the integrity notes)
//    break_start   { token, session }             (clock pauses, questions hidden)
//    break_end     { token, session }
//    submit_section{ token, session }
//
// The paper (with answers) never leaves the server; timing is enforced from
// server timestamps, so changing the clock or reloading the page doesn't help.
// Only one window can answer at a time: the page holds a session token, and a
// second window must take over (which is noted) before it can answer.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";
import { toPublic } from "../_shared/assess/core.ts";
import { type BreakRules, breakRulesFor, buildForm, type Form, newSeed, type SectionKey } from "../_shared/assess/form.ts";
import { type BandName, buildReport, type Responses, type TeacherMarks } from "../_shared/assess/score.ts";
import { type AssessEvent, type BreakLog, type SectionLog, countLeaves, summariseIntegrity } from "../_shared/assess/integrity.ts";
import { aiMarkWriting, BANDS, bandOfMean, estimateWriting, redactNames, WRITING_STRANDS, type WritingMark } from "../_shared/assess/writing.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEARN = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const AI_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const STAFF = ["head_teacher", "admin", "admissions"];
const GRACE_MS = 20_000;
/** A window that has checked in this recently is treated as still open. */
const LIVE_WINDOW_MS = 90_000;
const UUID = /^[0-9a-f-]{36}$/i;
const TOKEN = /^[a-f0-9]{48}$/;
const CLIENT_EVENTS = ["hidden", "visible", "blur", "focus", "resize", "copy", "cut", "paste", "contextmenu", "shortcut", "print", "fullscreen_exit", "fullscreen_enter", "fullscreen_unavailable"];

type Row = {
  id: string; application_id: string | null; child_id: string | null; candidate_name: string; year: number; dob: string | null;
  eal: boolean; send_notes: string | null; access: Record<string, unknown>; seed: number; form: Form; token_hash: string | null; expires_at: string;
  status: string; section_index: number; section_started_at: string | null; sections_log: SectionLog[];
  responses: Responses & Record<string, { value: unknown; ms?: number; t?: string; g?: number; n?: number }>; events: AssessEvent[]; marks: TeacherMarks; report: unknown;
  started_at: string | null; submitted_at: string | null; breaks: BreakLog[] | null; break_started_at: string | null; device: string | null;
};
/** leaveLimit: end the running part once the pupil has left it this many times (staff choice, off by default). */
type Access = { extraTimePct?: number; readAloud?: boolean; largeText?: boolean; breaks?: Partial<BreakRules>; other?: string; leaveLimit?: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkFor = (token: string) => `${LEARN}/assessment/?t=${token}`;
const nowIso = () => new Date().toISOString();

async function staffUser(auth: string | null) {
  if (!auth) return null;
  const c = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await c.auth.getUser();
  if (!data?.user) return null;
  const { data: roles } = await c.from("user_roles").select("role").eq("user_id", data.user.id);
  return (roles || []).some((r) => STAFF.includes(r.role as string)) ? data.user : null;
}

/** Run work after the reply is sent when the runtime allows it (Supabase Edge), else wait for it. */
async function later(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p.catch(() => {}));
  else await p.catch(() => {});
}

// ── helpers for the candidate flow ─────────────────────────────────────────
const candidateSections = (f: Form) => f.sections.map((s, i) => ({ s, i })).filter((x) => x.s.candidate && x.s.items.length > 0);
function currentSection(row: Row) {
  const cs = candidateSections(row.form);
  return cs.find((x) => x.i >= row.section_index) || null;
}
const breaksOf = (row: Row): BreakLog[] => (Array.isArray(row.breaks) ? row.breaks : []);
const rulesOf = (row: Row): BreakRules => breakRulesFor(row.form);

/** Breaks taken in the running part. */
function sectionBreaks(row: Row, key: string) {
  const since = row.section_started_at ? new Date(row.section_started_at).getTime() : Infinity;
  return breaksOf(row).filter((b) => b.section === key && new Date(b.start).getTime() >= since);
}
/** Time the clock was paused in the running part: each break counts up to its allowance. */
function pausedMs(row: Row, key: string, now = Date.now()) {
  return sectionBreaks(row, key).reduce((p, b) => p + Math.min((b.end ? new Date(b.end).getTime() : now) - new Date(b.start).getTime(), b.allowedMs), 0);
}
function elapsedMs(row: Row, key: string, now = Date.now()) {
  if (!row.section_started_at) return 0;
  return now - new Date(row.section_started_at).getTime() - pausedMs(row, key, now);
}
const openBreak = (row: Row) => breaksOf(row).find((b) => !b.end) || null;

async function patchRow(row: Row, patch: Record<string, unknown>): Promise<Row> {
  const { data } = await db.from("entry_assessments").update({ ...patch, updated_at: nowIso() }).eq("id", row.id).select("*").single();
  return (data as Row) || row;
}
function withEvents(row: Row, evs: AssessEvent[]): AssessEvent[] {
  return [...(row.events || []), ...evs].slice(-1500);
}
/** Append one event atomically (falls back to a plain update if the 0120 functions aren't there yet). */
async function addEvent(row: Row, ev: AssessEvent) {
  const { error } = await db.rpc("entry_assessment_add_event", { p_id: row.id, p_event: ev });
  if (error) await db.from("entry_assessments").update({ events: withEvents(row, [ev]) }).eq("id", row.id);
}

/** If the running part's time is up, close it (unanswered = wrong) and move on. */
async function enforceTime(row: Row): Promise<Row> {
  const cur = currentSection(row);
  if (!cur || !row.section_started_at) return row;
  if (elapsedMs(row, cur.s.key) <= cur.s.minutes * 60_000 + GRACE_MS) return row;
  return await closeSection(row, true);
}

async function closeSection(row: Row, timedOut: boolean, leftLimit = false): Promise<Row> {
  const cur = currentSection(row);
  if (!cur) return row;
  const t = nowIso();
  const breaks = breaksOf(row).map((b) => (b.end ? b : { ...b, end: t }));
  const log: SectionLog[] = [...row.sections_log, { key: cur.s.key, started: row.section_started_at || t, ended: t, timedOut, ...(leftLimit ? { leftLimit: true } : {}) }];
  const next = candidateSections(row.form).find((x) => x.i > cur.i);
  const patch: Record<string, unknown> = { sections_log: log, breaks, break_started_at: null, section_index: next ? next.i : row.form.sections.length, section_started_at: null };
  if (!next) {
    patch.status = "submitted";
    patch.submitted_at = t;
  }
  let updated = await patchRow(row, patch);
  // Writing: first-mark it (AI or estimate), which then rebuilds the report itself,
  // so the report never misses the first mark.
  if (cur.s.key === "writing") {
    await later(firstMarkWriting(updated.id));
    return updated;
  }
  if (!next) updated = await recompute(updated);
  return updated;
}

// ── writing: first mark (AI or estimate), then staff ───────────────────────
type MarkRow = {
  id: string; source: "ai" | "estimate" | "staff"; status: string; model: string | null; strands: Record<string, { score: number; comment?: string }>; overall: BandName | null;
  working_at: number | null; feedback: string | null; next_steps: string[]; flags: string[]; confidence: string | null; word_count: number | null; created_at: string;
};
async function latestFirstMark(id: string): Promise<(WritingMark & { id: string; createdAt: string }) | null> {
  const { data } = await db.from("entry_assessment_writing_marks").select("*").eq("assessment_id", id).in("source", ["ai", "estimate"]).eq("status", "ok").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const m = data as MarkRow | null;
  if (!m || !m.overall) return null;
  return {
    id: m.id, createdAt: m.created_at, source: m.source === "ai" ? "ai" : "estimate", model: m.model || undefined, strands: m.strands, overall: m.overall,
    workingAt: Number(m.working_at), feedback: m.feedback || "", nextSteps: m.next_steps || [], flags: m.flags || [], confidence: (m.confidence as WritingMark["confidence"]) || undefined, wordCount: m.word_count || 0,
  };
}

function writingOf(row: Row) {
  const sec = row.form.sections.find((s) => s.key === "writing");
  const item = sec?.items.find((i) => i.type === "text");
  return { sec, item, text: item ? String(row.responses?.[item.id]?.value ?? "") : "" };
}

async function insertMark(row: Row, itemId: string | undefined, m: WritingMark, extra: Record<string, unknown> = {}) {
  await db.from("entry_assessment_writing_marks").insert({
    assessment_id: row.id, item_id: itemId, source: m.source, status: "ok", model: m.model || null, strands: m.strands, overall: m.overall,
    working_at: Math.round(m.workingAt * 10) / 10, feedback: m.feedback.slice(0, 4000), next_steps: m.nextSteps, flags: m.flags, confidence: m.confidence || null, word_count: m.wordCount, ...extra,
  });
}

/** First-marks the writing. AI when ANTHROPIC_API_KEY is set; otherwise (or if the AI fails) a clearly labelled estimate. */
async function firstMarkWriting(id: string): Promise<{ ok: boolean; source?: string; error?: string }> {
  const { data } = await db.from("entry_assessments").select("*").eq("id", id).single();
  const row = data as Row | null;
  if (!row) return { ok: false, error: "not_found" };
  const { sec, item, text } = writingOf(row);
  if (!sec || !item) return { ok: false, error: "no_writing" };
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  let source = "estimate", error: string | undefined;
  try {
    if (key && text.trim().split(/\s+/).length >= 5) {
      const task = sec.writingPrompt || { title: "Writing", prompt: item.stem };
      // Only the writing (name removed), the year group and the task are sent. Never the pupil's name.
      const res = await aiMarkWriting({ apiKey: key, model: AI_MODEL, year: row.year, task, text: redactNames(text, [row.candidate_name]) });
      if (res.mark) {
        await insertMark(row, item.id, res.mark, { raw: res.raw?.slice(0, 8000) || null });
        source = "ai";
      } else {
        error = res.error;
        await db.from("entry_assessment_writing_marks").insert({ assessment_id: row.id, item_id: item.id, source: "ai", status: "error", model: AI_MODEL, error: (res.error || "failed").slice(0, 500), raw: res.raw?.slice(0, 8000) || null });
      }
    }
    if (source !== "ai") await insertMark(row, item.id, estimateWriting(row.year, text));
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "failed";
  }
  // Always rebuild the report, even if marking failed, so the sitting never sticks.
  const { data: fresh } = await db.from("entry_assessments").select("*").eq("id", id).single();
  if (fresh) await recompute(fresh as Row);
  return { ok: true, source, error };
}

// ── report ─────────────────────────────────────────────────────────────────
async function recompute(row: Row): Promise<Row> {
  if (!["submitted", "complete"].includes(row.status)) return row;
  let ageMonths: number | null = null, summerBorn = false;
  if (row.dob) {
    const b = new Date(row.dob), t = new Date(row.submitted_at || Date.now());
    ageMonths = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth()) - (t.getDate() < b.getDate() ? 1 : 0);
    summerBorn = [5, 6, 7].includes(b.getMonth()); // June, July, August: youngest in the year group
  }
  const a = (row.access || {}) as Access;
  const integrity = summariseIntegrity({ sections: row.form.sections, responses: row.responses || {}, events: row.events || [], sectionsLog: row.sections_log || [], breaks: breaksOf(row) });
  const first = await latestFirstMark(row.id);
  const report = buildReport(row.form, row.responses || {}, row.marks || {},
    { year: row.year, ageMonths, summerBorn, eal: row.eal, send: row.send_notes, extraTimePct: a.extraTimePct, readAloud: a.readAloud || row.form.readAloud, largeText: a.largeText, breaks: rulesOf(row), otherArrangements: a.other },
    integrity, { firstWritingMark: first });
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
  return await patchRow(row, { report, cohort, status: complete ? "complete" : "submitted", completed_at: complete ? nowIso() : null });
}

// ── what the candidate's page receives (never answers) ─────────────────────
function publicState(row: Row, session?: string) {
  const f = row.form;
  const cur = currentSection(row);
  const done = new Set(row.sections_log.map((l) => l.key));
  const access = (row.access || {}) as Access;
  const rules = rulesOf(row);
  const base = {
    ok: true,
    session,
    firstName: row.candidate_name.split(" ")[0],
    year: row.year,
    status: row.status,
    readAloud: f.readAloud || !!access.readAloud,
    autoRead: f.autoRead ?? (row.year <= 2 || !!access.readAloud),
    largeText: !!access.largeText,
    breakRules: rules,
    leaveLimit: access.leaveLimit || null,
    // Tells the pupil, on the next screen, that the last part was ended for leaving it.
    lastEndedForLeaving: (() => { const l = row.sections_log[row.sections_log.length - 1]; return l?.leftLimit ? f.sections.find((s) => s.key === l.key)?.title || null : null; })(),
    serverNow: nowIso(),
    sections: f.sections.filter((s) => s.candidate && s.items.length).map((s) => ({ key: s.key, title: s.title, minutes: s.minutes, questions: s.items.length, done: done.has(s.key) })),
  };
  if (!cur || row.status === "submitted" || row.status === "complete") return { ...base, finished: true };
  const started = !!row.section_started_at;
  const remaining = started ? Math.max(0, Math.round((cur.s.minutes * 60_000 - elapsedMs(row, cur.s.key)) / 1000)) : cur.s.minutes * 60;
  const ob = started ? openBreak(row) : null;
  const usedBreaks = started ? sectionBreaks(row, cur.s.key).length : 0;
  const breakState = ob ? { startedAt: ob.start, allowedSec: Math.round(ob.allowedMs / 1000), leftSec: Math.max(0, Math.round((ob.allowedMs - (Date.now() - new Date(ob.start).getTime())) / 1000)) } : null;
  // Questions and texts are only sent while the clock runs, and never during a break.
  const visible = started && !ob;
  const answers: Record<string, unknown> = {};
  if (visible) for (const it of cur.s.items) if (row.responses[it.id] !== undefined) answers[it.id] = row.responses[it.id].value;
  return {
    ...base,
    finished: false,
    current: {
      key: cur.s.key, title: cur.s.title, intro: cur.s.intro, minutes: cur.s.minutes, started, remaining,
      questions: cur.s.items.length,
      breaksLeft: Math.max(0, rules.perSection - usedBreaks),
      onBreak: breakState,
      passages: visible ? cur.s.passages || [] : [],
      writingPrompt: cur.s.writingPrompt ? { title: cur.s.writingPrompt.title, prompt: visible ? cur.s.writingPrompt.prompt : "" } : undefined,
      items: visible ? cur.s.items.map(toPublic) : [],
      answers,
    },
  };
}

function lightState(row: Row) {
  const cur = currentSection(row);
  const finished = !cur || row.status === "submitted" || row.status === "complete";
  const ob = openBreak(row);
  return {
    ok: true, finished, section: cur?.s.key || null, started: !!row.section_started_at,
    remaining: cur && row.section_started_at ? Math.max(0, Math.round((cur.s.minutes * 60_000 - elapsedMs(row, cur.s.key)) / 1000)) : null,
    onBreak: !!ob, breakLeftSec: ob ? Math.max(0, Math.round((ob.allowedMs - (Date.now() - new Date(ob.start).getTime())) / 1000)) : null,
  };
}

async function byToken(token: unknown): Promise<Row | null> {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const { data } = await db.from("entry_assessments").select("*").eq("token_hash", await hashToken(token)).maybeSingle();
  return (data as Row) || null;
}

// ── one window at a time ───────────────────────────────────────────────────
type SessionRow = { assessment_id: string; session_hash: string; seen_at: string; windows: number };
type SessionCheck = { ok: true; issued?: string; row: Row } | { ok: false; row: Row };

async function checkSession(row: Row, session: unknown, opts: { claim?: boolean; takeover?: boolean; device?: string } = {}): Promise<SessionCheck> {
  const { data } = await db.from("entry_assessment_sessions").select("*").eq("assessment_id", row.id).maybeSingle();
  const s = data as SessionRow | null;
  const given = typeof session === "string" && TOKEN.test(session) ? session : null;
  if (s && given && (await hashToken(given)) === s.session_hash) {
    if (Date.now() - new Date(s.seen_at).getTime() > 15_000) await db.from("entry_assessment_sessions").update({ seen_at: nowIso() }).eq("assessment_id", row.id);
    return { ok: true, row };
  }
  const live = !!s && Date.now() - new Date(s.seen_at).getTime() < LIVE_WINDOW_MS;
  if (!opts.claim || (live && !opts.takeover)) {
    // Another window is (or was just) in charge. Note it, at most once a minute.
    const last = [...(row.events || [])].reverse().find((e) => e.type === "session_conflict");
    if (s && (!last || Date.now() - new Date(last.t).getTime() > 60_000)) {
      row = await patchRow(row, { events: withEvents(row, [{ t: nowIso(), type: "session_conflict", section: row.section_started_at ? currentSection(row)?.s.key : undefined }]) });
    }
    return { ok: false, row };
  }
  const token = generateToken();
  const type = !s ? "session_new" : live ? "session_takeover" : "session_resumed";
  await db.from("entry_assessment_sessions").upsert({ assessment_id: row.id, session_hash: await hashToken(token), seen_at: nowIso(), device: opts.device?.slice(0, 300) || null, windows: (s?.windows || 0) + 1 });
  row = await patchRow(row, { events: withEvents(row, [{ t: nowIso(), type, section: row.section_started_at ? currentSection(row)?.s.key : undefined, brk: !!openBreak(row) || undefined }]) });
  return { ok: true, issued: token, row };
}

async function emailLink(row: Row, to: string, toName: string, token: string) {
  const first = row.candidate_name.split(" ")[0];
  const expires = new Date(row.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const total = row.form.sections.filter((s) => s.candidate && s.items.length).reduce((p, s) => p + s.minutes, 0);
  const live = row.form.sections.filter((s) => !s.candidate).map((s) => s.title);
  return await sendEmail({
    to, toName,
    subject: `${first}'s entry assessment | Tarbiyyah Global Academy`,
    html: emailShell(`<h1 style="font-size:20px;margin:0 0 16px;">${esc(first)}'s entry assessment</h1>
<p>Assalamu alaikum ${esc(toName.split(" ")[0])},</p>
<p>Here is ${esc(first)}'s entry assessment for Year ${row.year}. It takes about ${total} minutes in timed parts. ${esc(first)} can rest between parts, and can press "Take a break" during a part: the clock stops and the questions are hidden until they carry on. It helps us place ${esc(first)} in the right groups from day one; there is nothing to revise.</p>
<p style="margin:24px 0;"><a href="${linkFor(token)}" style="background:#B08E45;color:#1B1E21;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;">Open the assessment</a></p>
<ul style="padding-left:18px;color:#444;">
<li>Use a laptop, desktop or tablet in a quiet room, with headphones or speakers: questions can be read aloud.</li>
<li>Please close other apps and tabs first. The assessment opens in full screen and notes if the window is left, so that we can read the results fairly.</li>
<li>${row.year <= 2 ? "You may help with the mouse or reading the screen's buttons, but please don't help with the answers." : "Please don't help with the answers, we want to see what " + esc(first) + " can do on their own."}</li>
${live.length ? `<li>The ${esc(live.join(", ").replace(/, ([^,]*)$/, " and $1"))} part${live.length === 1 ? " is" : "s are"} done with a teacher on your family call.</li>` : ""}
<li>The link works until ${expires}. It is for ${esc(first)} only, and works in one window at a time.</li>
</ul>`),
  });
}

function accessFrom(body: Record<string, unknown>): Access & { breaks: BreakRules | undefined } {
  const a = (body.access && typeof body.access === "object" ? body.access : {}) as Access;
  const extra = Math.max(0, Math.min(100, Number(a.extraTimePct) || 0));
  const b = a.breaks && typeof a.breaks === "object" ? a.breaks : null;
  const breaks = b && (b.perSection !== undefined || b.minutes !== undefined)
    ? { perSection: Math.max(0, Math.min(6, Math.round(Number(b.perSection ?? 0)))), minutes: Math.max(1, Math.min(15, Math.round(Number(b.minutes ?? 3)))) }
    : undefined;
  const leaveLimit = Math.max(0, Math.min(20, Math.round(Number(a.leaveLimit) || 0)));
  return { extraTimePct: extra || undefined, readAloud: !!a.readAloud || undefined, largeText: !!a.largeText || undefined, breaks, other: typeof a.other === "string" ? a.other.slice(0, 200) : undefined, leaveLimit: leaveLimit || undefined };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body.action || "");

  // ── candidate actions ──
  if (["state", "ping", "start_section", "answer", "event", "break_start", "break_end", "submit_section"].includes(action)) {
    let row = await byToken(body.token);
    if (!row) return jsonResponse({ ok: false, error: "not_found" }, 404);
    if (row.status === "void") return jsonResponse({ ok: false, error: "void" }, 410);
    if (new Date(row.expires_at).getTime() < Date.now() && row.status === "issued") return jsonResponse({ ok: false, error: "expired" }, 410);
    row = await enforceTime(row);

    if (action === "state") {
      const device = typeof body.device === "string" ? body.device : undefined;
      const sc = await checkSession(row, body.session, { claim: true, takeover: body.takeover === true, device });
      row = sc.row;
      if (!sc.ok) return jsonResponse({ ok: false, error: "other_session", firstName: row.candidate_name.split(" ")[0] }, 409);
      if (!row.started_at) {
        const patch: Record<string, unknown> = { started_at: nowIso(), status: "in_progress" };
        if (device) patch.device = device.slice(0, 300);
        if (typeof body.timezone === "string") patch.timezone = body.timezone.slice(0, 80);
        row = await patchRow(row, patch);
      }
      return jsonResponse(publicState(row, sc.issued));
    }

    const sc = await checkSession(row, body.session);
    row = sc.row;
    if (!sc.ok) return jsonResponse({ ok: false, error: "other_session" }, 409);
    const cur = currentSection(row);

    if (action === "ping") return jsonResponse(lightState(row));
    if (action === "event") {
      const type = String(body.type || "").slice(0, 30);
      if (!CLIENT_EVENTS.includes(type)) return jsonResponse({ ok: false, error: "validation" }, 400);
      const t = nowIso();
      const last = [...(row.events || [])].reverse().find((e) => e.type === type);
      if (last && Date.now() - new Date(last.t).getTime() < 800) return jsonResponse({ ok: true }); // ignore bursts
      const detail = typeof body.detail === "string" ? body.detail.replace(/[^\w +\-.]/g, "").slice(0, 40) || undefined : undefined;
      const ev: AssessEvent = { t, type, section: row.section_started_at ? cur?.s.key : undefined, brk: openBreak(row) ? true : undefined, detail };
      await addEvent(row, ev);
      // Staff can choose to end a part once the pupil has left it N times (access.leaveLimit).
      const limit = Number(((row.access || {}) as Access).leaveLimit) || 0;
      if (limit > 0 && cur && row.section_started_at && !ev.brk && (type === "hidden" || type === "blur")) {
        const left = countLeaves([...(row.events || []), ev], cur.s.key, row.section_started_at);
        if (left >= limit) {
          // Re-read first so two events arriving together cannot end two parts.
          const { data: fresh } = await db.from("entry_assessments").select("*").eq("id", row.id).single();
          const f = fresh as Row | null;
          if (f && f.section_index === row.section_index && f.section_started_at === row.section_started_at) {
            await closeSection(f, false, true);
            return jsonResponse({ ok: true, ended: true });
          }
        }
      }
      return jsonResponse({ ok: true });
    }
    if (!cur || row.status === "submitted" || row.status === "complete") return jsonResponse(publicState(row));

    if (action === "start_section") {
      if (!row.section_started_at) row = await patchRow(row, { section_started_at: nowIso(), status: "in_progress", break_started_at: null });
      return jsonResponse(publicState(row));
    }
    if (action === "break_start") {
      if (!row.section_started_at) return jsonResponse({ ok: false, error: "not_started" }, 409);
      if (openBreak(row)) return jsonResponse(publicState(row));
      const rules = rulesOf(row);
      if (sectionBreaks(row, cur.s.key).length >= rules.perSection) return jsonResponse({ ok: false, error: "no_breaks_left" }, 409);
      const t = nowIso();
      row = await patchRow(row, {
        breaks: [...breaksOf(row), { section: cur.s.key, start: t, allowedMs: rules.minutes * 60_000 }],
        break_started_at: t,
        events: withEvents(row, [{ t, type: "break_start", section: cur.s.key, brk: true }]),
      });
      return jsonResponse(publicState(row));
    }
    if (action === "break_end") {
      const ob = openBreak(row);
      if (ob) {
        const t = nowIso();
        row = await patchRow(row, {
          breaks: breaksOf(row).map((b) => (b === ob || (!b.end && b.start === ob.start) ? { ...b, end: t } : b)),
          break_started_at: null,
          events: withEvents(row, [{ t, type: "break_end", section: cur.s.key, brk: true }]),
        });
        row = await enforceTime(row);
      }
      return jsonResponse(publicState(row));
    }
    if (action === "answer") {
      if (!row.section_started_at) return jsonResponse({ ok: false, error: "not_started" }, 409);
      if (openBreak(row)) return jsonResponse({ ok: false, error: "on_break" }, 409);
      const itemId = String(body.itemId || "");
      const item = cur.s.items.find((i) => i.id === itemId);
      if (!item) return jsonResponse({ ok: false, error: "wrong_section" }, 409);
      let value = body.value;
      if (typeof value === "string") value = value.slice(0, item.type === "text" ? 12000 : 200);
      else if (typeof value !== "number" && value !== null) return jsonResponse({ ok: false, error: "validation" }, 400);
      if (item.type === "mcq" && value !== null && value !== "" && !(item.choices || []).includes(String(value))) return jsonResponse({ ok: false, error: "validation" }, 400);
      const ms = Number(body.ms);
      const prev = row.responses[itemId];
      // Server-side timing too: the gap since the last saved answer in this part.
      const since = row.section_started_at;
      const lastT = Object.values(row.responses).map((r) => r.t).filter((x): x is string => !!x && x >= since).sort().pop() || since;
      const g = Math.max(0, Date.now() - new Date(lastT).getTime());
      const saved = { value, ms: Number.isFinite(ms) ? Math.max(0, Math.min(ms, 3_600_000)) : undefined, t: nowIso(), g, n: (prev?.n || 0) + 1 };
      const { error } = await db.rpc("entry_assessment_set_response", { p_id: row.id, p_item: itemId, p_value: saved });
      if (error) await db.from("entry_assessments").update({ responses: { ...row.responses, [itemId]: saved }, updated_at: nowIso() }).eq("id", row.id);
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
    const access = accessFrom(body);
    const skip = (Array.isArray(body.skip) ? body.skip : []).filter((k): k is SectionKey => ["maths", "english", "reasoning", "writing", "quran", "arabic"].includes(String(k)));
    const seed = newSeed(name);
    const form = buildForm(year, seed, { extraTimePct: access.extraTimePct, readAloud: access.readAloud, skip, breaks: access.breaks });
    const token = generateToken();
    const { data: ins, error } = await db.from("entry_assessments").insert({
      application_id: applicationId, child_id: childId, candidate_name: name, year, dob, eal: !!body.eal, send_notes: sendNotes,
      access: { ...access, skip: skip.length ? skip : undefined },
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
    const patch: Record<string, unknown> = { token_hash: await hashToken(token), expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), updated_at: nowIso() };
    if (body.newPaper) {
      const seed = newSeed(row.candidate_name);
      const a = (row.access || {}) as Access & { skip?: SectionKey[] };
      Object.assign(patch, { seed, form: buildForm(row.year, seed, { extraTimePct: a.extraTimePct, readAloud: a.readAloud, skip: a.skip, breaks: a.breaks }), status: "issued", section_index: 0, section_started_at: null, sections_log: [], responses: {}, events: [], breaks: [], break_started_at: null, report: null, cohort: null, started_at: null, submitted_at: null, completed_at: null });
      await db.from("entry_assessment_sessions").delete().eq("assessment_id", id);
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
    await db.from("entry_assessments").update({ status: "void", updated_at: nowIso() }).eq("id", id);
    return jsonResponse({ ok: true });
  }
  if (action === "ai_mark") {
    const res = await firstMarkWriting(id);
    if (!res.ok) return jsonResponse({ ok: false, error: res.error || "failed", detail: res.error === "no_writing" ? "There is no on-screen writing to mark for this pupil." : undefined }, 400);
    const { data } = await db.from("entry_assessments").select("report, status").eq("id", id).single();
    return jsonResponse({ ok: true, source: res.source, aiError: res.error, report: data?.report, status: data?.status });
  }
  if (action === "mark") {
    const section = String(body.section || "");
    if (!["writing", "quran", "arabic"].includes(section) || typeof body.data !== "object" || !body.data) return jsonResponse({ ok: false, error: "validation" }, 400);
    const d = body.data as Record<string, unknown>;
    const clamp = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const stamp = { markedBy: user.email || user.id, markedAt: nowIso(), notes: typeof d.notes === "string" ? d.notes.slice(0, 2000) : undefined };
    const marks = { ...(row.marks || {}) } as TeacherMarks;
    if (section === "writing") {
      const scores: Record<string, number> = {};
      for (const [k, v] of Object.entries((d.scores as Record<string, unknown>) || {})) if (/^[a-z]{2,20}$/.test(k)) scores[k] = clamp(v, 0, 4);
      if (!WRITING_STRANDS.every((s) => scores[s.key] !== undefined)) return jsonResponse({ ok: false, error: "validation", detail: "Mark every strand." }, 400);
      const mean = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
      const overall = BANDS.includes(d.overall as BandName) ? (d.overall as BandName) : undefined;
      const overriding = !!overall && overall !== bandOfMean(mean);
      const reason = typeof d.overrideReason === "string" ? d.overrideReason.trim().slice(0, 2000) : "";
      if (overriding && reason.length < 3) return jsonResponse({ ok: false, error: "validation", detail: "Give a reason for changing the overall judgement." }, 400);
      const first = await latestFirstMark(id);
      const basedOn = first && d.basedOn === first.id ? first : null;
      const same = !!basedOn && WRITING_STRANDS.every((s) => basedOn.strands[s.key]?.score === scores[s.key]);
      const decision = overriding ? "overridden" : !basedOn ? "staff" : same ? "accepted" : "adjusted";
      marks.writing = { scores, ...stamp, overall: overriding ? overall : undefined, overrideReason: overriding ? reason : undefined, decision };
      const { item } = writingOf(row);
      const strands = Object.fromEntries(WRITING_STRANDS.map((s) => [s.key, { score: scores[s.key], comment: basedOn && basedOn.strands[s.key]?.score === scores[s.key] ? basedOn.strands[s.key]?.comment : undefined }]));
      const band = overriding ? (overall as BandName) : bandOfMean(mean);
      await db.from("entry_assessment_writing_marks").insert({
        assessment_id: id, item_id: item?.id, source: "staff", status: "ok", strands, overall: band, working_at: row.year + (BANDS.indexOf(band) - 2),
        feedback: basedOn?.feedback || null, next_steps: basedOn?.nextSteps || [], flags: basedOn?.flags || [], word_count: basedOn?.wordCount || null,
        based_on: basedOn?.id || null, decision, override_reason: overriding ? reason : null, notes: stamp.notes || null, created_by: user.id, created_by_email: user.email || null,
      });
    } else if (section === "arabic") {
      const sc = ((d.scores as Record<string, unknown>) || d) as Record<string, unknown>;
      marks.arabic = { letters: clamp(sc.letters, 0, 2), vowelled: clamp(sc.vowelled, 0, 4), unvowelled: clamp(sc.unvowelled, 0, 4), understanding: clamp(sc.understanding, 0, 4), speaking: clamp(sc.speaking, 0, 4), ...stamp };
    } else {
      marks.quran = { stage: clamp(d.stage, 0, 6), tajweed: clamp(d.tajweed, 0, 4), fluency: clamp(d.fluency, 0, 4), juz: clamp(d.juz, 0, 30), lastSurah: typeof d.lastSurah === "string" ? d.lastSurah.slice(0, 80) : undefined, ...stamp };
    }
    row = await patchRow(row, { marks });
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
