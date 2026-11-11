// inbound-absence: parents email absence@globalacademy.tarbiyyah.co.uk and
// the portal records the absence for them.
//
// Two kinds of request reach this function (deployed with --no-verify-jwt):
//
// 1. Resend "email.received" webhooks (Svix-signed). The signature is
//    checked with RESEND_INBOUND_WEBHOOK_SECRET; without a valid one nothing
//    happens (401). Then:
//      - the full email is fetched from Resend (webhooks carry no body);
//      - one row is stored in inbound_absence_emails (unique on the Resend
//        email id, so webhook retries are ignored);
//      - the sender is matched, case-insensitively, against parents'
//        registered emails and emergency contacts with parental
//        responsibility. Unknown senders: nothing recorded, polite reply;
//      - the email is read by the rules in parse.ts and, if ANTHROPIC_API_KEY
//        is set, by a small Claude model too; decide.ts only lets it through
//        when everything is clear and agrees, and the sender passed
//        SPF/DKIM/DMARC checks. Otherwise it waits for staff review;
//      - absence_notes rows are written (one per child per date range,
//        source 'email') and the parent gets a confirmation email.
//
// 2. Staff actions from the Absences page ("Emails" tab), with the signed-in
//    user's JWT, re-checked here (Headteacher/Admin only):
//      { action: "confirm", id, child_ids, ranges, category, gist, notify? }
//      { action: "dismiss", id, note? }
//      { action: "search_children", q }

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { diffDays, formatRange, isValidKey, ukNow } from "./dates.ts";
import { decide, sanitiseGist, type Decision } from "./decide.ts";
import { extractWithModel } from "./llm.ts";
import { claudeConfigured } from "../_shared/claude.ts";
import { parseAbsenceEmail, REASON_CATEGORIES, type ChildRef, type DateRange, type ReasonCategory } from "./parse.ts";
import { header, isAutomated, senderAuthenticated, type HeaderMap } from "./sender.ts";
import { verifySvix } from "./svix.ts";
import { cleanEmailBody, htmlToText } from "./text.ts";
import { ROLE_EMAILS } from "../_shared/contacts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);

const INBOX = (Deno.env.get("ABSENCE_INBOX_EMAIL") || ROLE_EMAILS.attendance).toLowerCase();
const LEARN_SITE_URL = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const PORTAL_ABSENCES = `${LEARN_SITE_URL}/family/absences`;
const OWN_DOMAINS = ["globalacademy.tarbiyyah.co.uk"];
const BODY_MAX = 8000;
const REPLIES_PER_DAY = 5;

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

type Candidate = ChildRef & { parent_user_id: string };

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  if (req.headers.get("svix-signature") || req.headers.get("svix-id")) return handleWebhook(req);
  if (req.headers.get("Authorization")) return handleStaff(req);
  return jsonResponse({ ok: false, error: "unauthorised" }, 401);
});

