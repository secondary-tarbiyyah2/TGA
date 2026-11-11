// Emails people about new portal messages (owner feedback, 11 Nov 2026:
// "email should be sent to the one whose email is registered, be it a student
// or parent or staff"). Migration 0204 holds the settings and the log.
//
// Two ways in:
//   { kind: "message", id }  called by the portal right after a message is
//                            sent, with the SENDER's own token (so nobody can
//                            make the school email someone else). Emails each
//                            other person in the conversation whose setting is
//                            "As they arrive", at most once per conversation
//                            every 30 minutes and only while it is unread, so a
//                            busy conversation never floods an inbox.
//   { kind: "digest" }       the daily run (.github/workflows/message-digest.yml,
//                            service-role key): one summary email to each person
//                            whose setting is "Once a day" with anything unread.
// Muted conversations are never emailed. Emails never contain the message
// text (like push notifications): only who wrote and a link to read it.
// Pupils' sign-in addresses are internal and never mailed (sendEmail skips
// them); a pupil with a real registered address is emailed like anyone else.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { isServiceRequest } from "../_shared/serviceCaller.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEARN = (Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk").replace(/\/$/, "");
const THROTTLE_MS = 30 * 60 * 1000;
const STAFF_ROLES = ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "senco", "digital_lead"];

type Thread = { id: string; kind: string; title: string | null; parent_id: string | null; teacher_id: string | null; staff_a_id: string | null; staff_b_id: string | null };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

async function rolesOf(userId: string): Promise<string[]> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data as { role: string }[] | null) || []).map((r) => r.role);
}

/** Where a person reads their messages. */
function inboxPath(roles: string[]): string {
  if (roles.includes("teacher") || roles.includes("teaching_assistant_cover")) return "/teach/messages";
  if (roles.some((r) => r === "head_teacher" || r === "admin" || r === "admissions")) return "/admin/messages";
  if (roles.includes("student")) return "/student/messages";
  return "/family/messages";
}

/** Everyone who can read a message `senderId` wrote in this thread (0204's
 * message_visible_to: in a group, a parent's or pupil's message reaches only
 * the staff in it). */
async function peopleIn(t: Thread, senderId: string): Promise<string[]> {
  const ids = new Set([t.parent_id, t.teacher_id, t.staff_a_id, t.staff_b_id].filter((x): x is string => !!x));
  if (t.kind === "group") {
    const { data } = await db.from("message_thread_members").select("user_id, member_role").eq("thread_id", t.id);
    const members = (data as { user_id: string; member_role: string }[] | null) || [];
    const senderIsStaff = members.find((m) => m.user_id === senderId)?.member_role === "staff";
    members.filter((m) => senderIsStaff || m.member_role === "staff").forEach((m) => ids.add(m.user_id));
  }
  ids.delete(senderId);
  return [...ids];
}

async function emailMode(userId: string): Promise<string> {
  const { data } = await db.from("message_prefs").select("email_mode").eq("user_id", userId).maybeSingle();
  return (data as { email_mode?: string } | null)?.email_mode || "immediate";
}

async function isMuted(userId: string, threadId: string): Promise<boolean> {
  const { data } = await db.from("message_thread_mutes").select("thread_id").eq("user_id", userId).eq("thread_id", threadId).maybeSingle();
  return !!data;
}

async function profile(userId: string): Promise<{ email: string | null; full_name: string | null }> {
  const { data } = await db.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return (data as { email: string | null; full_name: string | null } | null) || { email: null, full_name: null };
}

const footer = (path: string) =>
  `<p style="margin:24px 0 0;font-size:12px;color:#777;">For privacy, messages are never copied into email. You can choose to get these emails as they arrive, once a day or not at all in <a href="${LEARN}/account" style="color:#5E4B1E;">Account</a>, and mute a conversation from its menu in <a href="${LEARN}${path}" style="color:#5E4B1E;">Messages</a>.</p>`;

