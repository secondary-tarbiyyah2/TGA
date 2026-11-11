// Emails a parent-evening booking confirmation (or cancellation) to the
// parent, with a calendar invite, and tells the teacher. Called by the portal
// right after the book / cancel / rebook RPC succeeds. Deployed WITH JWT
// verification; it separately checks the caller is the booking's parent, its
// teacher, or Head Teacher/Admin, and that the booking really is in the state
// being announced and was changed in the last 15 minutes, so it can't be
// used to send arbitrary or repeated email.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { buildIcs } from "../_shared/ics.ts";
import { ROLE_EMAILS } from "../_shared/contacts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

const RECENT_MS = 15 * 60 * 1000;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function when(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await callerClient.auth.getUser();
  if (!userData?.user) return jsonResponse({ ok: false, error: "forbidden" }, 403);
  const userId = userData.user.id;

  let body: { booking_id?: string; event?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const bookingId = body.booking_id;
  const event = body.event === "cancelled" ? "cancelled" : body.event === "booked" ? "booked" : null;
  if (!bookingId || !event) return jsonResponse({ ok: false, error: "missing_fields" }, 400);

  const { data: b } = await serviceClient
    .from("parent_evening_bookings")
    .select("id, evening_id, teacher_id, child_id, parent_user_id, slot_start, slot_end, status, booked_at, cancelled_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return jsonResponse({ ok: false, error: "booking_not_found" }, 404);

  const { data: roles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId).eq("scope_type", "none");
  const isHead = (roles || []).some((r) => r.role === "head_teacher" || r.role === "admin");
  if (!(userId === b.parent_user_id || userId === b.teacher_id || isHead)) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  if (b.status !== event) return jsonResponse({ ok: false, error: "state_mismatch" }, 409);
  const changedAt = new Date((event === "booked" ? b.booked_at : b.cancelled_at) as string).getTime();
  if (!changedAt || Date.now() - changedAt > RECENT_MS) return jsonResponse({ ok: false, error: "too_old" }, 409);

  const [{ data: evening }, { data: teacherRow }, { data: parent }, { data: teacher }, { data: child }] = await Promise.all([
    serviceClient.from("parent_evenings").select("title, location, join_url").eq("id", b.evening_id).maybeSingle(),
    serviceClient.from("parent_evening_teachers").select("join_url").eq("evening_id", b.evening_id).eq("teacher_id", b.teacher_id).maybeSingle(),
    serviceClient.from("profiles").select("full_name, email").eq("id", b.parent_user_id).maybeSingle(),
    serviceClient.from("profiles").select("full_name, email").eq("id", b.teacher_id).maybeSingle(),
    serviceClient.from("children").select("name").eq("id", b.child_id).maybeSingle(),
  ]);
  if (!evening || !parent?.email) return jsonResponse({ ok: false, error: "booking_not_found" }, 404);

  const start = new Date(b.slot_start as string);
  const end = new Date(b.slot_end as string);
  const joinUrl = (teacherRow?.join_url as string | null) || (evening.join_url as string | null) || "";
  const location = (evening.location as string | null) || "";
  const childName = (child?.name as string | undefined) || "your child";
  const teacherName = (teacher?.full_name as string | undefined) || "the teacher";
  const title = evening.title as string;
  const organizer = Deno.env.get("ADMISSIONS_EMAIL") || ROLE_EMAILS.admissions;

  const details = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:15px;">
      <tr><td style="padding:2px 12px 2px 0;color:#777;">Teacher</td><td>${esc(teacherName)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#777;">About</td><td>${esc(childName)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#777;">When</td><td>${esc(when(start))} (${(end.getTime() - start.getTime()) / 60000} minutes, UK time)</td></tr>
      ${location ? `<tr><td style="padding:2px 12px 2px 0;color:#777;">Where</td><td>${esc(location)}</td></tr>` : ""}
    </table>`;

  let parentResult: { ok: boolean; detail: string };
  if (event === "booked") {
    const link = joinUrl
      ? `<p style="margin:16px 0;"><a href="${esc(joinUrl)}" style="background:#B08E45;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Join the meeting</a></p>`
      : "";
    parentResult = await sendEmail({
      to: parent.email as string,
      toName: parent.full_name as string,
      subject: `Booked: ${title} with ${teacherName}`,
      html: emailShell(
        `<h2 style="margin:0 0 8px;font-size:20px;">Your parent-evening slot is booked</h2>
         <p style="margin:0;">Assalamu alaikum ${esc((parent.full_name as string) || "")}, this confirms your meeting for <strong>${esc(title)}</strong>.</p>
         ${details}${link}
         <p style="margin:0;color:#555;font-size:14px;">You can change or cancel the slot from the Parent evenings page in the family portal.</p>`
      ),
      icsContent: buildIcs({
        uid: `parent-evening-${b.id}@globalacademy.tarbiyyah.co.uk`,
        title: `${title}: ${teacherName}`,
        description: `Parent-evening meeting with ${teacherName} about ${childName}.${joinUrl ? ` Join: ${joinUrl}` : ""}`,
        location: joinUrl || location || "Tarbiyyah Global Academy",
        startsAt: start,
        endsAt: end,
        organizerEmail: organizer,
        attendeeEmail: parent.email as string,
        method: "REQUEST",
        sequence: 0,
      }),
      icsFilename: "parent-evening.ics",
    });
  } else {
    parentResult = await sendEmail({
      to: parent.email as string,
      toName: parent.full_name as string,
      subject: `Cancelled: ${title} with ${teacherName}`,
      html: emailShell(
        `<h2 style="margin:0 0 8px;font-size:20px;">Your parent-evening slot was cancelled</h2>
         <p style="margin:0;">The following meeting for <strong>${esc(title)}</strong> will no longer take place.</p>
         ${details}
         <p style="margin:0;color:#555;font-size:14px;">You can book another time from the Parent evenings page in the family portal.</p>`
      ),
      icsContent: buildIcs({
        uid: `parent-evening-${b.id}@globalacademy.tarbiyyah.co.uk`,
        title: `${title}: ${teacherName}`,
        description: `Cancelled parent-evening meeting with ${teacherName}.`,
        location: location || "Tarbiyyah Global Academy",
        startsAt: start,
        endsAt: end,
        organizerEmail: organizer,
        attendeeEmail: parent.email as string,
        method: "CANCEL",
        sequence: 1,
      }),
      icsFilename: "parent-evening-cancelled.ics",
    });
  }

  // Let the teacher know too (best effort; never fails the call).
  let teacherSent = false;
  if (teacher?.email && userId !== b.teacher_id) {
    const r = await sendEmail({
      to: teacher.email as string,
      toName: teacher.full_name as string,
      subject: `${event === "booked" ? "New booking" : "Cancelled"}: ${title}, ${when(start)}`,
      html: emailShell(
        `<h2 style="margin:0 0 8px;font-size:20px;">${event === "booked" ? "A parent booked a slot with you" : "A parent-evening slot was cancelled"}</h2>
         <p style="margin:0;">${esc((parent.full_name as string) || "A parent")} ${event === "booked" ? "booked" : "cancelled"} a meeting about ${esc(childName)} for <strong>${esc(title)}</strong>.</p>
         <p style="margin:12px 0 0;">${esc(when(start))} (UK time)</p>`
      ),
    });
    teacherSent = r.ok;
  }

  if (!parentResult.ok) return jsonResponse({ ok: false, error: "email_failed", detail: parentResult.detail }, 502);
  return jsonResponse({ ok: true, parent_sent: true, teacher_sent: teacherSent });
});