// ── webhook ──────────────────────────────────────────────────────────────
async function handleWebhook(req: Request): Promise<Response> {
  const raw = await req.text();
  const secret = Deno.env.get("RESEND_INBOUND_WEBHOOK_SECRET") || "";
  const v = await verifySvix(secret, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, raw);
  if (!v.ok) {
    console.warn("inbound-absence: rejected webhook", v.reason);
    return jsonResponse({ ok: false, error: "invalid_signature" }, 401);
  }

  let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (event.type !== "email.received" || !event.data) return jsonResponse({ ok: true, ignored: event.type || "unknown" });
  const d = event.data;
  const emailId = String(d.email_id || d.id || "");
  if (!emailId) return jsonResponse({ ok: false, error: "missing_email_id" }, 400);

  // Only mail for the absence inbox (the domain may receive other mail).
  const recipients = [d.to, d.cc, d.received_for].flatMap((x) => (Array.isArray(x) ? x : x ? [x] : [])).map((x) => String(x).toLowerCase());
  if (!recipients.some((r) => r.includes(INBOX))) return jsonResponse({ ok: true, ignored: "not_for_absence_inbox" });

  const { data: seen } = await service.from("inbound_absence_emails").select("id").eq("provider_email_id", emailId).maybeSingle();
  if (seen) return jsonResponse({ ok: true, duplicate: true });

  // The webhook has metadata only; fetch the body, headers and auth results.
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const full = await fetchReceivedEmail(apiKey, emailId);
  if (!full) return jsonResponse({ ok: false, error: "fetch_failed" }, 502); // Resend retries

  const from = String(full.from || d.from || "").replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase();
  const headers = (full.headers || {}) as HeaderMap;
  const fromHeader = header(headers, "from");
  const fromName = (fromHeader.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] || "").trim().slice(0, 120) || null;
  const subject = String(full.subject ?? d.subject ?? "").slice(0, 500);
  const text = String(full.text || "") || htmlToText(String(full.html || ""));
  const receivedAt = isNaN(Date.parse(String(d.created_at || event.created_at))) ? new Date() : new Date(String(d.created_at || event.created_at));
  const auth = (full.authentication || null) as { spf?: string; dkim?: string; dmarc?: string } | null;

  const { data: row, error: insErr } = await service
    .from("inbound_absence_emails")
    .insert({
      provider_email_id: emailId,
      message_id: String(full.message_id || d.message_id || "").slice(0, 500) || null,
      received_at: receivedAt.toISOString(),
      from_email: from.slice(0, 320),
      from_name: fromName,
      to_email: INBOX,
      subject,
      body_text: text.slice(0, BODY_MAX),
      auth,
      status: "needs_review",
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") return jsonResponse({ ok: true, duplicate: true });
    console.error("inbound-absence: insert failed", insErr.message);
    return jsonResponse({ ok: false, error: "store_failed" }, 500);
  }
  const rowId = row.id as string;

  try {
    return await processEmail({ rowId, from, fromName, subject, text, headers, auth, receivedAt });
  } catch (e) {
    console.error("inbound-absence: processing failed", e);
    await service.from("inbound_absence_emails").update({ status: "needs_review", error: String(e).slice(0, 500) }).eq("id", rowId);
    return jsonResponse({ ok: true, stored: true, error: "processing_failed" });
  }
}

async function fetchReceivedEmail(apiKey: string, id: string): Promise<Record<string, unknown> | null> {
  if (!apiKey) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (res.ok) return await res.json();
      await res.body?.cancel();
      if (res.status < 500 && res.status !== 429) return null;
    } catch {
      // network blip: retry once
    }
  }
  return null;
}

