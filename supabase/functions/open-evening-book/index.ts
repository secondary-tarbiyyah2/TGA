// Public open-evening booking. Deployed with verify_jwt = false (see
// supabase/config.toml): anonymous parents call this with no session. Spam
// protection is the honeypot, minimum fill-in time and per-IP/per-email rate
// limit below. The booking itself is made by the open_evening_book() database
// function (service role only), which locks the session and refuses anything
// that would exceed capacity, so concurrent requests can never overbook.
//
// POST { sessionId, parentName, email, phone?, attendees, yearGroups,
//        questions?, consent, formRenderedAt, company (honeypot, must be empty) }
//  -> { ok: true, bookingId, emailSent }
//  -> { ok: false, error: "validation" | "rate_limited" | "full" | "already_booked"
//                       | "session_unavailable", fields?, seatsLeft? }
//
// On success the parent gets a confirmation (with an .ics and the join link)
// and the admissions inbox (ADMISSIONS_EMAIL) gets a notification.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { buildIcs } from "../_shared/ics.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { hashIp, isRateLimited, recordAttempt } from "../_shared/spam.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";

const SITE_URL = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const ukWhen = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  // Self-service cancel from the confirmation email: { action: "cancel", token }.
  if (body.action === "cancel") {
    const token = String(body.token || "");
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return jsonResponse({ ok: false, error: "invalid_token" }, 400);
    const tokenHash = await hashToken(token);
    const { data: b } = await supabase
      .from("open_evening_bookings")
      .select("id, status, parent_name, email, session_id, open_evening_sessions(title, starts_at)")
      .eq("manage_token_hash", tokenHash)
      .maybeSingle();
    if (!b) return jsonResponse({ ok: false, error: "not_found" }, 404);
    const bk = b as unknown as { id: string; status: string; parent_name: string; email: string; open_evening_sessions: { title: string; starts_at: string } | null };
    if (bk.status === "cancelled") return jsonResponse({ ok: true, already: true, title: bk.open_evening_sessions?.title });
    const { error } = await supabase.from("open_evening_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", bk.id);
    if (error) return jsonResponse({ ok: false, error: "cancel_failed" }, 500);
    await sendEmail({
      to: bk.email, toName: bk.parent_name,
      subject: `Your place is cancelled: ${bk.open_evening_sessions?.title ?? "open evening"} | Tarbiyyah Global Academy`,
      html: emailShell(`<h1 style="font-size:20px;margin:0 0 16px;">Your place is cancelled</h1><p>Assalamu alaikum ${esc(bk.parent_name.split(" ")[0])},</p><p>We have cancelled your place at <strong>${esc(bk.open_evening_sessions?.title ?? "the open evening")}</strong>. You are welcome to <a href="${SITE_URL}/open-evening/" style="color:#5E4B1E;">book another session</a> at any time.</p>`),
    });
    return jsonResponse({ ok: true, title: bk.open_evening_sessions?.title, startsAt: bk.open_evening_sessions?.starts_at });
  }

  // Honeypot: a real visitor never fills this hidden field. Accept silently
  // (200) so bots don't retry, but do nothing.
  if (typeof body.company === "string" && body.company.trim() !== "") return jsonResponse({ ok: true });

  // Minimum time-to-submit: the form must have been visible for 3 seconds.
  const renderedAt = Number(body.formRenderedAt);
  if (!renderedAt || Date.now() - renderedAt < 3000) return jsonResponse({ ok: false, error: "validation", fields: ["form"] }, 400);

  const sessionId = String(body.sessionId || "");
  const parentName = String(body.parentName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const attendees = Number(body.attendees);
  const yearGroups = String(body.yearGroups || "").trim();
  const questions = String(body.questions || "").trim();
  const consent = Boolean(body.consent);

  const errors: string[] = [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) errors.push("sessionId");
  if (!parentName || parentName.length > 120) errors.push("parentName");
  if (!isValidEmail(email)) errors.push("email");
  if (phone && ((phone.match(/\d/g)?.length ?? 0) < 7 || phone.length > 40)) errors.push("phone");
  if (!Number.isInteger(attendees) || attendees < 1 || attendees > 6) errors.push("attendees");
  if (!yearGroups || yearGroups.length > 200) errors.push("yearGroups");
  if (questions.length > 2000) errors.push("questions");
  if (!consent) errors.push("consent");
  if (errors.length) return jsonResponse({ ok: false, error: "validation", fields: errors }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = await hashIp(ip);
  if (await isRateLimited(supabase, ipHash, email)) return jsonResponse({ ok: false, error: "rate_limited" }, 429);
  await recordAttempt(supabase, ipHash, email);

  const { data: result, error: rpcError } = await supabase.rpc("open_evening_book", {
    p_session_id: sessionId,
    p_parent_name: parentName,
    p_email: email,
    p_phone: phone || null,
    p_attendees: attendees,
    p_year_groups: yearGroups,
    p_questions: questions || null,
    p_ip_hash: ipHash,
  });
  if (rpcError || !result) {
    console.error("open-evening-book: rpc failed", rpcError?.message);
    return jsonResponse({ ok: false, error: "booking_failed" }, 500);
  }
  const r = result as { ok: boolean; error?: string; fields?: string[]; booking_id?: string; seats_left?: number };
  if (!r.ok) {
    const status = r.error === "validation" ? 400 : 409;
    return jsonResponse({ ok: false, error: r.error, fields: r.fields, seatsLeft: r.seats_left }, status);
  }

  const bookingId = r.booking_id as string;
  // Self-service link: store only the hash, send the token in the email.
  const manageToken = generateToken();
  const manageUrl = `${SITE_URL}/open-evening/manage/?token=${manageToken}`;
  const { data: session } = await supabase
    .from("open_evening_sessions")
    .select("title, description, starts_at, ends_at, join_url")
    .eq("id", sessionId)
    .single();
  // notified_starts_at: the time this family has been told. If an admin later
  // moves the session, open-evening-reminders sends a "new date" notice.
  await supabase
    .from("open_evening_bookings")
    .update({ manage_token_hash: await hashToken(manageToken), notified_starts_at: session?.starts_at ?? null })
    .eq("id", bookingId);

  // The booking is already saved. Everything below is best effort and never
  // changes the answer the parent sees, but failures are logged so "I never
  // got an email" can be traced in the function logs.
  let emailSent = false;
  if (session) {
    const when = ukWhen(session.starts_at as string);
    // The hidden sample-lesson page is linked only once the school has set a
    // recording URL in site settings (/learn/admin/content -> Site settings).
    const { data: siteRow } = await supabase.from("site_settings").select("sample_lesson_video_url").eq("id", true).maybeSingle();
    const sampleLessonReady = !!(siteRow && (siteRow as { sample_lesson_video_url: string | null }).sample_lesson_video_url);
    const joinUrl = (session.join_url as string | null) || "";
    const title = session.title as string;
    const ics = buildIcs({
      uid: `open-evening-${bookingId}@globalacademy.tarbiyyah.co.uk`,
      title: `${title} | Tarbiyyah Global Academy`,
      description: joinUrl ? `Join online: ${joinUrl}` : `Details: ${SITE_URL}/open-evening`,
      location: joinUrl || "Online",
      startsAt: new Date(session.starts_at as string),
      endsAt: new Date(session.ends_at as string),
      organizerEmail: ADMISSIONS_EMAIL,
      attendeeEmail: email,
    });

    const parentResult = await sendEmail({
      to: email,
      toName: parentName,
      subject: `Your place is booked: ${title} | Tarbiyyah Global Academy`,
      html: emailShell(`
        <h1 style="font-size:20px;margin:0 0 16px;">Your place is booked</h1>
        <p>Assalamu alaikum ${esc(parentName.split(" ")[0])},</p>
        <p>Thank you for booking <strong>${esc(title)}</strong>. We have reserved ${attendees === 1 ? "1 place" : `${attendees} places`} for you on <strong>${esc(when)}</strong>.</p>
        ${joinUrl ? `<p><a href="${esc(joinUrl)}" style="color:#5E4B1E;">Join the open evening online</a>. No download is needed; just click the link at the time.</p>` : `<p>We will email you the joining link before the evening.</p>`}
        <p>The calendar invitation is attached. We will also send you a reminder the day before.</p>
        ${sampleLessonReady ? `<p>Before the evening, you can <a href="${SITE_URL}/sample-lesson/" style="color:#5E4B1E;">watch a recording of a real live lesson</a> (please keep the link within your family).</p>` : ""}
        <p>You may also like to read our <a href="${SITE_URL}/prospectus/TGA-Prospectus-2026-27.pdf" style="color:#5E4B1E;">prospectus</a> beforehand.</p>
        <p>If you can no longer come, <a href="${manageUrl}" style="color:#5E4B1E;">cancel your place here</a> so that someone else can have it, no need to email. You can book a different session from the open evenings page.</p>
        <p>We look forward to meeting you.</p>
      `),
      icsContent: ics,
      icsFilename: "open-evening.ics",
    });
    emailSent = parentResult.ok;
    if (!parentResult.ok) console.error(`open-evening-book ${bookingId}: confirmation to ${email} failed: ${parentResult.detail}`);
    else await supabase.from("open_evening_bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", bookingId);

    const adminResult = await sendEmail({
      to: ADMISSIONS_EMAIL,
      subject: `New open evening booking: ${parentName} (${attendees})`,
      html: emailShell(`
        <h1 style="font-size:20px;margin:0 0 16px;">New open evening booking</h1>
        <p><strong>${esc(title)}</strong><br>${esc(when)}</p>
        <p>Parent: ${esc(parentName)} (<a href="mailto:${esc(email)}">${esc(email)}</a>${phone ? `, ${esc(phone)}` : ""})<br>
        Attendees: ${attendees}<br>
        Children's year groups: ${esc(yearGroups)}<br>
        Spaces left: ${r.seats_left ?? 0}</p>
        ${questions ? `<p>Questions:<br>${esc(questions).replace(/\n/g, "<br>")}</p>` : ""}
      `),
    });
    if (!adminResult.ok) console.error(`open-evening-book ${bookingId}: admissions notification failed: ${adminResult.detail}`);
  }

  return jsonResponse({ ok: true, bookingId, emailSent });
});
