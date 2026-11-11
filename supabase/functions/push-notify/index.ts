// Sends phone and browser notifications (Web Push) for the portal.
// Audit flaw 8 (10 November 2026): the portal only emailed, so families had
// no reason to open the app and missed messages.
//
// Called by the portal right after an action, with the caller's own token:
//   { kind: "message", id }  a message the caller just sent: notifies the
//                            other people in that conversation
//   { kind: "test" }         a test notification to the caller's own devices
// The caller must be the sender, so nobody can make the school notify
// someone else. Notifications carry no message text (they can show on a
// locked phone): only who it is from and a link to open it.
//
// Needs the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets (and optionally
// VAPID_SUBJECT, a mailto: address). Without them it answers
// { ok: false, error: "not_configured" } and the portal hides the switch.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { ROLE_EMAILS } from "../_shared/contacts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || `mailto:${ROLE_EMAILS.general}`;

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Payload = { title: string; body: string; url: string; tag: string };

async function sendTo(userIds: string[], payload: (userId: string) => Promise<Payload>): Promise<number> {
  if (userIds.length === 0) return 0;
  const { data } = await serviceClient.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  const subs = (data as Sub[] | null) || [];
  let sent = 0;
  for (const s of subs) {
    try {
      const p = await payload(s.user_id);
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 60 * 60 * 24 });
      sent++;
      await serviceClient.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      // 404/410: the device unsubscribed or the browser dropped it; forget it.
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await serviceClient.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

/** Where a person reads their messages: families in /family, teachers in /teach, office in /admin. */
async function inboxFor(userId: string, isParentInThread: boolean): Promise<string> {
  if (isParentInThread) return "/family/messages";
  const { data } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as { role: string }[] | null) || []).map((r) => r.role);
  if (roles.includes("student")) return "/student/messages";
  if (roles.includes("teacher") || roles.includes("teaching_assistant_cover")) return "/teach/messages";
  if (roles.some((r) => r === "head_teacher" || r === "admin" || r === "admissions")) return "/admin/messages";
  return "/family/messages";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method" }, 405);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return jsonResponse({ ok: false, error: "not_configured" });
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "unauthorised" }, 401);
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await caller.auth.getUser();
  const me = who?.user?.id;
  if (!me) return jsonResponse({ ok: false, error: "unauthorised" }, 401);

  let body: { kind?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "bad_request" }, 400);
  }

  if (body.kind === "test") {
    const sent = await sendTo([me], async () => ({ title: "Notifications are on", body: "You'll hear about new messages here.", url: "/", tag: "tga-test" }));
    return jsonResponse({ ok: true, sent });
  }

  if (body.kind === "message" && body.id) {
    const { data: msg } = await serviceClient
      .from("message_thread_messages")
      .select("id, sender_id, thread_id, message_threads(id, parent_id, teacher_id, staff_a_id, staff_b_id)")
      .eq("id", body.id)
      .maybeSingle();
    const m = msg as unknown as { sender_id: string; thread_id: string; message_threads: { parent_id: string | null; teacher_id: string | null; staff_a_id: string | null; staff_b_id: string | null } | null } | null;
    // Only the sender can trigger the notification for their own message.
    if (!m || m.sender_id !== me || !m.message_threads) return jsonResponse({ ok: false, error: "not_found" }, 404);
    const t = m.message_threads;
    const ids = new Set([t.parent_id, t.teacher_id, t.staff_a_id, t.staff_b_id].filter((x): x is string => !!x));
    // Groups (0204): everyone who can read the message (a parent's or pupil's
    // message reaches only the staff in the group).
    const { data: mem } = await serviceClient.from("message_thread_members").select("user_id, member_role").eq("thread_id", m.thread_id);
    const members = (mem as { user_id: string; member_role: string }[] | null) || [];
    const senderIsStaff = members.find((x) => x.user_id === me)?.member_role === "staff";
    members.filter((x) => senderIsStaff || x.member_role === "staff").forEach((x) => ids.add(x.user_id));
    ids.delete(me);
    // Muted conversations (0205) are never pushed.
    const { data: mutes } = await serviceClient.from("message_thread_mutes").select("user_id").eq("thread_id", m.thread_id);
    ((mutes as { user_id: string }[] | null) || []).forEach((x) => ids.delete(x.user_id));
    const others = [...ids];
    const { data: sender } = await serviceClient.from("profiles").select("full_name").eq("id", me).maybeSingle();
    const from = ((sender as { full_name?: string } | null)?.full_name || "the school").trim();
    const sent = await sendTo([...new Set(others)], async (uid) => ({
      title: "New message",
      body: `From ${from}. Open the portal to read it.`,
      url: `${await inboxFor(uid, uid === t.parent_id)}?thread=${m.thread_id}`,
      tag: `tga-thread-${m.thread_id}`,
    }));
    return jsonResponse({ ok: true, sent });
  }

  return jsonResponse({ ok: false, error: "bad_request" }, 400);
});