async function processEmail(m: {
  rowId: string;
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
  headers: HeaderMap;
  auth: { spf?: string; dkim?: string; dmarc?: string } | null;
  receivedAt: Date;
}): Promise<Response> {
  const update = (patch: Record<string, unknown>) => service.from("inbound_absence_emails").update(patch).eq("id", m.rowId);

  if (isAutomated(m.from, m.headers, OWN_DOMAINS)) {
    await update({ status: "rejected", review_reasons: ["auto_reply"] });
    return jsonResponse({ ok: true, status: "rejected", reason: "auto_reply" });
  }

  // Owner-approved test senders are read as the demo parent (demo children only);
  // the reply still goes to the real sender.
  const TEST_SENDERS = (Deno.env.get("ABSENCE_TEST_SENDERS") || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  const fromAddr = (m.from.match(/<([^>]+)>/)?.[1] || m.from).trim().toLowerCase();
  const isTest = TEST_SENDERS.includes(fromAddr);
  const candidates = await childrenForSender(service, isTest ? "demo-parent@tarbiyyah.co.uk" : m.from);
  if (!candidates.length) {
    await update({ status: "rejected", review_reasons: ["unknown_sender"], parsed: { cleaned: cleanEmailBody(m.text).slice(0, 4000) } });
    const r = await replyIfAllowed(m.from, m.rowId, "Your absence email", unknownSenderHtml());
    await update({ reply_sent: r.ok, reply_detail: r.detail });
    return jsonResponse({ ok: true, status: "rejected", reason: "unknown_sender" });
  }

  const verified = senderAuthenticated(m.auth, m.headers, m.from);
  const det = parseAbsenceEmail({ subject: m.subject, body: m.text, receivedAt: m.receivedAt, children: candidates, senderName: m.fromName || undefined });

  let modelResult = null;
  let modelError: string | undefined;
  let modelName: string | null = null;
  const useModel = claudeConfigured();
  if (useModel) {
    const out = await extractWithModel({ model: Deno.env.get("ABSENCE_PARSER_MODEL"), subject: m.subject, body: det.cleanedBody, receivedAt: m.receivedAt, children: candidates });
    modelResult = out.result;
    modelError = out.error;
    modelName = out.model;
  }
  const decision: Decision = decide(det, modelResult, candidates, m.receivedAt);
  if (!verified) {
    decision.status = "needs_review";
    decision.reasons.push("sender_not_verified");
  }

  const parentIds = [...new Set(candidates.map((c) => c.parent_user_id))];
  const parsed = {
    cleaned: det.cleanedBody.slice(0, 4000),
    candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
    rules: { childIds: det.childIds, childHow: det.childHow, unknownNames: det.unknownNames, ranges: det.ranges, dateHow: det.dateHow, category: det.category, gist: det.gist, flags: det.flags, notes: det.notes },
    model: useModel ? { model: modelName, result: modelResult, error: modelError || null } : null,
    suggestion: { childIds: decision.childIds, ranges: decision.ranges, category: decision.category, gist: decision.gist },
  };
  const base = {
    parent_user_id: parentIds.length === 1 ? parentIds[0] : null,
    candidate_child_ids: candidates.map((c) => c.id),
    sender_verified: verified,
    parsed,
    error: modelError ? modelError.slice(0, 500) : null,
  };

  if (decision.status === "needs_review") {
    await update({ ...base, status: "needs_review", review_reasons: decision.reasons });
    const r = await replyIfAllowed(m.from, m.rowId, "We've received your absence email", reviewHtml());
    await update({ reply_sent: r.ok, reply_detail: r.detail });
    return jsonResponse({ ok: true, status: "needs_review", reasons: decision.reasons });
  }

  // Already covered by notes the family (or an earlier email) sent?
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items = decision.childIds.flatMap((cid) => decision.ranges.map((r) => ({ child: byId.get(cid)!, range: r })));
  const fresh: typeof items = [];
  for (const it of items) {
    const { data: existing } = await service.from("absence_notes").select("from_date, to_date").eq("child_id", it.child.id).lte("from_date", it.range.from).gte("to_date", it.range.to).limit(1);
    if (!existing || existing.length === 0) fresh.push(it);
  }
  if (!fresh.length) {
    await update({ ...base, status: "duplicate", review_reasons: ["duplicate"] });
    const r = await replyIfAllowed(m.from, m.rowId, "Absence already recorded", duplicateHtml(items));
    await update({ reply_sent: r.ok, reply_detail: r.detail });
    return jsonResponse({ ok: true, status: "duplicate" });
  }

  const noteIds = await insertNotes(fresh, decision.category!, decision.gist, m.rowId);
  await update({ ...base, status: "recorded", review_reasons: [], note_ids: noteIds });
  const r = await replyIfAllowed(m.from, m.rowId, recordedSubject(fresh), recordedHtml(fresh, decision.category!, false));
  await update({ reply_sent: r.ok, reply_detail: r.detail });
  return jsonResponse({ ok: true, status: "recorded", notes: noteIds.length });
}

/** The children this address may report absences for. */
async function childrenForSender(db: SupabaseClient, email: string): Promise<Candidate[]> {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const out = new Map<string, Candidate>();

  // Parents: registered profile email, holding the parent role.
  const { data: profiles } = await db.from("profiles").select("id").ilike("email", pattern);
  const ids = (profiles || []).map((p) => p.id as string);
  if (ids.length) {
    const { data: roles } = await db.from("user_roles").select("user_id").in("user_id", ids).eq("role", "parent");
    const parents = [...new Set((roles || []).map((r) => r.user_id as string))];
    if (parents.length) {
      const { data: kids } = await db.from("children").select("id, name, parent_user_id").in("parent_user_id", parents).order("name");
      for (const k of kids || []) out.set(k.id, k as Candidate);
    }
  }

  // Second contacts: an emergency contact with parental responsibility, for that child only.
  const { data: contacts } = await db.from("pupil_emergency_contacts").select("child_id").ilike("email", pattern).eq("parental_responsibility", true);
  const extra = (contacts || []).map((c) => c.child_id as string).filter((id) => !out.has(id));
  if (extra.length) {
    const { data: kids } = await db.from("children").select("id, name, parent_user_id").in("id", extra);
    for (const k of kids || []) out.set(k.id, k as Candidate);
  }
  return [...out.values()];
}

function reasonText(category: string, gist: string): string {
  const g = sanitiseGist(gist);
  const body = g && g.toLowerCase() !== category.toLowerCase() ? `${category}: ${g}` : category;
  return `${body.slice(0, 480)} (by email)`;
}

async function insertNotes(items: { child: Candidate; range: DateRange }[], category: string, gist: string, emailRowId: string): Promise<string[]> {
  const rows = items.map((it) => ({
    child_id: it.child.id,
    parent_user_id: it.child.parent_user_id,
    from_date: it.range.from,
    to_date: it.range.to,
    reason: reasonText(category, gist),
    source: "email",
    inbound_email_id: emailRowId,
  }));
  const { data, error } = await service.from("absence_notes").insert(rows).select("id");
  if (error) throw new Error(`absence_notes insert: ${error.message}`);
  return (data || []).map((r) => r.id as string);
}

/** Replies at most REPLIES_PER_DAY times a day to one address (stops mail loops). */
async function replyIfAllowed(to: string, rowId: string, subject: string, html: string): Promise<{ ok: boolean; detail: string }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await service.from("inbound_absence_emails").select("id", { count: "exact", head: true }).eq("from_email", to).eq("reply_sent", true).gte("received_at", since).neq("id", rowId);
  if ((count || 0) >= REPLIES_PER_DAY) return { ok: false, detail: "Not sent: reply limit for this address reached today" };
  return await sendEmail({ to, subject, html });
}

