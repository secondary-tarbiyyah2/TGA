// Public admissions-call booking. Deployed with verify_jwt = false (see
// supabase/config.toml) since anonymous visitors call this with no session, 
// spam protection is the honeypot + timing + rate-limit checks below, not JWT
// auth. Uses the service-role key so it can insert into bookings, whose RLS
// deliberately has no anon/authenticated INSERT policy (see migration).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { buildIcs } from "../_shared/ics.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";
import { escapeHtml as esc } from "../_shared/auth.ts";
import { generateToken, hashToken } from "../_shared/manageToken.ts";
import { hashIp, isRateLimited, recordAttempt } from "../_shared/spam.ts";

const ADMISSIONS_TEAMS_URL = Deno.env.get("ADMISSIONS_TEAMS_URL") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://globalacademy.tarbiyyah.co.uk";
const ADMISSIONS_EMAIL = Deno.env.get("ADMISSIONS_EMAIL") || "globalacademy@tarbiyyah.co.uk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  // Honeypot: a real visitor never fills this hidden field. Accept
  // silently (200) so bots don't retry, but do nothing.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return jsonResponse({ ok: true });
  }

  // Minimum time-to-submit: the form must have been visible for at least
  // 3 seconds. formRenderedAt is a client timestamp (ms) set when the page
  // loaded; a bot that submits instantly fails this.
  const renderedAt = Number(body.formRenderedAt);
  if (!renderedAt || Date.now() - renderedAt < 3000) {
    return jsonResponse({ ok: false, error: "validation", fields: ["form"] }, 400);
  }

  const parentName = String(body.parentName || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const country = String(body.country || "").trim();
  const yearGroups = String(body.yearGroups || "").trim();
  const notes = String(body.notes || "").trim();
  const consent = Boolean(body.consent);
  const staffId = String(body.staffId || "");
  const slotStart = String(body.slotStart || "");
  const slotEnd = String(body.slotEnd || "");

  const errors: string[] = [];
  if (!parentName) errors.push("parentName");
  if (!email || !isValidEmail(email)) errors.push("email");
  if ((phone.match(/\d/g)?.length ?? 0) < 7) errors.push("phone");
  if (!country) errors.push("country");
  if (!yearGroups) errors.push("yearGroups");
  if (!consent) errors.push("consent");
  if (!staffId || !slotStart || !slotEnd) errors.push("slot");

  // Length caps: these go into emails and the bookings row.
  if (parentName.length > 120 || email.length > 254 || phone.length > 40 || country.length > 80 || yearGroups.length > 120 || notes.length > 2000) errors.push("length");
  // The slot must be a real, future, correctly-shaped time.
  const startMs = Date.parse(slotStart);
  const endMs = Date.parse(slotEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || startMs < Date.now()) errors.push("slot");

  if (errors.length) return jsonResponse({ ok: false, error: "validation", fields: errors }, 400);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = await hashIp(ip);

  if (await isRateLimited(supabase, ipHash, email)) {
    return jsonResponse({ ok: false, error: "rate_limited" }, 429);
  }
  await recordAttempt(supabase, ipHash, email);

  // Re-check the slot is still free and insert, inside one round trip. The
  // exclusion constraint (bookings_no_staff_overlap) is the real guarantee
  // against a race, this check is just to return a friendly "slot taken"
  // error rather than a raw constraint-violation error when it happens.
  const { data: staff, error: staffErr } = await supabase
    .from("staff_members")
    .select("id, display_name, teams_meeting_url, profiles!inner(email, full_name)")
    .eq("id", staffId)
    .single();

  if (staffErr || !staff) return jsonResponse({ ok: false, error: "unknown_staff" }, 400);

  // The slot must be one the booking page could have offered: produced by
  // get_open_slots for this staff member (which applies their availability,
  // exceptions, the meeting type's duration and existing bookings). Without
  // this, anyone could book any length of time against any staff member.
  const slotDay = new Date(startMs).toISOString().slice(0, 10);
  const { data: openSlots, error: slotsErr } = await supabase.rpc("get_open_slots", {
    p_meeting_type: "admissions",
    p_staff_id: staffId,
    p_from: slotDay,
    p_to: slotDay,
  });
  if (slotsErr) {
    console.error("book-admissions-call get_open_slots:", slotsErr.message);
    return jsonResponse({ ok: false, error: "slot_check_failed" }, 500);
  }
  const offered = (openSlots || []).some(
    (slot: { slot_start: string; slot_end: string }) => Date.parse(slot.slot_start) === startMs && Date.parse(slot.slot_end) === endMs,
  );
  if (!offered) return jsonResponse({ ok: false, error: "slot_taken" }, 409);

  const teamsUrl = staff.teams_meeting_url || ADMISSIONS_TEAMS_URL;
  if (!teamsUrl) return jsonResponse({ ok: false, error: "no_meeting_link_configured" }, 500);

  const manageToken = generateToken();
  const manageTokenHash = await hashToken(manageToken);

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      meeting_type: "admissions",
      staff_id: staffId,
      starts_at: slotStart,
      ends_at: slotEnd,
      status: "confirmed",
      contact_name: parentName,
      contact_email: email,
      contact_phone: phone,
      notes: [`Country: ${country}`, `Year group(s): ${yearGroups}`, notes].filter(Boolean).join("\n"),
      teams_join_url: teamsUrl,
      manage_token_hash: manageTokenHash,
    })
    .select()
    .single();

  if (insertErr) {
    // 23P01 = exclusion_violation, i.e. the exact "someone else just took
    // this slot" race, the one case get_open_slots alone can't prevent.
    if (insertErr.code === "23P01") {
      return jsonResponse({ ok: false, error: "slot_taken" }, 409);
    }
    console.error("book-admissions-call insert:", insertErr.message);
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  const manageUrl = `${SITE_URL}/manage-booking?token=${manageToken}`;
  const startsAt = new Date(slotStart);
  const endsAt = new Date(slotEnd);
  const whenText = startsAt.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";

  const ics = buildIcs({
    uid: `booking-${booking.id}@globalacademy.tarbiyyah.co.uk`,
    title: "Admissions call | Tarbiyyah Global Academy",
    description: `Join on Microsoft Teams: ${teamsUrl}\n\nManage this booking: ${manageUrl}`,
    location: teamsUrl,
    startsAt,
    endsAt,
    organizerEmail: ADMISSIONS_EMAIL,
    attendeeEmail: email,
  });

  // Never let a failed send block the booking (it's already saved) · but
  // previously a failure here was completely invisible: sendEmail() never
  // throws, and the result was discarded, so "the parent never got an
  // email" had no trace anywhere. Logging it means it now shows up in
  // `supabase functions logs book-admissions-call` (or the Studio's Edge
  // Function logs), which is the only way to tell "Resend rejected it"
  // (e.g. an unverified sending domain) apart from "it sent fine".
  const parentEmailResult = await sendEmail({
    to: email,
    toName: parentName,
    subject: "Your admissions call is confirmed | Tarbiyyah Global Academy",
    html: emailShell(`
      <h1 style="font-size:20px;margin:0 0 16px;">Your call is confirmed</h1>
      <p>Assalamu alaikum ${esc(parentName.split(" ")[0])},</p>
      <p>Your admissions call is booked for <strong>${whenText}</strong>.</p>
      <p><a href="${teamsUrl}" style="color:#5E4B1E;">Join on Microsoft Teams</a>. No download needed, just click the link at the time of your call.</p>
      <p>Need to change or cancel? <a href="${manageUrl}" style="color:#5E4B1E;">Manage your booking</a>.</p>
      <p>We look forward to speaking with you.</p>
    `),
    icsContent: ics,
    icsFilename: "admissions-call.ics",
  });
  if (!parentEmailResult.ok) {
    console.error(`booking ${booking.id}: confirmation email to parent failed: ${parentEmailResult.detail}`);
  }

  const staffEmailResult = await sendEmail({
    to: staff.profiles.email,
    toName: staff.profiles.full_name,
    subject: `New admissions call · ${parentName.replace(/[\r\n]/g, " ")}`,
    html: emailShell(`
      <h1 style="font-size:20px;margin:0 0 16px;">New admissions call booked</h1>
      <p><strong>${whenText}</strong></p>
      <p>Parent: ${esc(parentName)} (${esc(email)}, ${esc(phone)})</p>
      <p>Country: ${esc(country)}</p>
      <p>Year group(s): ${esc(yearGroups)}</p>
      ${notes ? `<p>Notes: ${esc(notes).replace(/\n/g, "<br/>")}</p>` : ""}
    `),
    icsContent: ics,
    icsFilename: "admissions-call.ics",
  });
  if (!staffEmailResult.ok) {
    console.error(`booking ${booking.id}: notification email to staff (${staff.profiles.email}) failed: ${staffEmailResult.detail}`);
  }

  return jsonResponse({ ok: true, bookingId: booking.id, parentEmailSent: parentEmailResult.ok, staffEmailSent: staffEmailResult.ok });
});