async function onMessage(me: string, messageId: string): Promise<Response> {
  const { data: msg } = await db.from("message_thread_messages").select("id, sender_id, thread_id, created_at, recalled_at").eq("id", messageId).maybeSingle();
  const m = msg as { id: string; sender_id: string; thread_id: string; created_at: string; recalled_at: string | null } | null;
  if (!m || m.sender_id !== me) return jsonResponse({ ok: false, error: "not_found" }, 404);
  if (m.recalled_at) return jsonResponse({ ok: true, sent: 0 });
  const { data: th } = await db.from("message_threads").select("id, kind, title, parent_id, teacher_id, staff_a_id, staff_b_id").eq("id", m.thread_id).maybeSingle();
  const t = th as Thread | null;
  if (!t) return jsonResponse({ ok: false, error: "not_found" }, 404);
  const sender = ((await profile(me)).full_name || "Someone at school").trim();
  const since = new Date(Date.now() - THROTTLE_MS).toISOString();
  let sent = 0;
  for (const uid of await peopleIn(t, me)) {
    if ((await emailMode(uid)) !== "immediate") continue;
    if (await isMuted(uid, t.id)) continue;
    const { data: seen } = await db.from("thread_last_seen").select("seen_at").eq("user_id", uid).eq("thread_id", t.id).maybeSingle();
    if (seen && (seen as { seen_at: string }).seen_at >= m.created_at) continue;
    const { data: recent } = await db.from("message_email_log").select("sent_at").eq("user_id", uid).eq("thread_id", t.id).gte("sent_at", since).limit(1);
    if (recent && recent.length) continue;
    const p = await profile(uid);
    if (!p.email) continue;
    const path = inboxPath(await rolesOf(uid));
    const where = t.kind === "group" && t.title ? ` in <strong>${esc(t.title)}</strong>` : "";
    const subject = t.kind === "group" && t.title ? `New message in ${t.title}` : `New message from ${sender}`;
    const html = emailShell(
      `<h2 style="margin:0 0 12px;font-size:18px;">You have a new message</h2>
       <p style="margin:0 0 20px;"><strong>${esc(sender)}</strong> sent a message${where} in the school portal.</p>
       <p style="margin:0;"><a href="${LEARN}${path}?thread=${t.id}" style="display:inline-block;background:#1F4D3A;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;">Read it in Messages</a></p>
       ${footer(path)}`,
      `${sender} sent you a message`,
    );
    const r = await sendEmail({ to: p.email, toName: p.full_name || undefined, subject, html });
    if (r.ok) {
      sent++;
      await db.from("message_email_log").insert({ user_id: uid, thread_id: t.id, kind: "immediate" });
    }
  }
  return jsonResponse({ ok: true, sent });
}