// ── reply emails (UK English, no em dashes) ──────────────────────────────
function recordedLines(items: { child: Candidate; range: DateRange }[], category: string): string[] {
  return items.map((it) => `Absence recorded for ${firstName(it.child.name)} ${it.range.from === it.range.to ? "on" : "from"} ${formatRange(it.range.from, it.range.to)}: ${category}`);
}

function recordedSubject(items: { child: Candidate; range: DateRange }[]): string {
  const names = [...new Set(items.map((i) => firstName(i.child.name)))].join(" and ");
  return `Absence recorded: ${names}, ${formatRange(items[0].range.from, items[0].range.to)}${items.length > 1 && new Set(items.map((i) => i.range.from)).size > 1 ? " and more" : ""}`;
}

function recordedHtml(items: { child: Candidate; range: DateRange }[], category: string, byOffice: boolean): string {
  const lines = recordedLines(items, category);
  return emailShell(`
    <p style="margin:0 0 12px;">Assalamu alaikum,</p>
    <p style="margin:0 0 12px;">${byOffice ? "The office has checked your email and recorded the following:" : "Thank you for letting us know. We have recorded the following:"}</p>
    <ul style="margin:0 0 16px;padding-left:20px;">${lines.map((l) => `<li style="margin:0 0 6px;"><strong>${esc(l)}</strong></li>`).join("")}</ul>
    <p style="margin:0 0 12px;">If anything is wrong, you can correct or withdraw it on the Parent Portal.</p>
    <p style="margin:0 0 20px;"><a href="${PORTAL_ABSENCES}" style="color:#B08E45;">Open Absences in the Parent Portal &rarr;</a></p>
    <p style="margin:0;color:#777;font-size:13px;">This is an automatic reply to your email to ${esc(INBOX)}.</p>
  `);
}

function reviewHtml(): string {
  return emailShell(`
    <p style="margin:0 0 12px;">Assalamu alaikum,</p>
    <p style="margin:0 0 12px;">Thank you for your email about an absence. We couldn't record it automatically, so the office will check it and record it for you. We'll be in touch if we need anything else.</p>
    <p style="margin:0 0 20px;">You can also report an absence yourself on the Parent Portal.</p>
    <p style="margin:0 0 20px;"><a href="${PORTAL_ABSENCES}" style="color:#B08E45;">Open Absences in the Parent Portal &rarr;</a></p>
    <p style="margin:0;color:#777;font-size:13px;">This is an automatic reply to your email to ${esc(INBOX)}.</p>
  `);
}

function duplicateHtml(items: { child: Candidate; range: DateRange }[]): string {
  const names = [...new Set(items.map((i) => firstName(i.child.name)))].join(" and ");
  return emailShell(`
    <p style="margin:0 0 12px;">Assalamu alaikum,</p>
    <p style="margin:0 0 12px;">Thank you. We already have an absence recorded for ${esc(names)} on ${esc(items.map((i) => formatRange(i.range.from, i.range.to)).filter((v, i, a) => a.indexOf(v) === i).join(", "))}, so nothing has changed.</p>
    <p style="margin:0 0 20px;"><a href="${PORTAL_ABSENCES}" style="color:#B08E45;">See your absence notes in the Parent Portal &rarr;</a></p>
    <p style="margin:0;color:#777;font-size:13px;">This is an automatic reply to your email to ${esc(INBOX)}.</p>
  `);
}

function unknownSenderHtml(): string {
  return emailShell(`
    <p style="margin:0 0 12px;">Assalamu alaikum,</p>
    <p style="margin:0 0 12px;">Thank you for your email to ${esc(INBOX)}. We couldn't match this email address to a parent at the school, so we haven't recorded anything.</p>
    <p style="margin:0 0 12px;">Please send it again from the email address you registered with us, or report the absence on the Parent Portal.</p>
    <p style="margin:0 0 20px;"><a href="${PORTAL_ABSENCES}" style="color:#B08E45;">Open the Parent Portal &rarr;</a></p>
    <p style="margin:0;color:#777;font-size:13px;">If you are not a parent at Tarbiyyah Global Academy, please ignore this email.</p>
  `);
}