async function digest(): Promise<Response> {
  const { data: prefs } = await db.from("message_prefs").select("user_id").eq("email_mode", "daily");
  const users = ((prefs as { user_id: string }[] | null) || []).map((p) => p.user_id);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  for (const uid of users) {
    const { data: last } = await db.from("message_email_log").select("sent_at").eq("user_id", uid).eq("kind", "daily").order("sent_at", { ascending: false }).limit(1);
    const lastAt = (last as { sent_at: string }[] | null)?.[0]?.sent_at;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < 20 * 60 * 60 * 1000) continue; // already sent today
    const from = lastAt && lastAt > dayAgo ? lastAt : dayAgo;

    // Conversations this person is in.
    const { data: direct } = await db
      .from("message_threads")
      .select("id, kind, title, parent_id, teacher_id, staff_a_id, staff_b_id")
      .or(`parent_id.eq.${uid},teacher_id.eq.${uid},staff_a_id.eq.${uid},staff_b_id.eq.${uid}`);
    const { data: mem } = await db.from("message_thread_members").select("thread_id, member_role").eq("user_id", uid);
    const memRows = (mem as { thread_id: string; member_role: string }[] | null) || [];
    const groupIds = memRows.map((x) => x.thread_id);
    // Groups where this person is a parent or pupil: they only see the staff's messages.
    const audienceIn = new Set(memRows.filter((x) => x.member_role !== "staff").map((x) => x.thread_id));
    const { data: groups } = groupIds.length ? await db.from("message_threads").select("id, kind, title, parent_id, teacher_id, staff_a_id, staff_b_id").in("id", groupIds) : { data: [] };
    const threads = [...((direct as Thread[] | null) || []), ...((groups as Thread[] | null) || [])];
    if (!threads.length) continue;
    const ids = threads.map((t) => t.id);
    const { data: mutes } = await db.from("message_thread_mutes").select("thread_id").eq("user_id", uid).in("thread_id", ids);
    const muted = new Set(((mutes as { thread_id: string }[] | null) || []).map((x) => x.thread_id));
    const { data: seenRows } = await db.from("thread_last_seen").select("thread_id, seen_at").eq("user_id", uid).in("thread_id", ids);
    const seen = new Map(((seenRows as { thread_id: string; seen_at: string }[] | null) || []).map((s) => [s.thread_id, s.seen_at]));
    const { data: msgs } = await db
      .from("message_thread_messages")
      .select("thread_id, sender_id, created_at")
      .in("thread_id", ids.filter((i) => !muted.has(i)))
      .neq("sender_id", uid)
      .is("recalled_at", null)
      .gt("created_at", from);
    let staffIds = new Set<string>();
    const rawMsgs = (msgs as { thread_id: string; sender_id: string; created_at: string }[] | null) || [];
    if (audienceIn.size) {
      const senders = [...new Set(rawMsgs.filter((x) => audienceIn.has(x.thread_id)).map((x) => x.sender_id))];
      if (senders.length) {
        const { data: sr } = await db.from("user_roles").select("user_id, role").in("user_id", senders);
        staffIds = new Set(((sr as { user_id: string; role: string }[] | null) || []).filter((r) => STAFF_ROLES.includes(r.role)).map((r) => r.user_id));
      }
    }
    const unread = rawMsgs
      .filter((x) => !audienceIn.has(x.thread_id) || staffIds.has(x.sender_id))
      .filter((x) => !(seen.get(x.thread_id) && seen.get(x.thread_id)! >= x.created_at));
    if (!unread.length) continue;

    const byThread = new Map<string, { n: number; senders: Set<string> }>();
    for (const x of unread) {
      const e = byThread.get(x.thread_id) || { n: 0, senders: new Set<string>() };
      e.n++;
      e.senders.add(x.sender_id);
      byThread.set(x.thread_id, e);
    }
    const names = new Map<string, string>();
    const senderIds = [...new Set(unread.map((x) => x.sender_id))];
    const { data: ps } = await db.from("profiles").select("id, full_name").in("id", senderIds);
    ((ps as { id: string; full_name: string | null }[] | null) || []).forEach((p) => names.set(p.id, p.full_name || "Someone at school"));

    const lines = [...byThread.entries()].map(([tid, e]) => {
      const t = threads.find((x) => x.id === tid)!;
      const who = [...e.senders].map((s) => names.get(s) || "Someone at school").join(", ");
      const label = t.kind === "group" && t.title ? `${esc(t.title)} (from ${esc(who)})` : esc(who);
      return `<li style="margin:0 0 6px;">${e.n} new message${e.n === 1 ? "" : "s"}: ${label}</li>`;
    });
    const p = await profile(uid);
    if (!p.email) continue;
    const path = inboxPath(await rolesOf(uid));
    const total = unread.length;
    const html = emailShell(
      `<h2 style="margin:0 0 12px;font-size:18px;">Your messages today</h2>
       <p style="margin:0 0 12px;">You have ${total} unread message${total === 1 ? "" : "s"} in the school portal:</p>
       <ul style="margin:0 0 20px;padding-left:18px;">${lines.join("")}</ul>
       <p style="margin:0;"><a href="${LEARN}${path}" style="display:inline-block;background:#1F4D3A;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open Messages</a></p>
       ${footer(path)}`,
      `${total} unread message${total === 1 ? "" : "s"}`,
    );
    const r = await sendEmail({ to: p.email, toName: p.full_name || undefined, subject: `${total} unread message${total === 1 ? "" : "s"} in the school portal`, html });
    if (r.ok) {
      sent++;
      await db.from("message_email_log").insert({ user_id: uid, thread_id: null, kind: "daily" });
    }
  }
  return jsonResponse({ ok: true, sent });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method" }, 405);
  let body: { kind?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.kind === "digest") {
    if (!(await isServiceRequest(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);
    return digest();
  }

  if (body.kind === "message" && body.id) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ ok: false, error: "unauthorised" }, 401);
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: who } = await caller.auth.getUser();
    const me = who?.user?.id;
    if (!me) return jsonResponse({ ok: false, error: "unauthorised" }, 401);
    return onMessage(me, body.id);
  }

  return jsonResponse({ ok: false, error: "bad_request" }, 400);
});