// ── staff actions ────────────────────────────────────────────────────────
async function handleStaff(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization")!;
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await caller.auth.getUser();
  const me = userData?.user;
  if (!me) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", me.id).in("role", ["head_teacher", "admin"]);
  if (!roleRows || roleRows.length === 0) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const action = String(body.action || "");

  if (action === "search_children") {
    const q = String(body.q || "").trim().slice(0, 60);
    if (q.length < 2) return jsonResponse({ ok: true, children: [] });
    const { data } = await service.from("children").select("id, name").ilike("name", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`).order("name").limit(15);
    return jsonResponse({ ok: true, children: data || [] });
  }

  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonResponse({ ok: false, error: "missing_id" }, 400);
  const { data: row } = await service.from("inbound_absence_emails").select("id, status, from_email").eq("id", id).maybeSingle();
  if (!row) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (row.status === "recorded" || row.status === "dismissed") return jsonResponse({ ok: false, error: "already_handled", detail: "This email has already been dealt with." }, 409);

  if (action === "dismiss") {
    await service.from("inbound_absence_emails").update({ status: "dismissed", handled_by: me.id, handled_at: new Date().toISOString(), staff_note: String(body.note || "").slice(0, 500) || null }).eq("id", id);
    return jsonResponse({ ok: true, status: "dismissed" });
  }

  if (action !== "confirm") return jsonResponse({ ok: false, error: "unknown_action" }, 400);

  const childIds = Array.isArray(body.child_ids) ? [...new Set((body.child_ids as unknown[]).map(String))].slice(0, 10) : [];
  const ranges: DateRange[] = Array.isArray(body.ranges) ? (body.ranges as { from?: unknown; to?: unknown }[]).map((r) => ({ from: String(r?.from || ""), to: String(r?.to || "") })).slice(0, 10) : [];
  const category = String(body.category || "") as ReasonCategory;
  const gist = sanitiseGist(String(body.gist || ""));
  const { today } = ukNow(new Date());
  if (!childIds.length) return jsonResponse({ ok: false, error: "invalid", detail: "Choose at least one child." }, 400);
  if (!ranges.length || ranges.some((r) => !isValidKey(r.from) || !isValidKey(r.to) || r.to < r.from)) return jsonResponse({ ok: false, error: "invalid", detail: "Check the dates: the last day can't be before the first." }, 400);
  if (ranges.some((r) => diffDays(today, r.from) < -120 || diffDays(today, r.to) > 365)) return jsonResponse({ ok: false, error: "invalid", detail: "Those dates are too far from today." }, 400);
  if (!(REASON_CATEGORIES as readonly string[]).includes(category)) return jsonResponse({ ok: false, error: "invalid", detail: "Choose a reason." }, 400);
  if (category === "Other" && !gist) return jsonResponse({ ok: false, error: "invalid", detail: "Add a few words about the reason." }, 400);

  const { data: kids } = await service.from("children").select("id, name, parent_user_id").in("id", childIds);
  if (!kids || kids.length !== childIds.length) return jsonResponse({ ok: false, error: "invalid", detail: "One of those children couldn't be found." }, 400);

  const items = (kids as Candidate[]).flatMap((child) => ranges.map((range) => ({ child, range })));
  let noteIds: string[];
  try {
    noteIds = await insertNotes(items, category, gist, id);
  } catch (e) {
    return jsonResponse({ ok: false, error: "save_failed", detail: String(e).slice(0, 200) }, 500);
  }
  const { data: cur } = await service.from("inbound_absence_emails").select("parsed").eq("id", id).maybeSingle();
  await service
    .from("inbound_absence_emails")
    .update({
      status: "recorded",
      note_ids: noteIds,
      handled_by: me.id,
      handled_at: new Date().toISOString(),
      parent_user_id: kids[0].parent_user_id,
      parsed: { ...((cur?.parsed as Record<string, unknown>) || {}), confirmed: { childIds, ranges, category, gist, by: me.id } },
    })
    .eq("id", id);

  // Tell the family what was recorded, at their registered address(es).
  let emailed = 0;
  if (body.notify !== false) {
    const byParent = new Map<string, typeof items>();
    for (const it of items) byParent.set(it.child.parent_user_id, [...(byParent.get(it.child.parent_user_id) || []), it]);
    for (const [parentId, list] of byParent) {
      const { data: prof } = await service.from("profiles").select("email, full_name").eq("id", parentId).maybeSingle();
      if (!prof?.email) continue;
      const r = await sendEmail({ to: prof.email, toName: prof.full_name || undefined, subject: recordedSubject(list), html: recordedHtml(list, category, true) });
      if (r.ok) emailed++;
    }
  }
  return jsonResponse({ ok: true, status: "recorded", notes: noteIds.length, emailed });
}
